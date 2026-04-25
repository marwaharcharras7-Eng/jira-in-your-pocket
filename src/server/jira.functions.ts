/**
 * Server functions exposing Jira data + AI analyses to the client.
 * All read endpoints honor the caller's role:
 *   - manager  → sees all CMV tickets
 *   - technician → sees only tickets assigned to their Jira accountId
 */
import { createServerFn } from "@tanstack/react-start";
import {
  fetchIssueDetail,
  getIssueUrl,
  searchIssues,
  searchIssuesWithChangelog,
  searchOpenIssuesWithSuggestions,
  type JiraIssue,
} from "../lib/jira";
import { approveJiraSuggestions, updateJiraIssue } from "../lib/jira-write";
import {
  computeHealth,
  findDuplicates,
  findRecurringProblems,
  groupByAssignee,
  groupByMachine,
  isMisclassified,
  isVague,
  daysSince,
  machineFromText,
  MIN_RECURRENCE,
} from "../lib/backlog";
import { callAI } from "../lib/ai";
import { requireSupabaseAuth } from "../integrations/supabase/auth-middleware";
import { supabaseAdmin } from "../integrations/supabase/client.server";

const PROJECT_KEY = "CMV";

// ─── VIEWER SCOPING ────────────────────────────────────────────────────────

type Viewer = {
  role: "manager" | "technician" | null;
  jiraAccountId: string | null;
  displayName: string | null;
};

async function resolveViewer(userId: string): Promise<Viewer> {
  const [{ data: roleRow }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("jira_account_id, display_name")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  return {
    role: (roleRow?.role as Viewer["role"]) ?? null,
    jiraAccountId: profile?.jira_account_id ?? null,
    displayName: profile?.display_name ?? null,
  };
}

async function requireManagerRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();

  if (!data) {
    throw new Error("Only managers can access this page");
  }
}

/** Build the JQL clause based on viewer role. Manager sees all; technician sees own. */
function jqlForViewer(viewer: Viewer): string {
  const base = `project = ${PROJECT_KEY}`;
  if (viewer.role === "technician" && viewer.jiraAccountId) {
    return `${base} AND assignee = "${viewer.jiraAccountId}" ORDER BY updated DESC`;
  }
  return `${base} ORDER BY updated DESC`;
}

async function fetchScopedIssues(viewer: Viewer): Promise<JiraIssue[]> {
  return searchIssues(jqlForViewer(viewer), 200);
}

// ─── READ ENDPOINTS (role-aware) ───────────────────────────────────────────

export const getAllIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const viewer = await resolveViewer(context.userId);
      const issues = await fetchScopedIssues(viewer);
      return { issues, viewer, error: null as string | null };
    } catch (e) {
      console.error("getAllIssues error", e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      return {
        issues: [] as JiraIssue[],
        viewer: { role: null, jiraAccountId: null, displayName: null } as Viewer,
        error: msg,
      };
    }
  });

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const viewer = await resolveViewer(context.userId);
      const issues = await fetchScopedIssues(viewer);
      const health = computeHealth(issues);
      const duplicates = findDuplicates(issues);
      const recurring = findRecurringProblems(issues);
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
          if (a.name === "Unassigned") return 1;
          if (b.name === "Unassigned") return -1;
          return a.name.localeCompare(b.name);
        });

      // Status breakdown using Jira's actual status names
      const statusBreakdown = issues.reduce(
        (acc, i) => {
          const k = i.fields.status.name; // "Open", "Scheduled", "In Progress", "In Review", "Closed"
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
        recurringCount: recurring.length,
        recurringTotalTickets: recurring.reduce((a, r) => a + r.count, 0),
        machineStats,
        assignees,
        statusBreakdown,
        typeBreakdown,
        totalIssues: issues.length,
        viewer,
        error: null as string | null,
      };
    } catch (e) {
      console.error("getDashboardData error", e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      return {
        health: null,
        duplicateGroups: 0,
        recurringCount: 0,
        recurringTotalTickets: 0,
        machineStats: [],
        assignees: [],
        statusBreakdown: {},
        typeBreakdown: {},
        totalIssues: 0,
        viewer: { role: null, jiraAccountId: null, displayName: null } as Viewer,
        error: msg,
      };
    }
  });

export const getDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const viewer = await resolveViewer(context.userId);
      const issues = await fetchScopedIssues(viewer);
      const groups = findDuplicates(issues);
      return { groups, viewer, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return {
        groups: [],
        viewer: { role: null, jiraAccountId: null, displayName: null } as Viewer,
        error: msg,
      };
    }
  });

export const getRecurringProblems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const viewer = await resolveViewer(context.userId);
      const issues = await fetchScopedIssues(viewer);
      const problems = findRecurringProblems(issues);
      return { problems, threshold: MIN_RECURRENCE, viewer, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return {
        problems: [],
        threshold: MIN_RECURRENCE,
        viewer: { role: null, jiraAccountId: null, displayName: null } as Viewer,
        error: msg,
      };
    }
  });

export const getProblemTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const viewer = await resolveViewer(context.userId);
      const issues = await fetchScopedIssues(viewer);
      const vague = issues.filter(
        (i) => isVague(i.fields.description) || i.fields.summary.trim().length < 12,
      );
      const misclassified = issues.filter(isMisclassified);
      const stale = issues.filter(
        (i) =>
          i.fields.status.statusCategory.key === "indeterminate" &&
          daysSince(i.fields.updated) > 2,
      );
      return { vague, misclassified, stale, viewer, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return {
        vague: [],
        misclassified: [],
        stale: [],
        viewer: { role: null, jiraAccountId: null, displayName: null } as Viewer,
        error: msg,
      };
    }
  });

export const getManagerSuggestionTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await requireManagerRole(context.userId);
      const issues = await searchOpenIssuesWithSuggestions();
      const suggestions = issues.filter(
        (issue) =>
          issue.fields.customfield_10371 ||
          issue.fields.customfield_10372 ||
          issue.fields.customfield_10452 ||
          issue.fields.customfield_10383 ||
          issue.fields.customfield_10453 != null ||
          issue.fields.customfield_10376 != null,
      );

      return { issues: suggestions, error: null as string | null };
    } catch (e) {
      return {
        issues: [] as JiraIssue[],
        error: e instanceof Error ? e.message : "Failed to load suggestions",
      };
    }
  });

export const approveManagerSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      key: string;
      suggestedPriority?: string | null;
      suggestedClassification?: string | null;
      suggestedAssignee?: string | null;
      suggestedSlaMinutes?: number | null;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    try {
      await requireManagerRole(context.userId);

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, jira_email, jira_account_id");

      const normalizedAssignee = (data.suggestedAssignee ?? "").trim().toLowerCase();
      const assigneeProfile = (profiles ?? []).find((profile) => {
        const candidates = [
          profile.display_name,
          profile.email,
          profile.jira_email,
          profile.email?.split("@")[0],
          profile.jira_email?.split("@")[0],
        ]
          .filter(Boolean)
          .map((value) => value!.trim().toLowerCase());

        return normalizedAssignee.length > 0 && candidates.includes(normalizedAssignee);
      });

      await approveJiraSuggestions({
        key: data.key,
        priorityName: data.suggestedPriority ?? null,
        typeName: data.suggestedClassification ?? null,
        assigneeAccountId: assigneeProfile?.jira_account_id ?? null,
        slaTargetMinutes: data.suggestedSlaMinutes ?? null,
      });

      return { ok: true, error: null as string | null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Approval failed" };
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
      const sys = `You are a senior maintenance engineer rewriting Jira tickets for an industrial machine maintenance team (machines M01-M07). Reply 100% in ENGLISH.
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

Rewrite it into a professional ticket in English.`;

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
      const sys = `You classify maintenance tickets for an industrial team. Reply in English. Types:
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
      const sys = `You analyze why a maintenance ticket is stuck "In Progress". Reply in English. Be concrete and actionable. Suggest 2-3 next steps.`;
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
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { question: string }) => data)
  .handler(async ({ data, context }) => {
    try {
      const viewer = await resolveViewer(context.userId);
      const issues = await fetchScopedIssues(viewer);

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

      const scopeNote =
        viewer.role === "technician"
          ? `The viewer is a TECHNICIAN named ${viewer.displayName ?? "(unknown)"}. The data below contains ONLY their own assigned tickets. Frame answers as "your tickets".`
          : `The viewer is the MAINTENANCE MANAGER. The data below contains ALL CMV tickets across the team.`;

      const sys = `You are an AI analyst for the CMV (Computer Maintenance & Vision) Jira backlog. Reply 100% in ENGLISH.
${scopeNote}
Answer the user's question using ONLY the data provided.
Cite ticket keys (e.g. CMV-25) when referencing tickets.
Be concise and use bullet points or markdown tables.
If the question cannot be answered from the data, say so clearly.`;

      const result = await callAI({
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Backlog data (JSON):\n${JSON.stringify(compact)}\n\nQuestion: ${data.question}`,
          },
        ],
      });
      return { content: result.content, viewer, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI call failed";
      return {
        content: null,
        viewer: { role: null, jiraAccountId: null, displayName: null } as Viewer,
        error: msg,
      };
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
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "manager")
        .maybeSingle();

      if (!roleRow) {
        return { ok: false, error: "Only managers can approve and push to Jira" };
      }

      await updateJiraIssue({
        key: data.key,
        summary: data.summary,
        description: data.description,
        labels: data.labels,
        acceptanceCriteria: data.acceptanceCriteria,
      });

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

// ─── Notification details (Jira email-like view) ──────────────────────────

export const getIssueDetailForNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string }) => d)
  .handler(async ({ data, context }) => {
    const viewer = await resolveViewer(context.userId);
    const detail = await fetchIssueDetail(data.key);

    // Authorization: technician can only view tickets assigned to them
    if (viewer.role === "technician") {
      if (!viewer.jiraAccountId || detail.assignee?.accountId !== viewer.jiraAccountId) {
        throw new Error("Not authorized to view this ticket");
      }
    }

    // Strip non-serializable ADF body — keep only plain text
    const safeDetail = {
      ...detail,
      comments: detail.comments.map((c) => ({
        id: c.id,
        author: c.author,
        bodyText: c.bodyText ?? "",
        created: c.created,
        updated: c.updated,
      })),
    };

    return { detail: safeDetail, jiraUrl: getIssueUrl(data.key) };
  });

// ─── MANAGER-ONLY: Per-technician performance KPIs ────────────────────────

export type TechPerformance = {
  accountId: string | null;
  name: string;
  avatar: string | null;
  total: number;
  open: number;
  inProgress: number;
  done: number;
  highPriority: number;
  staleInProgress: number;        // > 2 days "in progress"
  reopens: number;                // count of times status moved from Done back to non-Done on assigned tickets
  resolved: number;               // count of issues resolved (Done) by this assignee
  slaTracked: number;             // resolved issues with an SLA target set
  slaRespected: number;           // among slaTracked, those resolved within SLA window
  slaRespectPct: number;          // 0..100
  avgResolutionDays: number | null;
  workloadIndex: number;          // open + inProgress weighted by priority/stale
  performanceScore: number;       // 0..100, higher is better
};

function statusCategoryFromName(name: string): "todo" | "indeterminate" | "done" {
  const n = name.toLowerCase();
  if (["closed", "done", "resolved"].some((k) => n.includes(k))) return "done";
  if (["progress", "review", "scheduled"].some((k) => n.includes(k))) return "indeterminate";
  return "todo";
}

export const getTeamPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await requireManagerRole(context.userId);
      const issues = await searchIssuesWithChangelog(300);

      type Acc = TechPerformance & { _resolutionDaysSum: number };
      const map = new Map<string, Acc>();

      function ensure(key: string, name: string, avatar: string | null, accountId: string | null): Acc {
        let entry = map.get(key);
        if (!entry) {
          entry = {
            accountId,
            name,
            avatar,
            total: 0,
            open: 0,
            inProgress: 0,
            done: 0,
            highPriority: 0,
            staleInProgress: 0,
            reopens: 0,
            resolved: 0,
            slaTracked: 0,
            slaRespected: 0,
            slaRespectPct: 0,
            avgResolutionDays: null,
            workloadIndex: 0,
            performanceScore: 0,
            _resolutionDaysSum: 0,
          };
          map.set(key, entry);
        }
        return entry;
      }

      for (const issue of issues) {
        const a = issue.fields.assignee;
        const key = a?.displayName ?? "Unassigned";
        const entry = ensure(
          key,
          key,
          a?.avatarUrls?.["32x32"] ?? null,
          a?.accountId ?? null,
        );

        entry.total++;

        const cat = statusCategoryFromName(issue.fields.status.name);
        if (cat === "done") entry.done++;
        else if (cat === "indeterminate") entry.inProgress++;
        else entry.open++;

        if (issue.fields.priority?.name === "High") entry.highPriority++;
        if (cat === "indeterminate" && daysSince(issue.fields.updated) > 2) {
          entry.staleInProgress++;
        }

        // Reopens — count status changes from Done -> not Done in changelog
        const histories = issue.changelog?.histories ?? [];
        for (const h of histories) {
          for (const it of h.items ?? []) {
            if (it.field === "status") {
              const fromDone = statusCategoryFromName(it.fromString ?? "") === "done";
              const toNotDone = statusCategoryFromName(it.toString ?? "") !== "done";
              if (fromDone && toNotDone) entry.reopens++;
            }
          }
        }

        // SLA + resolution time on done tickets
        const resolvedAt =
          (issue.fields as unknown as { resolutiondate?: string | null }).resolutiondate ?? null;
        if (cat === "done" && resolvedAt) {
          entry.resolved++;
          const created = new Date(issue.fields.created).getTime();
          const done = new Date(resolvedAt).getTime();
          const days = Math.max(0, (done - created) / 86400000);
          entry._resolutionDaysSum += days;

          const slaMinutes =
            (issue.fields as unknown as { customfield_10453?: number | null })
              .customfield_10453 ?? null;
          if (typeof slaMinutes === "number" && slaMinutes > 0) {
            entry.slaTracked++;
            const elapsedMinutes = (done - created) / 60000;
            if (elapsedMinutes <= slaMinutes) entry.slaRespected++;
          }
        }
      }

      // Finalize
      const technicians = Array.from(map.values())
        .filter((t) => t.name !== "Unassigned")
        .map((t) => {
          const slaPct = t.slaTracked > 0 ? (t.slaRespected / t.slaTracked) * 100 : 100;
          const avgRes = t.resolved > 0 ? t._resolutionDaysSum / t.resolved : null;

          // Workload (higher = more loaded). Open tickets weighted, +stale, +high prio.
          const workloadIndex =
            t.open * 1 + t.inProgress * 1.5 + t.highPriority * 1.2 + t.staleInProgress * 2;

          // Performance score 0..100. Penalize reopens, stale, missed SLAs.
          const completionRate = t.total > 0 ? t.done / t.total : 0;
          const reopenRate = t.resolved > 0 ? t.reopens / t.resolved : 0;
          const stalePenalty = t.inProgress > 0 ? t.staleInProgress / t.inProgress : 0;

          const score =
            slaPct * 0.45 +
            completionRate * 100 * 0.3 +
            (1 - Math.min(1, reopenRate)) * 100 * 0.15 +
            (1 - Math.min(1, stalePenalty)) * 100 * 0.1;

          const { _resolutionDaysSum, ...clean } = t;
          void _resolutionDaysSum;
          return {
            ...clean,
            slaRespectPct: Math.round(slaPct),
            avgResolutionDays: avgRes !== null ? Math.round(avgRes * 10) / 10 : null,
            workloadIndex: Math.round(workloadIndex * 10) / 10,
            performanceScore: Math.max(0, Math.min(100, Math.round(score))),
          } as TechPerformance;
        })
        .sort((a, b) => b.performanceScore - a.performanceScore);

      return { technicians, error: null as string | null };
    } catch (e) {
      return {
        technicians: [] as TechPerformance[],
        error: e instanceof Error ? e.message : "Failed to load performance",
      };
    }
  });
