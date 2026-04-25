/**
 * Public Jira webhook endpoint.
 *
 * Configure in Jira → System → Webhooks with URL:
 *   https://jira-nexus-spark.lovable.app/api/public/jira-webhook
 *
 * Events handled:
 *   - jira:issue_updated  (status transitions: Scheduled / Pending Review / Done, assignee change, etc.)
 *   - jira:issue_created
 *   - comment_created / comment_updated
 *
 * Recipients:
 *   - All managers
 *   - The assignee technician (if any)
 *   - The reporter technician (if any)
 *
 * De-duplication via unique index on (user_id, event_id).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Atlassian-Webhook-Identifier",
} as const;

const TARGET_STATUSES = new Set(["scheduled", "pending review", "done"]);

type Recipient = {
  user_id: string;
  role: "manager" | "technician";
  jira_account_id: string | null;
};

async function loadRecipients(): Promise<Recipient[]> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
  if (!roles) return [];
  const userIds = roles.map((r) => r.user_id);
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, jira_account_id")
    .in("id", userIds);
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p.jira_account_id ?? null]));
  return roles.map((r) => ({
    user_id: r.user_id,
    role: r.role as "manager" | "technician",
    jira_account_id: profMap.get(r.user_id) ?? null,
  }));
}

type NotifRow = {
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  issue_key: string;
  event_id: string;
  metadata: any;
};

function pickRecipients(
  recipients: Recipient[],
  assigneeId: string | null,
  reporterId: string | null,
): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of recipients) {
    const isManager = r.role === "manager";
    const isAssignee = assigneeId && r.jira_account_id === assigneeId;
    const isReporter = reporterId && r.jira_account_id === reporterId;
    if (isManager || isAssignee || isReporter) {
      if (!seen.has(r.user_id)) {
        seen.add(r.user_id);
        out.push(r);
      }
    }
  }
  return out;
}

async function handleWebhook(payload: any): Promise<{ inserted: number; skipped: string | null }> {
  const event = String(payload?.webhookEvent ?? "");
  const issue = payload?.issue;
  if (!issue?.key) return { inserted: 0, skipped: "no issue in payload" };

  const key: string = issue.key;
  const summary: string = issue.fields?.summary ?? key;
  const assigneeId: string | null = issue.fields?.assignee?.accountId ?? null;
  const reporterId: string | null = issue.fields?.reporter?.accountId ?? null;
  const link = `/notifications/${encodeURIComponent(key)}`;

  const recipients = await loadRecipients();
  if (recipients.length === 0) return { inserted: 0, skipped: "no recipients" };
  const targets = pickRecipients(recipients, assigneeId, reporterId);
  if (targets.length === 0) return { inserted: 0, skipped: "no matching users" };

  const rows: NotifRow[] = [];
  const ts = payload?.timestamp ?? Date.now();

  // === Status transitions ===
  if (event === "jira:issue_updated") {
    const items: any[] = payload?.changelog?.items ?? [];
    const statusItem = items.find((it) => it.field === "status");
    if (statusItem) {
      const toName: string = String(statusItem.toString ?? "").trim();
      const fromName: string = String(statusItem.fromString ?? "").trim();
      if (TARGET_STATUSES.has(toName.toLowerCase())) {
        const eventId = `wh:${key}:status:${ts}:${toName}`;
        const title = `${key} → ${toName}`;
        const message = `${summary} moved from "${fromName || "—"}" to "${toName}".`;
        for (const r of targets) {
          rows.push({
            user_id: r.user_id,
            type: "status_change",
            title,
            message,
            link,
            issue_key: key,
            event_id: eventId,
            metadata: { from: fromName, to: toName, source: "webhook" },
          });
        }
      }
      const assigneeItem = items.find((it) => it.field === "assignee");
      if (assigneeItem) {
        const eventId = `wh:${key}:assignee:${ts}`;
        const title = `${key} assigned`;
        const toAssignee = assigneeItem.toString ?? "Unassigned";
        const message = `${summary} — assigned to ${toAssignee}.`;
        for (const r of targets) {
          rows.push({
            user_id: r.user_id,
            type: "assignment",
            title,
            message,
            link,
            issue_key: key,
            event_id: eventId,
            metadata: { to: toAssignee, source: "webhook" },
          });
        }
      }
    }
  }

  // === New issue ===
  if (event === "jira:issue_created") {
    const eventId = `wh:${key}:created:${ts}`;
    for (const r of targets) {
      rows.push({
        user_id: r.user_id,
        type: "issue_created",
        title: `${key} created`,
        message: summary,
        link,
        issue_key: key,
        event_id: eventId,
        metadata: { source: "webhook" },
      });
    }
  }

  // === Comments ===
  if (event === "comment_created" || event === "comment_updated") {
    const c = payload?.comment;
    const cid = c?.id ?? ts;
    const author = c?.author?.displayName ?? "Someone";
    const bodyPreview = typeof c?.body === "string" ? c.body.slice(0, 140) : "(comment)";
    const action = event === "comment_created" ? "commented" : "updated a comment";
    const eventId = `wh:${key}:${event}:${cid}`;
    const title = `${key} — ${author} ${action}`;
    for (const r of targets) {
      rows.push({
        user_id: r.user_id,
        type: "comment",
        title,
        message: bodyPreview,
        link,
        issue_key: key,
        event_id: eventId,
        metadata: { author, comment_id: cid, source: "webhook" },
      });
    }
  }

  if (rows.length === 0) return { inserted: 0, skipped: `event ignored: ${event}` };

  const { error, count } = await supabaseAdmin
    .from("notifications")
    .upsert(rows, { onConflict: "user_id,event_id", ignoreDuplicates: true, count: "exact" });

  if (error) {
    console.error("[jira-webhook] insert error", error);
    throw error;
  }

  return { inserted: count ?? rows.length, skipped: null };
}

export const Route = createFileRoute("/api/public/jira-webhook")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async () =>
        new Response(
          JSON.stringify({ ok: true, message: "Jira webhook endpoint ready. POST events here." }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
        ),
      POST: async ({ request }) => {
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }

        try {
          const result = await handleWebhook(payload);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        } catch (err) {
          console.error("[jira-webhook] failed", err);
          // Return 200 anyway so Jira doesn't retry endlessly; log for debugging.
          return new Response(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
          );
        }
      },
    },
  },
});
