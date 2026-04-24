import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { TicketCard } from "@/components/TicketCard";
import { explainBlocker, getProblemTickets } from "@/server/jira.functions";
import { daysSince } from "@/lib/backlog";
import type { JiraIssue } from "@/lib/jira";

export const Route = createFileRoute("/_app/risk")({
  component: RiskPage,
  head: () => ({ meta: [{ title: "Risk Radar — AgileFlow AI" }] }),
});

function RiskPage() {
  const [stale, setStale] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [explanation, setExplanation] = useState<{ key: string; text: string } | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  useEffect(() => {
    getProblemTickets()
      .then((d) => setStale(d.stale))
      .finally(() => setLoading(false));
  }, []);

  async function explain(t: JiraIssue) {
    setAiLoading(t.key);
    setExplanation(null);
    try {
      const r = await explainBlocker({
        data: {
          key: t.key,
          summary: t.fields.summary,
          description: t.fields.description,
          daysStuck: daysSince(t.fields.updated),
        },
      });
      if (r.content) setExplanation({ key: t.key, text: r.content });
    } finally {
      setAiLoading(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Predictive</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
          <AlertTriangle className="size-7 text-warning" />
          Risk Radar
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Tickets stuck "In Progress" likely to slip. Click <span className="text-primary">Why stuck?</span>{" "}
          to ask the AI for a root-cause analysis.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-card rounded-lg border border-border" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {stale.map((t, idx) => {
            const days = daysSince(t.fields.updated);
            const risk = days > 7 ? "Critical" : days > 4 ? "High" : "Medium";
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                  <div className="lg:col-span-2">
                    <TicketCard issue={t} compact highlight="danger" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">Risk</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          risk === "Critical"
                            ? "bg-destructive/15 text-destructive"
                            : risk === "High"
                              ? "bg-warning/15 text-warning"
                              : "bg-info/15 text-info"
                        }`}
                      >
                        {risk}
                      </span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums">{days.toFixed(1)}d</div>
                    <div className="text-[11px] text-muted-foreground">since last update</div>
                    <button
                      onClick={() => explain(t)}
                      disabled={aiLoading === t.key}
                      className="w-full text-xs flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors disabled:opacity-50"
                    >
                      {aiLoading === t.key ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      Why stuck?
                    </button>
                  </div>
                </div>
                {explanation?.key === t.key && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-4 pt-4 border-t border-border text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed"
                  >
                    {explanation.text}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
          {stale.length === 0 && (
            <div className="text-center text-muted-foreground italic py-16">
              No stale tickets. Backlog is healthy.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
