import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  RefreshCcw,
  Clock,
  Activity,
} from "lucide-react";
import { getDashboardData, getTeamPerformance } from "@/server/jira.functions";
import type { TechPerformance } from "@/server/jira.functions";

export const Route = createFileRoute("/_app/team")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "Team Load — Jira in Your Pocket" }] }),
});

type Data = Awaited<ReturnType<typeof getDashboardData>>;
type Perf = Awaited<ReturnType<typeof getTeamPerformance>>;

function TeamPage() {
  const [data, setData] = useState<Data | null>(null);
  const [perf, setPerf] = useState<Perf | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboardData(), getTeamPerformance()])
      .then(([d, p]) => {
        setData(d);
        setPerf(p);
      })
      .catch((e) => {
        setPerf({
          technicians: [],
          error: e instanceof Error ? e.message : "Failed to load",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const max = data?.assignees.reduce((m, a) => Math.max(m, a.total), 0) ?? 1;
  const technicians = perf?.technicians ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Team</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
          <Users className="size-6 sm:size-7 text-primary" />
          Workload &amp; Performance
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Per-technician performance score (SLA, reopens, completion) and live workload — pulled
          from Jira.
        </p>
      </header>

      {/* PERFORMANCE SECTION */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <TrendingUp className="size-4 text-success" />
          Technician performance
        </h2>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-card rounded-xl border border-border" />
            ))}
          </div>
        ) : perf?.error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {perf.error}
          </div>
        ) : technicians.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No assigned tickets yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {technicians.map((t, idx) => (
              <PerfCard key={t.name} t={t} idx={idx} />
            ))}
          </div>
        )}
      </section>

      {/* WORKLOAD SECTION */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Workload heatmap
        </h2>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
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
                  className="rounded-xl border border-border bg-card p-3 sm:p-4"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {a.avatar ? (
                      <img
                        src={a.avatar}
                        alt={a.name}
                        className="size-9 sm:size-10 rounded-full ring-1 ring-border"
                      />
                    ) : (
                      <div className="size-9 sm:size-10 rounded-full bg-muted/50 ring-1 ring-border" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.total} tickets total</div>
                    </div>
                    <div className="flex gap-2 sm:gap-3 text-xs shrink-0">
                      <Stat label="Todo" value={a.todo} color="text-info" />
                      <Stat label="Active" value={a.inProgress} color="text-warning" />
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
      </section>
    </div>
  );
}

function PerfCard({ t, idx }: { t: TechPerformance; idx: number }) {
  const scoreColor =
    t.performanceScore >= 80
      ? "text-success"
      : t.performanceScore >= 60
        ? "text-warning"
        : "text-destructive";
  const scoreBg =
    t.performanceScore >= 80
      ? "bg-success/10 border-success/30"
      : t.performanceScore >= 60
        ? "bg-warning/10 border-warning/30"
        : "bg-destructive/10 border-destructive/30";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className="rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex items-start gap-3">
        {t.avatar ? (
          <img
            src={t.avatar}
            alt={t.name}
            className="size-10 rounded-full ring-1 ring-border shrink-0"
          />
        ) : (
          <div className="size-10 rounded-full bg-muted/50 ring-1 ring-border shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground truncate">{t.name}</div>
          <div className="text-xs text-muted-foreground">
            {t.total} tickets · workload index {t.workloadIndex}
          </div>
        </div>
        <div
          className={`shrink-0 rounded-lg border ${scoreBg} px-3 py-1.5 text-center min-w-[68px]`}
        >
          <div className={`text-xl font-bold tabular-nums ${scoreColor}`}>
            {t.performanceScore}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Score</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi
          icon={<Clock className="size-3.5" />}
          label="SLA respect"
          value={`${t.slaRespectPct}%`}
          tone={t.slaRespectPct >= 80 ? "success" : t.slaRespectPct >= 60 ? "warning" : "danger"}
        />
        <Kpi
          icon={<RefreshCcw className="size-3.5" />}
          label="Reopens"
          value={t.reopens.toString()}
          tone={t.reopens === 0 ? "success" : t.reopens <= 2 ? "warning" : "danger"}
        />
        <Kpi
          icon={<AlertTriangle className="size-3.5" />}
          label="Stale"
          value={t.staleInProgress.toString()}
          tone={t.staleInProgress === 0 ? "success" : t.staleInProgress <= 2 ? "warning" : "danger"}
        />
        <Kpi
          icon={<TrendingUp className="size-3.5" />}
          label="Avg resolve"
          value={t.avgResolutionDays !== null ? `${t.avgResolutionDays}d` : "—"}
          tone="neutral"
        />
      </div>
    </motion.div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-base font-bold tabular-nums mt-0.5 ${toneClass}`}>{value}</div>
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
