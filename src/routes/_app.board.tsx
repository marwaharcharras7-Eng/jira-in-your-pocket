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

type BoardColumn = {
  key: string;
  name: string;
  order: number;
  dotClass: string;
};

const SKELETON_COLUMNS = ["Open", "Scheduled", "In Progress", "In Review", "Closed"];

function getBoardColumn(statusName: string, statusCategoryKey: string): BoardColumn {
  const normalized = statusName.trim().toLowerCase();

  if (
    statusCategoryKey === "new" ||
    /^(open|to do|todo|à faire|a faire|ouvert|ouverte)$/.test(normalized)
  ) {
    return { key: statusName, name: statusName, order: 0, dotClass: "bg-muted-foreground" };
  }

  if (/scheduled|planifi|programm/i.test(normalized)) {
    return { key: statusName, name: statusName, order: 1, dotClass: "bg-primary" };
  }

  if (statusCategoryKey === "done" || /closed|done|termin|clôtur/i.test(normalized)) {
    return { key: statusName, name: statusName, order: 4, dotClass: "bg-success" };
  }

  if (/review|pending review|en revue|validation|vérification/i.test(normalized)) {
    return { key: statusName, name: statusName, order: 3, dotClass: "bg-accent-foreground" };
  }

  if (statusCategoryKey === "indeterminate" || /progress|cours|traitement/i.test(normalized)) {
    return { key: statusName, name: statusName, order: 2, dotClass: "bg-warning" };
  }

  return {
    key: statusName,
    name: statusName,
    order: statusCategoryKey === "done" ? 4 : statusCategoryKey === "indeterminate" ? 2 : 1,
    dotClass:
      statusCategoryKey === "done"
        ? "bg-success"
        : statusCategoryKey === "indeterminate"
          ? "bg-warning"
          : "bg-primary",
  };
}

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

  const columns = useMemo(() => {
    const map = new Map<string, BoardColumn>();

    issues.forEach((issue) => {
      const column = getBoardColumn(issue.fields.status.name, issue.fields.status.statusCategory.key);
      map.set(column.key, column);
    });

    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
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
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] animate-pulse">
          {SKELETON_COLUMNS.map((name) => (
            <div key={name} className="h-96 bg-card border border-border rounded-xl" />
          ))}
        </div>
      ) : columns.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
          {isManager
            ? "No Jira tickets were found for this board."
            : "No Jira tickets are currently assigned to you."}
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {columns.map((col, idx) => {
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
                    <span className={`size-2 rounded-full ${col.dotClass}`} />
                    <h2 className="text-xs font-semibold tracking-wide">{col.name}</h2>
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
