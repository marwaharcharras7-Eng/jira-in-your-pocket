import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  CalendarClock,
  Check,
  Cpu,
  ExternalLink,
  Loader2,
  PlayCircle,
  ShieldAlert,
  Sparkles,
  Timer,
  UserCircle2,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  approveManagerSuggestion,
  getManagerSuggestionTickets,
} from "@/server/jira.functions";
import type { JiraIssue } from "@/lib/jira";
import { getIssueUrl } from "@/lib/jira";

export const Route = createFileRoute("/_app/suggestions")({
  component: SuggestionsPage,
  head: () => ({ meta: [{ title: "AI Suggestions — Jira in Your Pocket" }] }),
});

type RowState = "idle" | "pushing" | "done" | "error";

function SuggestionsPage() {
  const { isManager } = useAuth();
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isManager) {
      setLoading(false);
      return;
    }
    getManagerSuggestionTickets()
      .then((r) => {
        setIssues(r.issues);
        setError(r.error);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [isManager]);

  async function approve(issue: JiraIssue) {
    setRowState((s) => ({ ...s, [issue.key]: "pushing" }));
    setRowError((s) => ({ ...s, [issue.key]: "" }));
    try {
      const r = await approveManagerSuggestion({
        data: {
          key: issue.key,
          suggestedPriority: issue.fields.customfield_10371 ?? null,
          suggestedClassification: issue.fields.customfield_10372 ?? null,
          suggestedAssignee:
            issue.fields.customfield_10452 ?? issue.fields.customfield_10383 ?? null,
          suggestedSlaMinutes:
            issue.fields.customfield_10453 ?? issue.fields.customfield_10376 ?? null,
        },
      });
      if (!r.ok) {
        setRowError((s) => ({ ...s, [issue.key]: r.error ?? "Failed" }));
        setRowState((s) => ({ ...s, [issue.key]: "error" }));
        return;
      }
      setRowState((s) => ({ ...s, [issue.key]: "done" }));
      // remove from list after approval (status moved to Scheduled)
      setTimeout(() => {
        setIssues((cur) => cur.filter((i) => i.key !== issue.key));
      }, 800);
    } catch (e) {
      setRowError((s) => ({
        ...s,
        [issue.key]: e instanceof Error ? e.message : "Failed",
      }));
      setRowState((s) => ({ ...s, [issue.key]: "error" }));
    }
  }

  if (!isManager) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6 text-sm flex items-start gap-3">
          <ShieldAlert className="size-5 text-warning shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-warning mb-1">Manager only</h2>
            <p className="text-muted-foreground">
              Only the Maintenance Manager can review and approve AI suggestions.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">AI Module</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
          <BrainCircuit className="size-7 text-primary" />
          AI Suggestions to Approve
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
          Tickets in <span className="text-primary font-medium">Open</span> status with ML suggestions
          (priority, classification, assignee, SLA). Approving applies the suggestions and moves the
          ticket to <span className="text-primary font-medium">Scheduled</span>. To edit any value,
          open the ticket directly in Jira.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          No open tickets with AI suggestions waiting for approval.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {issues.map((issue, idx) => {
            const state = rowState[issue.key] ?? "idle";
            const err = rowError[issue.key];
            return (
              <motion.article
                key={issue.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="rounded-xl border border-border bg-card p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-primary">{issue.key}</span>
                      <span className="px-1.5 py-0.5 rounded bg-info/15 text-info border border-info/30 uppercase tracking-wider text-[9px]">
                        Open
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {issue.fields.issuetype.name}
                      </span>
                    </div>
                    <h2 className="text-sm font-medium leading-snug mt-1 line-clamp-2">
                      {issue.fields.summary}
                    </h2>
                  </div>
                  <a
                    href={getIssueUrl(issue.key)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    title="Open in Jira to edit"
                  >
                    Edit in Jira <ExternalLink className="size-3" />
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <Suggestion
                    icon={Sparkles}
                    label="Priority"
                    current={issue.fields.priority?.name ?? "—"}
                    suggested={issue.fields.customfield_10371}
                  />
                  <Suggestion
                    icon={Wrench}
                    label="Issue Type"
                    current={issue.fields.issuetype.name}
                    suggested={issue.fields.customfield_10372}
                  />
                  <Suggestion
                    icon={UserCircle2}
                    label="Assignee"
                    current={issue.fields.assignee?.displayName ?? "Unassigned"}
                    suggested={
                      issue.fields.customfield_10452 ?? issue.fields.customfield_10383
                    }
                  />
                  <Suggestion
                    icon={Timer}
                    label="SLA Target (min)"
                    current="—"
                    suggested={
                      formatSla(
                        issue.fields.customfield_10453 ?? issue.fields.customfield_10376,
                      )
                    }
                  />
                  <Suggestion
                    icon={PlayCircle}
                    label="Start Time"
                    current="—"
                    suggested={
                      formatDateTime(
                        issue.fields.customfield_10381 ?? issue.fields.customfield_10377,
                      )
                    }
                  />
                  <Suggestion
                    icon={CalendarClock}
                    label="Due Date"
                    current={formatDate(issue.fields.duedate) ?? "—"}
                    suggested={formatDate(issue.fields.customfield_10382)}
                  />
                  {issue.fields.customfield_10384 && (
                    <Suggestion
                      icon={Cpu}
                      label="Machine"
                      current="—"
                      suggested={issue.fields.customfield_10384.toUpperCase()}
                    />
                  )}
                </div>

                {err && (
                  <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
                    {err}
                  </div>
                )}

                <button
                  onClick={() => approve(issue)}
                  disabled={state === "pushing" || state === "done"}
                  className="w-full h-10 rounded-lg bg-gradient-to-r from-success to-success/80 text-success-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {state === "pushing" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Approving & moving to Scheduled…
                    </>
                  ) : state === "done" ? (
                    <>
                      <Check className="size-4" /> Approved · status → Scheduled
                    </>
                  ) : (
                    <>
                      <Check className="size-4" /> Approve suggestions & schedule
                    </>
                  )}
                </button>
              </motion.article>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Need to change a value before approving?{" "}
        <Link to="/board" className="text-primary hover:underline">
          Edit it directly in Jira
        </Link>{" "}
        first, then come back here.
      </p>
    </div>
  );
}

function Suggestion({
  icon: Icon,
  label,
  current,
  suggested,
}: {
  icon: typeof Sparkles;
  label: string;
  current: string;
  suggested: string | number | null | undefined;
}) {
  const value = suggested == null || suggested === "" ? null : String(suggested);
  const changed = value != null && value.trim().toLowerCase() !== current.trim().toLowerCase();
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
        <span
          className={`text-sm font-medium ${
            value == null
              ? "italic text-muted-foreground"
              : changed
                ? "text-success"
                : "text-foreground"
          }`}
        >
          {value ?? "No suggestion"}
        </span>
        {changed && (
          <span className="text-[10px] text-muted-foreground line-through">{current}</span>
        )}
      </div>
    </div>
  );
}

function formatSla(value: number | null | undefined): string | null {
  if (value == null) return null;
  if (value < 60) return `${Math.round(value)} min`;
  return `${(value / 60).toFixed(1)} h`;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}