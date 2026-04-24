/**
 * Jira polling endpoint — called every 2 min by pg_cron.
 *
 * Strategy:
 *  - Fetch all CMV issues updated in the last ~10 min (with changelog)
 *  - For each changelog entry + each comment → build a stable event_id
 *  - For each user (manager: all events; technician: only events on their assigned tickets):
 *      INSERT INTO notifications (skipping duplicates via unique index on (user_id, event_id))
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  searchUpdatedIssuesWithDetails,
  fetchIssueComments,
  type ChangelogEntry,
} from "@/lib/jira";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Recipient = {
  user_id: string;
  role: "manager" | "technician";
  jira_account_id: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  assignee: "Assignment",
  status: "Status",
  priority: "Priority",
  summary: "Summary",
  description: "Description",
  duedate: "Due date",
  labels: "Labels",
};

function fieldLabel(f: string) {
  return FIELD_LABELS[f] ?? f;
}

async function loadRecipients(): Promise<Recipient[]> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
  if (!roles) return [];
  const userIds = roles.map((r) => r.user_id);
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, jira_account_id")
    .in("id", userIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.jira_account_id ?? null]));
  return roles.map((r) => ({
    user_id: r.user_id,
    role: r.role as "manager" | "technician",
    jira_account_id: profileMap.get(r.user_id) ?? null,
  }));
}

type NotificationRow = {
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  issue_key: string;
  event_id: string;
  metadata: any;
};

async function pollAndDispatch() {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const issues = await searchUpdatedIssuesWithDetails(since, 50);
  const recipients = await loadRecipients();
  if (recipients.length === 0) return { ok: true, processed: 0, inserted: 0 };

  const cutoff = new Date(Date.now() - 15 * 60 * 1000).getTime();
  const rows: NotificationRow[] = [];

  for (const issue of issues) {
    const key = issue.key;
    const summary = issue.fields.summary;
    const assigneeId = issue.fields.assignee?.accountId ?? null;
    const link = `/notifications/${encodeURIComponent(key)}`;

    // Identify which technicians are concerned for this ticket
    const techsForTicket = recipients.filter(
      (r) => r.role === "technician" && r.jira_account_id && r.jira_account_id === assigneeId,
    );
    const managers = recipients.filter((r) => r.role === "manager");
    const audience = [...managers, ...techsForTicket];
    if (audience.length === 0) continue;

    // ── Changelog entries (field updates) ──
    const histories: ChangelogEntry[] = issue.changelog?.histories ?? [];
    for (const h of histories) {
      const ts = new Date(h.created).getTime();
      if (ts < cutoff) continue;
      const author = h.author?.displayName ?? "Automation for Jira";
      const fields = h.items.map((it) => fieldLabel(it.field)).join(", ");
      const event_id = `${key}:cl:${h.id}`;
      const title = `${author} made ${h.items.length} update${h.items.length > 1 ? "s" : ""}`;
      const message = `${key} — ${summary} · ${fields}`;
      for (const r of audience) {
        rows.push({
          user_id: r.user_id,
          type: "jira_update",
          title,
          message,
          link,
          issue_key: key,
          event_id,
          metadata: { author, fields: h.items, created: h.created },
        });
      }
    }

    // ── Comments ──
    const comments = await fetchIssueComments(key);
    for (const c of comments) {
      const ts = new Date(c.created).getTime();
      if (ts < cutoff) continue;
      const author = c.author?.displayName ?? "Unknown";
      const event_id = `${key}:cm:${c.id}`;
      const preview = (c.bodyText ?? "").slice(0, 140);
      for (const r of audience) {
        rows.push({
          user_id: r.user_id,
          type: "jira_comment",
          title: `${author} added a new comment`,
          message: `${key} — ${summary}${preview ? ` · ${preview}` : ""}`,
          link,
          issue_key: key,
          event_id,
          metadata: { author, body: c.bodyText, created: c.created },
        });
      }
    }
  }

  if (rows.length === 0) return { ok: true, processed: issues.length, inserted: 0 };

  // upsert with ON CONFLICT DO NOTHING via unique (user_id, event_id)
  const { error, count } = await supabaseAdmin
    .from("notifications")
    .upsert(rows, { onConflict: "user_id,event_id", ignoreDuplicates: true, count: "exact" });
  if (error) {
    console.error("notifications upsert error", error);
    throw error;
  }

  return { ok: true, processed: issues.length, inserted: count ?? rows.length };
}

export const Route = createFileRoute("/api/public/jira-poll")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await pollAndDispatch();
          return Response.json(result);
        } catch (e) {
          console.error("jira-poll error", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      POST: async () => {
        try {
          const result = await pollAndDispatch();
          return Response.json(result);
        } catch (e) {
          console.error("jira-poll error", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
