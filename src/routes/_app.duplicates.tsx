import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Copy } from "lucide-react";
import { TicketCard } from "@/components/TicketCard";
import { getDuplicates } from "@/server/jira.functions";

export const Route = createFileRoute("/_app/duplicates")({
  component: DuplicatesPage,
  head: () => ({ meta: [{ title: "Duplicates — AgileFlow AI" }] }),
});

type Data = Awaited<ReturnType<typeof getDuplicates>>;

function DuplicatesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDuplicates()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Hygiene</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Duplicate Detective</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          AI-normalized titles grouped — Jira's keyword search misses these. Decide which one to keep
          and link the rest as duplicates in Jira.
        </p>
      </header>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-card rounded-xl border border-border" />
          ))}
        </div>
      ) : data && data.groups.length > 0 ? (
        <div className="space-y-5">
          {data.groups.map((group, idx) => (
            <motion.div
              key={group.signature}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="rounded-xl border border-warning/30 bg-card p-5"
            >
              <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-border">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-warning mb-1">
                    <Copy className="size-3.5" />
                    {group.issues.length} duplicate tickets
                  </div>
                  <h2 className="text-base font-semibold text-foreground">
                    {group.issues[0].fields.summary}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-2 py-1 rounded">
                  signature: {group.signature.slice(0, 30)}…
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {group.issues.map((i) => (
                  <TicketCard key={i.id} issue={i} compact highlight="warning" />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground italic py-16">
          No duplicate clusters found 🎉
        </div>
      )}
    </div>
  );
}
