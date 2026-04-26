import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, MessageSquare, Pencil } from "lucide-react";
import { format } from "date-fns";
import { getIssueDetailForNotification } from "@/server/jira.functions";

export const Route = createFileRoute("/_app/notifications/$key")({
  component: NotificationDetailPage,
  head: () => ({ meta: [{ title: "Notification — Jira in Your Pocket" }] }),
});

type Detail = Awaited<ReturnType<typeof getIssueDetailForNotification>>;

function NotificationDetailPage() {
  const { key } = Route.useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getIssueDetailForNotification({ data: { key } })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [key]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {error ?? "Notification not found"}
        </div>
      </div>
    );
  }

  const { detail, jiraUrl } = data;
  const headerLine = buildHeaderLine(detail.histories, detail.comments);

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>

      {/* Email-like header */}
      <header className="border-b border-border pb-5">
        <h1
          className="text-base text-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: headerLine }}
        />
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded bg-muted/50 font-mono">company managed v3</span>
          <span>/</span>
          <a
            href={jiraUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-primary hover:underline"
          >
            {detail.key}
          </a>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-primary">
          <a href={jiraUrl} target="_blank" rel="noreferrer" className="hover:underline">
            {detail.summary}
          </a>
        </h2>
      </header>

      {/* Updates section */}
      {detail.histories.length > 0 && (
        <section>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Pencil className="size-4 text-muted-foreground" />
            Updates
          </h3>
          <div className="space-y-5">
            {detail.histories.slice(0, 30).map((h) => (
              <div key={h.id} className="flex gap-3">
                <Avatar
                  name={h.author?.displayName ?? "Automation"}
                  url={h.author?.avatarUrls?.["32x32"]}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-semibold">
                      {h.author?.displayName ?? "Automation for Jira"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(h.created), "hh:mm a")} Morocco Time
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {h.items.map((it, i) => (
                      <div key={i} className="text-sm flex items-baseline gap-2 flex-wrap">
                        <span className="text-muted-foreground">{prettyField(it.field)} :</span>
                        <span className="text-success font-medium">
                          {it.toString || "—"}
                        </span>
                        {it.fromString && (
                          <span className="text-[11px] text-muted-foreground line-through">
                            (was: {it.fromString})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comments */}
      {detail.comments.length > 0 && (
        <section>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            Comments
          </h3>
          <div className="space-y-4">
            {detail.comments.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-card/50 p-4 flex gap-3"
              >
                <Avatar
                  name={c.author?.displayName ?? "User"}
                  url={c.author?.avatarUrls?.["32x32"]}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-semibold">{c.author?.displayName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(c.created), "hh:mm a")} Morocco Time
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap text-foreground/90">
                    {c.bodyText || <span className="italic text-muted-foreground">No content</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pt-4">
        <a
          href={jiraUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          Open in Jira <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      <img src={url} alt={name} className="size-8 rounded-full shrink-0 border border-border" />
    );
  }
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="size-8 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

function prettyField(f: string): string {
  const map: Record<string, string> = {
    assignee: "Assignment",
    status: "Status",
    priority: "Priority",
    summary: "Summary",
    description: "Description",
    duedate: "Due date",
    labels: "Labels",
    resolution: "Resolution",
  };
  return map[f] ?? f;
}

function buildHeaderLine(
  histories: Awaited<ReturnType<typeof getIssueDetailForNotification>>["detail"]["histories"],
  comments: Awaited<ReturnType<typeof getIssueDetailForNotification>>["detail"]["comments"],
): string {
  const parts: string[] = [];
  // Group histories by author
  const byAuthor = new Map<string, number>();
  for (const h of histories) {
    const a = h.author?.displayName ?? "Automation for Jira";
    byAuthor.set(a, (byAuthor.get(a) ?? 0) + h.items.length);
  }
  for (const [author, count] of byAuthor) {
    parts.push(`${escapeHtml(author)} <strong>made ${count} update${count > 1 ? "s" : ""}</strong>`);
  }
  const commentByAuthor = new Map<string, number>();
  for (const c of comments) {
    const a = c.author?.displayName ?? "User";
    commentByAuthor.set(a, (commentByAuthor.get(a) ?? 0) + 1);
  }
  for (const [author, count] of commentByAuthor) {
    parts.push(
      `${escapeHtml(author)} <strong>added ${count > 1 ? `${count} new comments` : "a new comment"}</strong>`,
    );
  }
  return parts.length > 0 ? parts.join(", ") + "." : "Activity on this ticket.";
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
