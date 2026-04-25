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
import { runDuePreventivePlans } from "./preventive.server";

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

// (advanceNextRun & runDuePreventivePlans live in ./preventive.server.ts)


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

// ─── SCHEDULER (called by cron) — implementation in ./preventive.server.ts


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
