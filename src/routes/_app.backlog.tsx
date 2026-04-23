import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileWarning, ShieldAlert, Clock } from "lucide-react";
import { TicketCard } from "@/components/TicketCard";
import { getProblemTickets } from "@/server/jira.functions";
import { daysSince } from "@/lib/backlog";

export const Route = createFileRoute("/_app/backlog")({
  component: BacklogPage,
  head: () => ({ meta: [{ title: "Backlog Health — AgileFlow AI" }] }),
});

type Data = Awaited<ReturnType<typeof getProblemTickets>>;

function BacklogPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"vague" | "misclassified" | "stale">("vague");

  useEffect(() => {
    getProblemTickets()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

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

      <div className="flex gap-2 border-b border-border">
        <Tab active={tab === "vague"} onClick={() => setTab("vague")} icon={FileWarning} count={data?.vague.length ?? 0}>
          Vague / empty
        </Tab>
        <Tab active={tab === "misclassified"} onClick={() => setTab("misclassified")} icon={ShieldAlert} count={data?.misclassified.length ?? 0}>
          Misclassified
        </Tab>
        <Tab active={tab === "stale"} onClick={() => setTab("stale")} icon={Clock} count={data?.stale.length ?? 0}>
          Stuck &gt; 2 days
        </Tab>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-card rounded-lg border border-border" />
          ))}
        </div>
      ) : data ? (
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {(tab === "vague" ? data.vague : tab === "misclassified" ? data.misclassified : data.stale).map((i) => (
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
          {((tab === "vague" && data.vague.length === 0) ||
            (tab === "misclassified" && data.misclassified.length === 0) ||
            (tab === "stale" && data.stale.length === 0)) && (
            <div className="col-span-full text-center text-sm text-muted-foreground italic py-12">
              Nothing to fix here. Nice work!
            </div>
          )}
        </motion.div>
      ) : null}
    </div>
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
