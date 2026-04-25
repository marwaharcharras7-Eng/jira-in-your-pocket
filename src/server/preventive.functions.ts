/**
 * Preventive maintenance planning — manager-only.
 * Plans are stored in `preventive_plans`. A daily cron hits the public
 * scheduler endpoint which calls `runDuePreventivePlans` to create Jira
 * tickets for plans whose `next_run_at` has arrived.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "../integrations/supabase/auth-middleware";
import { supabaseAdmin } from "../integrations/supabase/client.server";
import { createJiraIssue } from "../lib/jira-write";

async function requireManagerRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();
  if (!data) throw new Error("Only managers can manage preventive plans");
}

export type PreventivePlan = {
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

/** Compute the next run timestamp by advancing `from` by the configured period. */
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

// ─── LIST ──────────────────────────────────────────────────────────────────

export const listPreventivePlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await requireManagerRole(context.userId);
      const { data, error } = await supabaseAdmin
        .from("preventive_plans")
        .select("*")
        .order("next_run_at", { ascending: true });
      if (error) throw error;
      return { plans: (data ?? []) as PreventivePlan[], error: null as string | null };
    } catch (e) {
      return {
        plans: [] as PreventivePlan[],
        error: e instanceof Error ? e.message : "Failed to load plans",
      };
    }
  });

// ─── CREATE ────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().nullable(),
  machineId: z
    .string()
    .min(1)
    .max(10)
    .regex(/^M\d{1,2}$/i, "Machine must be like M01, M07…"),
  startAt: z.string().min(1), // ISO datetime
  periodDays: z.number().int().min(0).max(7),
  periodWeeks: z.number().int().min(0).max(4),
  periodMonths: z.number().int().min(0).max(12),
  periodYears: z.number().int().min(0).max(10),
  assigneeAccountId: z.string().optional().nullable(),
});

export const createPreventivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof CreateSchema>) => CreateSchema.parse(data))
  .handler(async ({ context, data }) => {
    try {
      await requireManagerRole(context.userId);

      const startAt = new Date(data.startAt);
      if (Number.isNaN(startAt.getTime())) {
        throw new Error("Invalid start date");
      }

      const period = {
        period_days: data.periodDays,
        period_weeks: data.periodWeeks,
        period_months: data.periodMonths,
        period_years: data.periodYears,
      };

      // For one-shot plans (period = 0) the next run is start_at itself.
      const nextRun = startAt;

      const { data: row, error } = await supabaseAdmin
        .from("preventive_plans")
        .insert({
          title: data.title,
          description: data.description ?? null,
          machine_id: data.machineId.toUpperCase(),
          assignee_account_id: data.assigneeAccountId ?? null,
          start_at: startAt.toISOString(),
          ...period,
          next_run_at: nextRun.toISOString(),
          created_by: context.userId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return { plan: row as PreventivePlan, error: null as string | null };
    } catch (e) {
      return { plan: null, error: e instanceof Error ? e.message : "Create failed" };
    }
  });

// ─── DELETE / TOGGLE ───────────────────────────────────────────────────────

export const deletePreventivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    try {
      await requireManagerRole(context.userId);
      const { error } = await supabaseAdmin
        .from("preventive_plans")
        .delete()
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, error: null as string | null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
    }
  });

export const togglePreventivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; active: boolean }) => data)
  .handler(async ({ context, data }) => {
    try {
      await requireManagerRole(context.userId);
      const { error } = await supabaseAdmin
        .from("preventive_plans")
        .update({ active: data.active })
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, error: null as string | null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
    }
  });

// ─── SCHEDULER (called by cron) ────────────────────────────────────────────

/**
 * Find every active plan whose `next_run_at` <= now, create a Jira ticket,
 * then either advance `next_run_at` (recurring) or deactivate (one-shot).
 * Returns a small report. Safe to call multiple times.
 */
export async function runDuePreventivePlans(now = new Date()) {
  const { data, error } = await supabaseAdmin
    .from("preventive_plans")
    .select("*")
    .eq("active", true)
    .lte("next_run_at", now.toISOString());
  if (error) throw error;

  const plans = (data ?? []) as PreventivePlan[];
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
        active = false; // one-shot
      } else {
        // Advance next_run from the previous next_run_at, not now, to keep cadence.
        let next = advanceNextRun(new Date(plan.next_run_at), plan);
        // If we missed multiple cycles, fast-forward past `now`.
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

/** Manual trigger for managers to run the scheduler from the UI (testing). */
export const runPreventivePlansNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await requireManagerRole(context.userId);
      const report = await runDuePreventivePlans();
      return { ...report, error: null as string | null };
    } catch (e) {
      return {
        created: [],
        failed: [],
        scanned: 0,
        error: e instanceof Error ? e.message : "Run failed",
      };
    }
  });
