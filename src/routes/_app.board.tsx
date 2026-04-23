import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TicketCard } from "@/components/TicketCard";
import { getAllIssues } from "@/server/jira.functions";
import type { JiraIssue } from "@/lib/jira";

export const Route = createFileRoute("/_app/board")({
  component: BoardPage,
  head: () => ({ meta: [{ title: "Board — AgileFlow AI" }] }),
});

const COLUMNS: Array<{ key: string; label: string; color: string }> = [
  { key: "new", label: "À faire", color: "oklch(0.68 0.18 220)" },
  { key: "indeterminate", label: "En cours", color: "oklch(0.78 0.16 75)" },
  { key: "done", label: "Terminé", color: "oklch(0.72 0.18 155)" },
];

function BoardPage() {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    getAllIssues()
      .then((r) => {
        setIssues(r.issues);
        setError(r.error);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return issues;
    const q = filter.toLowerCase();
    return issues.filter(
      (i) =>
        i.fields.summary.toLowerCase().includes(q) ||
        i.key.toLowerCase().includes(q) ||
        (i.fields.assignee?.displayName ?? "").toLowerCase().includes(q),
    );
  }, [issues, filter]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">CMV Project</p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Live Kanban</h1>
        </div>
        <input
          type="search"
          placeholder="Filter by title, key or assignee…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 w-72"
        />
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-4 animate-pulse">
          {COLUMNS.map((c) => (
            <div key={c.key} className="h-96 bg-card border border-border rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col, idx) => {
            const items = filtered.filter(
              (i) => i.fields.status.statusCategory.key === col.key,
            );
            return (
              <motion.div
                key={col.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-xl border border-border bg-card/40 p-3 min-h-[300px]"
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: col.color, boxShadow: `0 0 8px ${col.color}` }}
                    />
                    <h2 className="text-sm font-semibold uppercase tracking-wider">
                      {col.label}
                    </h2>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                </div>
                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                  {items.map((i) => (
                    <TicketCard key={i.id} issue={i} />
                  ))}
                  {items.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-8 italic">
                      No tickets
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
