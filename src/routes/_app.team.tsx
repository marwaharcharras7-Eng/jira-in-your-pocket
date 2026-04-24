import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { getDashboardData } from "@/server/jira.functions";

export const Route = createFileRoute("/_app/team")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "Team Load — AgileFlow AI" }] }),
});

type Data = Awaited<ReturnType<typeof getDashboardData>>;

function TeamPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardData()
      .then(setData)
      .catch((e) => {
        setData({
          health: null,
          duplicateGroups: 0,
          recurringCount: 0,
          recurringTotalTickets: 0,
          machineStats: [],
          assignees: [],
          statusBreakdown: {},
          typeBreakdown: {},
          totalIssues: 0,
          viewer: { role: null, jiraAccountId: null, displayName: null },
          error: e instanceof Error ? e.message : "Failed to load team workload",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const max = data?.assignees.reduce((m, a) => Math.max(m, a.total), 0) ?? 1;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Team</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
          <Users className="size-7 text-primary" />
          Workload Heatmap
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          See who's overloaded and who has bandwidth — pulled live from Jira assignees.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-card rounded-xl border border-border" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-3">
          {data.assignees.map((a, idx) => {
            const pct = (a.total / max) * 100;
            return (
              <motion.div
                key={a.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  {a.avatar ? (
                    <img src={a.avatar} alt={a.name} className="size-10 rounded-full ring-1 ring-border" />
                  ) : (
                    <div className="size-10 rounded-full bg-muted/50 ring-1 ring-border" />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.total} tickets total</div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <Stat label="Todo" value={a.todo} color="text-info" />
                    <Stat label="In progress" value={a.inProgress} color="text-warning" />
                    <Stat label="Done" value={a.done} color="text-success" />
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: idx * 0.1 }}
                    className="h-full bg-gradient-to-r from-primary to-primary/60"
                    style={{ boxShadow: "0 0 12px oklch(0.68 0.20 255 / 0.5)" }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
