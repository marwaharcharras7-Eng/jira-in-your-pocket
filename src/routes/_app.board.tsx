import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Filter } from "lucide-react";
import { TicketCard } from "@/components/TicketCard";
import { getAllIssues } from "@/server/jira.functions";
import type { JiraIssue } from "@/lib/jira";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/board")({
  component: BoardPage,
  head: () => ({ meta: [{ title: "Board — AgileFlow AI" }] }),
});

// Synced with Jira workflow
const COLUMNS: Array<{ name: string; color: string }> = [
  { name: "Open", color: "oklch(0.68 0.18 220)" },
  { name: "Scheduled", color: "oklch(0.72 0.14 280)" },
  { name: "In Progress", color: "oklch(0.78 0.16 75)" },
  { name: "In Review", color: "oklch(0.74 0.16 200)" },
  { name: "Closed", color: "oklch(0.72 0.18 155)" },
];

function BoardPage() {
  const { isManager } = useAuth();
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [machine, setMachine] = useState("all");
  const [priority, setPriority] = useState("all");
  const [type, setType] = useState("all");
  const [assignee, setAssignee] = useState("all");

  useEffect(() => {
    getAllIssues()
      .then((r) => {
        setIssues(r.issues);
        setError(r.error);
      })
      .catch((e) => {
        setIssues([]);
        setError(e instanceof Error ? e.message : "Failed to load board");
      })
      .finally(() => setLoading(false));
  }, []);

  const machineOptions = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((i) => {
      const m = i.fields.summary.match(/M0?\d{1,2}/i)?.[0]?.toUpperCase().replace(/^M(\d)$/, "M0$1");
      if (m) set.add(m);
    });
    return ["all", ...Array.from(set).sort()];
  }, [issues]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((i) => set.add(i.fields.issuetype.name));
    return ["all", ...Array.from(set).sort()];
  }, [issues]);

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((i) => set.add(i.fields.assignee?.displayName ?? "Unassigned"));
    return ["all", ...Array.from(set).sort()];
  }, [issues]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return issues.filter((i) => {
      if (q) {
        const hay = `${i.fields.summary} ${i.key} ${i.fields.assignee?.displayName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (machine !== "all") {
        const m = i.fields.summary.match(/M0?\d{1,2}/i)?.[0]?.toUpperCase().replace(/^M(\d)$/, "M0$1");
        if (m !== machine) return false;
      }
      if (priority !== "all" && (i.fields.priority?.name ?? "—") !== priority) return false;
      if (type !== "all" && i.fields.issuetype.name !== type) return false;
      if (isManager && assignee !== "all") {
        const name = i.fields.assignee?.displayName ?? "Unassigned";
        if (name !== assignee) return false;
      }
      return true;
    });
  }, [issues, filter, machine, priority, type, assignee, isManager]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">CMV Project</p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {isManager ? "Live Kanban" : "My Kanban"}
          </h1>
        </div>
        <input
          type="search"
          placeholder="Search by title, key or assignee…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 w-72"
        />
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="size-3.5" /> Filters
        </div>
        <Select label="Machine" value={machine} onChange={setMachine} options={machineOptions} />
        <Select
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={["all", "Highest", "High", "Medium", "Low", "Lowest", "—"]}
        />
        <Select label="Type" value={type} onChange={setType} options={typeOptions} />
        {isManager && (
          <Select label="Assignee" value={assignee} onChange={setAssignee} options={assigneeOptions} />
        )}
        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length} of {issues.length}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 animate-pulse">
          {COLUMNS.map((c) => (
            <div key={c.name} className="h-96 bg-card border border-border rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {COLUMNS.map((col, idx) => {
            const items = filtered.filter((i) => i.fields.status.name === col.name);
            return (
              <motion.div
                key={col.name}
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
                    <h2 className="text-xs font-semibold uppercase tracking-wider">{col.name}</h2>
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

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-input border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-primary/50 max-w-[180px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "all" ? "All" : o}
          </option>
        ))}
      </select>
    </label>
  );
}
