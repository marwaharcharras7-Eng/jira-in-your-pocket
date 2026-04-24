/**
 * Server functions exposing Jira data + AI analyses to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { searchIssues, type JiraIssue } from "../lib/jira";
import { updateJiraIssue } from "../lib/jira-write";
import {
  computeHealth,
  findDuplicates,
  groupByAssignee,
  groupByMachine,
  isMisclassified,
  isVague,
  daysSince,
  machineFromText,
} from "../lib/backlog";
import { callAI } from "../lib/ai";
import { requireSupabaseAuth } from "../integrations/supabase/auth-middleware";
import { supabaseAdmin } from "../integrations/supabase/client.server";

const PROJECT_KEY = "CMV";

export const getAllIssues = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const issues = await searchIssues(
      `project = ${PROJECT_KEY} ORDER BY updated DESC`,
      100,
    );
    return { issues, error: null as string | null };
  } catch (e) {
    console.error("getAllIssues error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { issues: [] as JiraIssue[], error: msg };
  }
});

export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const issues = await searchIssues(
      `project = ${PROJECT_KEY} ORDER BY updated DESC`,
      100,
    );
    const health = computeHealth(issues);
    const duplicates = findDuplicates(issues);
    const machines = groupByMachine(issues);
    const assignees = groupByAssignee(issues);

    const machineStats = Object.entries(machines)
      .map(([name, arr]) => ({
        name,
        total: arr.length,
        open: arr.filter((i) => i.fields.status.statusCategory.key !== "done").length,
        done: arr.filter((i) => i.fields.status.statusCategory.key === "done").length,
        high: arr.filter((i) => i.fields.priority?.name === "High").length,
      }))
      .sort((a, b) => {
        // Sort M01..M0N first, then Unassigned
        if (a.name === "Unassigned") return 1;
        if (b.name === "Unassigned") return -1;
        return a.name.localeCompare(b.name);
      });

    const statusBreakdown = issues.reduce(
      (acc, i) => {
        const k = i.fields.status.statusCategory.key;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const typeBreakdown = issues.reduce(
      (acc, i) => {
        const k = i.fields.issuetype.name;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      health,
      duplicateGroups: duplicates.length,
      machineStats,
      assignees,
      statusBreakdown,
      typeBreakdown,
      totalIssues: issues.length,
      error: null as string | null,
    };
  } catch (e) {
    console.error("getDashboardData error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return {
      health: null,
      duplicateGroups: 0,
      machineStats: [],
      assignees: [],
      statusBreakdown: {},
      typeBreakdown: {},
      totalIssues: 0,
      error: msg,
    };
  }
});

export const getDuplicates = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const issues = await searchIssues(
      `project = ${PROJECT_KEY} ORDER BY updated DESC`,
      100,
    );
    const groups = findDuplicates(issues);
    return { groups, error: null as string | null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { groups: [], error: msg };
  }
});

export const getProblemTickets = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const issues = await searchIssues(
      `project = ${PROJECT_KEY} ORDER BY updated DESC`,
      100,
    );
    const vague = issues.filter(
      (i) => isVague(i.fields.description) || i.fields.summary.trim().length < 12,
    );
    const misclassified = issues.filter(isMisclassified);
    const stale = issues.filter(
      (i) =>
        i.fields.status.statusCategory.key === "indeterminate" &&
        daysSince(i.fields.updated) > 2,
    );
    return {
      vague,
      misclassified,
      stale,
      error: null as string | null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { vague: [], misclassified: [], stale: [], error: msg };
  }
});

// ─── AI ENDPOINTS ──────────────────────────────────────────────────────────

export type RewriteResult = {
  newTitle: string;
  newDescription: string;
  acceptanceCriteria: string[];
  suggestedLabels: string[];
  reasoning: string;
};

export const rewriteTicket = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; summary: string; description: string | null }) => data)
  .handler(async ({ data }): Promise<{ result: RewriteResult | null; error: string | null }> => {
    try {
      const sys = `You are a senior maintenance engineer rewriting Jira tickets for an industrial machine maintenance team (machines M01-M07). 
For each ticket, produce a clean, professional ticket with:
- A clear, descriptive title (start with machine code if applicable, e.g. "M05 - ...")
- A detailed description (context, observed symptoms, business impact)
- 3-5 acceptance criteria in Given/When/Then format
- Suggested labels (maintenance type, machine, severity)
Respond ONLY by calling the rewrite_ticket function.`;
      const userPrompt = `Original ticket:
Key: ${data.key}
Title: ${data.summary}
Description: ${data.description ?? "(empty)"}

Rewrite it into a professional ticket.`;

      const result = await callAI({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "rewrite_ticket",
              description: "Return improved ticket fields",
              parameters: {
                type: "object",
                properties: {
                  newTitle: { type: "string" },
                  newDescription: { type: "string" },
                  acceptanceCriteria: { type: "array", items: { type: "string" } },
                  suggestedLabels: { type: "array", items: { type: "string" } },
                  reasoning: { type: "string" },
                },
                required: [
                  "newTitle",
                  "newDescription",
                  "acceptanceCriteria",
                  "suggestedLabels",
                  "reasoning",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "rewrite_ticket" } },
      });

      if (!result.toolCall) {
        return { result: null, error: "AI did not return structured result" };
      }
      return { result: result.toolCall.args as RewriteResult, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI call failed";
      return { result: null, error: msg };
    }
  });

export type ClassifyResult = {
  suggestedType: "Corrective" | "Preventive";
  confidence: number;
  reasoning: string;
  needsReclassification: boolean;
};

export const classifyTicket = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; summary: string; description: string | null; currentType: string }) => data)
  .handler(async ({ data }): Promise<{ result: ClassifyResult | null; error: string | null }> => {
    try {
      const sys = `You classify maintenance tickets for an industrial team. Types:
- Corrective: fixing something broken/failed (failures, breakdowns, errors observed)
- Preventive: scheduled maintenance to prevent issues (verifications, inspections, planned work)
Respond ONLY by calling classify_ticket.`;
      const result = await callAI({
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Title: ${data.summary}\nDescription: ${data.description ?? ""}\nCurrent type: ${data.currentType}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_ticket",
              description: "Return correct ticket type",
              parameters: {
                type: "object",
                properties: {
                  suggestedType: { type: "string", enum: ["Corrective", "Preventive"] },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  reasoning: { type: "string" },
                  needsReclassification: { type: "boolean" },
                },
                required: ["suggestedType", "confidence", "reasoning", "needsReclassification"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_ticket" } },
      });
      if (!result.toolCall) return { result: null, error: "AI did not return result" };
      return { result: result.toolCall.args as ClassifyResult, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI call failed";
      return { result: null, error: msg };
    }
  });

export const explainBlocker = createServerFn({ method: "POST" })
  .inputValidator((data: { key: string; summary: string; description: string | null; daysStuck: number }) => data)
  .handler(async ({ data }) => {
    try {
      const sys = `You analyze why a maintenance ticket is stuck "En cours". Be concrete and actionable. Suggest 2-3 next steps.`;
      const result = await callAI({
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Ticket ${data.key}\nTitle: ${data.summary}\nDescription: ${data.description ?? ""}\nStuck for ${data.daysStuck.toFixed(1)} days.`,
          },
        ],
      });
      return { content: result.content, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI call failed";
      return { content: null, error: msg };
    }
  });

export const askBacklog = createServerFn({ method: "POST" })
  .inputValidator((data: { question: string }) => data)
  .handler(async ({ data }) => {
    try {
      const issues = await searchIssues(
        `project = ${PROJECT_KEY} ORDER BY updated DESC`,
        100,
      );
      // Compact context
      const compact = issues.map((i) => ({
        key: i.key,
        title: i.fields.summary,
        status: i.fields.status.name,
        type: i.fields.issuetype.name,
        priority: i.fields.priority?.name ?? "—",
        assignee: i.fields.assignee?.displayName ?? "Unassigned",
        machine: machineFromText(i.fields.summary),
        daysSinceUpdate: daysSince(i.fields.updated).toFixed(1),
      }));

      const sys = `You are an AI analyst for the CMV (Computer Maintenance & Vision) Jira backlog. 
Answer the user's question using ONLY the data provided. 
Cite ticket keys (e.g. CMV-25) when referencing tickets. 
Be concise and use bullet points or tables in markdown.
If the question cannot be answered from the data, say so.`;

      const result = await callAI({
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Backlog data (JSON):\n${JSON.stringify(compact)}\n\nQuestion: ${data.question}`,
          },
        ],
      });
      return { content: result.content, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI call failed";
      return { content: null, error: msg };
    }
  });

// ─── MANAGER-ONLY: APPROVE & PUSH TO JIRA ──────────────────────────────────

export const approveAndPushToJira = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      key: string;
      summary: string;
      description: string;
      labels: string[];
      acceptanceCriteria: string[];
      assigneeAccountId?: string | null;
      assigneeDisplayName?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    try {
      // Verify caller is a manager
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "manager")
        .maybeSingle();

      if (!roleRow) {
        return { ok: false, error: "Only managers can approve and push to Jira" };
      }

      // Push to Jira
      await updateJiraIssue({
        key: data.key,
        summary: data.summary,
        description: data.description,
        labels: data.labels,
        acceptanceCriteria: data.acceptanceCriteria,
      });

      // Notify the assignee (technician) if mapped
      if (data.assigneeAccountId) {
        const { data: assigneeProfile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("jira_account_id", data.assigneeAccountId)
          .maybeSingle();

        if (assigneeProfile) {
          await supabaseAdmin.from("notifications").insert({
            user_id: assigneeProfile.id,
            type: "suggestion_approved",
            title: `Ticket ${data.key} updated`,
            message: `Your manager approved an AI rewrite: ${data.summary.slice(0, 80)}`,
            link: `https://bpmproject.atlassian.net/browse/${data.key}`,
          });
        }
      }

      // Self-notification (audit trail)
      await supabaseAdmin.from("notifications").insert({
        user_id: context.userId,
        type: "info",
        title: `Pushed ${data.key} to Jira`,
        message: `Successfully updated "${data.summary.slice(0, 80)}"`,
        link: `https://bpmproject.atlassian.net/browse/${data.key}`,
      });

      return { ok: true, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Push failed";
      return { ok: false, error: msg };
    }
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { role: (data?.role as "manager" | "technician" | undefined) ?? null };
  });
