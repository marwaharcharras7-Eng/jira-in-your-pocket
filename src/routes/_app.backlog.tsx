import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FileWarning, ShieldAlert, Clock, Repeat, Filter } from "lucide-react";
import { z } from "zod";
import { TicketCard } from "@/components/TicketCard";
import { getProblemTickets, getRecurringProblems } from "@/server/jira.functions";
import { daysSince } from "@/lib/backlog";

const searchSchema = z.object({
  tab: z.enum(["vague", "misclassified", "stale", "recurring"]).optional(),
});

export const Route = createFileRoute("/_app/backlog")({
  validateSearch: (s) => searchSchema.parse(s),
  component: BacklogPage,
  head: () => ({ meta: [{ title: "Backlog Health — Jira in Your Pocket" }] }),
});

type ProblemData = Awaited<ReturnType<typeof getProblemTickets>>;
type RecurringData = Awaited<ReturnType<typeof getRecurringProblems>>;
type Tab = "vague" | "misclassified" | "stale" | "recurring";

function BacklogPage() {
  const search = Route.useSearch();
  const [data, setData] = useState<ProblemData | null>(null);
  const [recurring, setRecurring] = useState<RecurringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(search.tab ?? "vague");
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    Promise.all([getProblemTickets(), getRecurringProblems()])
      .then(([p, r]) => {
        setData(p);
        setRecurring(r);
      })
      .catch(() => {
        setData({
          vague: [],
          misclassified: [],
          stale: [],
          viewer: { role: null, jiraAccountId: null, displayName: null },
          error: "Failed to load backlog health",
        });
        setRecurring({
          problems: [],
          threshold: 3,
          viewer: { role: null, jiraAccountId: null, displayName: null },
          error: "Failed to load recurring problems",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  // Sync tab if URL search changes
  useEffect(() => {
    if (search.tab) setTab(search.tab);
  }, [search.tab]);

  const counts = {
    vague: data?.vague.length ?? 0,
    misclassified: data?.misclassified.length ?? 0,
    stale: data?.stale.length ?? 0,
    recurring: recurring?.problems.length ?? 0,
  };

  const baseList = useMemo(() => {
    if (!data) return [];
    if (tab === "vague") return data.vague;
    if (tab === "misclassified") return data.misclassified;
    if (tab === "stale") return data.stale;
    return [];
  }, [data, tab]);

  // Build machine list for filter
  const machineOptions = useMemo(() => {
    const set = new Set<string>();
    baseList.forEach((i) => {
      const m = i.fields.summary.match(/M0?\d{1,2}/i)?.[0]?.toUpperCase();
      if (m) set.add(m.replace(/^M(\d)$/, "M0$1"));
    });
    return ["all", ...Array.from(set).sort()];
  }, [baseList]);

  const filteredList = useMemo(() => {
    return baseList.filter((i) => {
      if (priorityFilter !== "all" && (i.fields.priority?.name ?? "—") !== priorityFilter) {
        return false;
      }
      if (machineFilter !== "all") {
        const m = i.fields.summary.match(/M0?\d{1,2}/i)?.[0]?.toUpperCase().replace(/^M(\d)$/, "M0$1");
        if (m !== machineFilter) return false;
      }
      return true;
    });
  }, [baseList, machineFilter, priorityFilter]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Quality</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Backlog Health</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Tickets the AI flagged as needing attention. Click any card to open it in Jira, then use{" "}
          <span className="text-primary">AI Rewriter</span> to fix it.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border">
        <Tab active={tab === "vague"} onClick={() => setTab("vague")} icon={FileWarning} count={counts.vague}>
          Vague / empty
        </Tab>
        <Tab active={tab === "misclassified"} onClick={() => setTab("misclassified")} icon={ShieldAlert} count={counts.misclassified}>
          Misclassified
        </Tab>
        <Tab active={tab === "stale"} onClick={() => setTab("stale")} icon={Clock} count={counts.stale}>
          Stuck &gt; 2 days
        </Tab>
        <Tab active={tab === "recurring"} onClick={() => setTab("recurring")} icon={Repeat} count={counts.recurring}>
          Recurring problems
        </Tab>
      </div>

      {/* Filters — hidden for recurring tab (it has its own grouping) */}
      {tab !== "recurring" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="size-3.5" /> Filters
          </div>
          <Select label="Machine" value={machineFilter} onChange={setMachineFilter} options={machineOptions} />
          <Select
            label="Priority"
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={["all", "Highest", "High", "Medium", "Low", "Lowest", "—"]}
          />
          <div className="ml-auto text-xs text-muted-foreground tabular-nums">
            {filteredList.length} of {baseList.length}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-card rounded-lg border border-border" />
          ))}
        </div>
      ) : tab === "recurring" ? (
        <RecurringList data={recurring} />
      ) : data ? (
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {filteredList.map((i) => (
            <div key={i.id}>
              <TicketCard issue={i} highlight={tab === "stale" ? "danger" : "warning"} />
              {tab === "stale" && (
                <div className="text-[10px] text-destructive/80 mt-1 px-1">
                  Stuck for {daysSince(i.fields.updated).toFixed(1)} days
                </div>
              )}
              {tab === "misclassified" && (
                <div className="text-[10px] text-warning mt-1 px-1">
                  Title says {i.fields.summary.toLowerCase().includes("corrective") ? "Corrective" : "Preventive"} but typed{" "}
                  {i.fields.issuetype.name}
                </div>
              )}
            </div>
          ))}
          {filteredList.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground italic py-12">
              Nothing to fix here. Nice work!
            </div>
          )}
        </motion.div>
      ) : null}
    </div>
  );
}

function RecurringList({ data }: { data: RecurringData | null }) {
  if (!data) return null;
  if (data.problems.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground italic py-16">
        No recurring problems detected (threshold: ≥ {data.threshold} occurrences on the same machine).
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Showing problems reported <strong>≥ {data.threshold} times</strong> on the same machine. Tickets are
        grouped by semantic similarity even when titles or descriptions differ.
      </p>
      {data.problems.map((p, idx) => (
        <motion.div
          key={p.signature}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="rounded-xl border border-warning/40 bg-card p-5"
        >
          <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-warning mb-1">
                <Repeat className="size-3.5" />
                Recurring on {p.machine} · {p.count} occurrences
              </div>
              <h2 className="text-base font-semibold text-foreground">{p.topTitle}</h2>
              {p.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.keywords.map((k) => (
                    <span
                      key={k}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums text-warning">{p.count}×</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">frequency</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {p.issues.map((i) => (
              <TicketCard key={i.id} issue={i} compact highlight="warning" />
            ))}
          </div>
        </motion.div>
      ))}
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
        className="bg-input border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-primary/50"
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

function Tab({
  active,
  onClick,
  icon: Icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileWarning;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
        active
          ? "text-primary border-primary"
          : "text-muted-foreground border-transparent hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
      {children}
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
          active ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
