/**
 * Server-only logic for the preventive scheduler.
 * Kept out of `.functions.ts` so the public cron route can import it without
 * pulling server-fn RPC stubs into the client bundle.
 */
import { supabaseAdmin } from "../integrations/supabase/client.server";
import { createJiraIssue } from "../lib/jira-write";

export type PreventivePlanRow = {
  id: string;
  title: string;
  description: string | null;
  machine_id: string;
  assignee_account_id: string | null;
  start_at: string;
  period_days: number;
  period_weeks: number;
  period_months: number;
  period_years: number;
  next_run_at: string;
  last_run_at: string | null;
  occurrences_count: number;
  active: boolean;
  created_at: string;
};

export function advanceNextRun(
  from: Date,
  p: { period_days: number; period_weeks: number; period_months: number; period_years: number },
): Date {
  const d = new Date(from.getTime());
  if (p.period_years) d.setUTCFullYear(d.getUTCFullYear() + p.period_years);
  if (p.period_months) d.setUTCMonth(d.getUTCMonth() + p.period_months);
  if (p.period_weeks) d.setUTCDate(d.getUTCDate() + p.period_weeks * 7);
  if (p.period_days) d.setUTCDate(d.getUTCDate() + p.period_days);
  return d;
}

function periodIsZero(p: {
  period_days: number;
  period_weeks: number;
  period_months: number;
  period_years: number;
}) {
  return !p.period_days && !p.period_weeks && !p.period_months && !p.period_years;
}

export async function runDuePreventivePlans(now = new Date()) {
  const { data, error } = await supabaseAdmin
    .from("preventive_plans")
    .select("*")
    .eq("active", true)
    .lte("next_run_at", now.toISOString());
  if (error) throw error;

  const plans = (data ?? []) as PreventivePlanRow[];
  const created: Array<{ planId: string; jiraKey: string }> = [];
  const failed: Array<{ planId: string; error: string }> = [];

  for (const plan of plans) {
    try {
      const summary = `${plan.machine_id} - ${plan.title}`;
      const { key } = await createJiraIssue({
        summary,
        description: plan.description ?? undefined,
        machineId: plan.machine_id,
        assigneeAccountId: plan.assignee_account_id,
        issueType: "Preventive",
      });

      let nextRunIso: string | null = null;
      let active = true;
      if (periodIsZero(plan)) {
        active = false;
      } else {
        let next = advanceNextRun(new Date(plan.next_run_at), plan);
        while (next.getTime() <= now.getTime()) {
          next = advanceNextRun(next, plan);
        }
        nextRunIso = next.toISOString();
      }

      await supabaseAdmin
        .from("preventive_plans")
        .update({
          last_run_at: now.toISOString(),
          occurrences_count: plan.occurrences_count + 1,
          ...(nextRunIso ? { next_run_at: nextRunIso } : {}),
          active,
        })
        .eq("id", plan.id);

      created.push({ planId: plan.id, jiraKey: key });
    } catch (e) {
      failed.push({ planId: plan.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { created, failed, scanned: plans.length };
}
