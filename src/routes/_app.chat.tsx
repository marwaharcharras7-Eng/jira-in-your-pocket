import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, Loader2, Sparkles } from "lucide-react";
import { askBacklog } from "@/server/jira.functions";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
  head: () => ({ meta: [{ title: "Ask AI — Jira in Your Pocket" }] }),
});

type Msg = { role: "user" | "assistant"; content: string };

const MANAGER_SUGGESTIONS = [
  "Which technician has the heaviest workload right now?",
  "Which machine has the most open issues across the team?",
  "List the top 5 highest-priority tickets that are still open.",
  "Show tickets stuck In Progress for more than 3 days, by assignee.",
  "Which technicians have tickets with vague or missing descriptions?",
  "What recurring problems do we see this month, grouped by machine?",
];

const TECHNICIAN_SUGGESTIONS = [
  "What are my highest-priority open tickets?",
  "Which of my tickets are In Progress for the longest?",
  "Do any of my tickets have vague descriptions I should improve?",
  "Which machine do I have the most tickets on?",
  "Summarize what I should work on next, with reasoning.",
  "Are any of my tickets potentially duplicates?",
];

function ChatPage() {
  const { isManager, profile } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = isManager ? MANAGER_SUGGESTIONS : TECHNICIAN_SUGGESTIONS;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const r = await askBacklog({ data: { question: text } });
      setMessages((m) => [
        ...m,
        { role: "assistant", content: r.content ?? r.error ?? "No response." },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: e instanceof Error ? e.message : "Failed" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const greeting = isManager
    ? "Ask anything about the team's CMV backlog. The AI sees every ticket."
    : `Ask anything about your tickets${profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}. The AI only sees what is assigned to you.`;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto h-screen flex flex-col">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">AI Chat</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1 flex items-center gap-2">
          <MessageSquare className="size-7 text-primary" />
          {isManager ? "Ask the Team Backlog" : "Ask My Backlog"}
        </h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-6">
            <div className="size-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
              <Sparkles className="size-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">{greeting}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-card/80 p-3 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground"
              }`}
            >
              {m.content}
            </div>
          </motion.div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Analyzing backlog…
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 pt-3 border-t border-border"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isManager ? "Ask about the team's backlog…" : "Ask about your tickets…"}
          disabled={loading}
          className="flex-1 bg-input border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
