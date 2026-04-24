import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Copy,
  FileWarning,
  Layers,
  Repeat,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { ScoreRing } from "@/components/ScoreRing";
import { getDashboardData } from "@/server/jira.functions";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: "Dashboard — AgileFlow AI" }],
  }),
});

type Data = Awaited<ReturnType<typeof getDashboardData>>;

// Jira workflow statuses with palette
const STATUS_COLORS: Record<string, string> = {
  Open: "oklch(0.68 0.18 220)",
  Scheduled: "oklch(0.72 0.14 280)",
  "In Progress": "oklch(0.78 0.16 75)",
  "In Review": "oklch(0.74 0.16 200)",
  Closed: "oklch(0.72 0.18 155)",
};

function DashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardData()
      .then((d) => setData(d))
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
          error: e instanceof Error ? e.message : "Failed to load dashboard",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto animate-pulse space-y-6">
        <div className="h-8 w-64 bg-muted/40 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-card rounded-xl border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.error || !data.health) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-destructive">
          <h2 className="font-semibold mb-1">Couldn't reach Jira</h2>
          <p className="text-sm text-destructive/80">
            {data?.error ?? "Unknown error. Check the ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN secrets."}
          </p>
        </div>
      </div>
    );
  }

  const h = data.health;
  const isManager = data.viewer.role === "manager";

  // Status distribution from real Jira status names
  const statusData = Object.entries(data.statusBreakdown)
    .map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] ?? "oklch(0.65 0.05 260)",
    }))
    .filter((d) => d.value > 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            CMV · Maintenance Backlog
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {isManager ? "Team Dashboard" : "My Dashboard"}
          </h1>
        </div>
        <div className="text-xs text-muted-foreground">
          {data.totalIssues} {isManager ? "tickets across the team" : "tickets assigned to you"} · synced live from Jira
        </div>
      </header>

      {/* Top row — Score + KPI strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-6 flex items-center gap-6 lg:col-span-1"
        >
          <ScoreRing score={h.score} />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Backlog Health</h2>
            <p className="text-xs text-muted-foreground max-w-[180px]">
              Computed from quality, freshness, duplicates and classification.
            </p>
            <div
              className={`inline-flex text-[10px] uppercase tracking-wider px-2 py-0.5 rounded mt-1 ${
                h.score >= 75
                  ? "bg-success/15 text-success"
                  : h.score >= 50
                    ? "bg-warning/15 text-warning"
                    : "bg-destructive/15 text-destructive"
              }`}
            >
              {h.score >= 75 ? "Healthy" : h.score >= 50 ? "Needs grooming" : "Critical"}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <Kpi icon={Copy} label="Duplicate clusters" value={data.duplicateGroups} accent="warning" />
          <Kpi icon={FileWarning} label="Vague descriptions" value={h.vagueDescriptions} accent="danger" />
          <Kpi icon={ShieldAlert} label="Misclassified" value={h.misclassified} accent="warning" />
          <Kpi icon={AlertTriangle} label="Stuck > 2 days" value={h.staleInProgress} accent="danger" />
        </div>
      </div>

      {/* Recurring problems — clickable, links to Backlog Health */}
      <Link
        to="/backlog"
        search={{ tab: "recurring" }}
        className="block rounded-xl border border-warning/40 bg-gradient-to-br from-warning/10 to-card p-5 hover:border-warning hover:shadow-[0_0_30px_-10px_oklch(0.78_0.16_75_/_0.6)] transition-all group"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-lg bg-warning/20 text-warning flex items-center justify-center">
              <Repeat className="size-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-warning/90 font-semibold">
                Recurring problems detected
              </div>
              <div className="text-2xl font-bold tabular-nums mt-0.5">
                {data.recurringCount}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  problem{data.recurringCount === 1 ? "" : "s"} · {data.recurringTotalTickets} repeated tickets
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Same issue reported multiple times on the same machine. Click to inspect.
              </div>
            </div>
          </div>
          <div className="text-xs text-warning group-hover:translate-x-1 transition-transform">
            View →
          </div>
        </div>
      </Link>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Status distribution" icon={Layers}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {statusData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "oklch(0.20 0.02 262)",
                  border: "1px solid oklch(0.28 0.02 260)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-3 text-xs">
            {statusData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: d.color }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="text-foreground font-medium">{d.value}</span>
              </div>
            ))}
            {statusData.length === 0 && (
              <span className="text-muted-foreground italic">No tickets</span>
            )}
          </div>
        </Card>

        <Card title="Tickets per machine" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.machineStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.02 260 / 0.4)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.65 0.02 256)" }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.65 0.02 256)" }} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.20 0.02 262)",
                  border: "1px solid oklch(0.28 0.02 260)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="open" stackId="a" fill="oklch(0.78 0.16 75)" name="Open" />
              <Bar dataKey="done" stackId="a" fill="oklch(0.72 0.18 155)" name="Done" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Machine heatmap */}
      <Card title="Machine heatmap" icon={Sparkles}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {data.machineStats.map((m) => {
            const intensity = Math.min(1, m.open / 8);
            return (
              <div
                key={m.name}
                className="rounded-lg border border-border p-3 transition-all hover:border-primary/40 cursor-default"
                style={{
                  background: `linear-gradient(135deg, oklch(0.65 0.24 25 / ${intensity * 0.35}), oklch(0.20 0.02 262))`,
                }}
              >
                <div className="text-xs font-mono font-bold text-foreground">{m.name}</div>
                <div className="text-2xl font-bold mt-1 tabular-nums">{m.open}</div>
                <div className="text-[10px] text-muted-foreground">open · {m.high} high</div>
              </div>
            );
          })}
          {data.machineStats.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground italic py-6">
              No tickets to show.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number;
  accent: "warning" | "danger" | "info";
}) {
  const color =
    accent === "danger"
      ? "text-destructive bg-destructive/10"
      : accent === "warning"
        ? "text-warning bg-warning/10"
        : "text-info bg-info/10";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-all"
    >
      <div className={`size-9 rounded-md flex items-center justify-center ${color}`}>
        <Icon className="size-4" />
      </div>
      <div className="text-3xl font-bold tabular-nums mt-3">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </motion.div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
