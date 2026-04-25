import { createFileRoute } from "@tanstack/react-router";
import { runDuePreventivePlans } from "@/server/preventive.functions";

/**
 * Public cron endpoint — called daily at 08:00 UTC by pg_cron.
 * Creates Jira tickets for every active preventive plan whose next_run_at has arrived.
 *
 * Security: requires Bearer <SUPABASE_PUBLISHABLE_KEY> in the Authorization header.
 */
export const Route = createFileRoute("/api/public/hooks/preventive-scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!token || !expected || token !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const report = await runDuePreventivePlans();
          return new Response(JSON.stringify({ ok: true, ...report }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Scheduler failed";
          console.error("preventive-scheduler error", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
