/**
 * User-facing account helpers (role selection on signup, audit export, etc.)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "../integrations/supabase/auth-middleware";
import { supabaseAdmin } from "../integrations/supabase/client.server";

const RoleSchema = z.object({
  role: z.enum(["manager", "technician"]),
});

/**
 * Sets the role for the current user. Used right after signup so the user can
 * pick between "Maintenance Manager" and "Maintenance Technician".
 *
 * Safety: a user can only change their OWN role, and only if they don't appear
 * in `team_seed` (seeded users keep the role assigned to them by the company).
 */
export const setMyRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // Look up the user's email from the profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.email) {
      return { ok: false, error: "Profile not found" };
    }

    // Respect company seed list: if the email is seeded, do NOT allow override
    const { data: seed } = await supabaseAdmin
      .from("team_seed")
      .select("role")
      .eq("email", profile.email)
      .maybeSingle();

    if (seed) {
      return { ok: true, role: seed.role, locked: true };
    }

    // Upsert the role
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .update({ role: data.role })
        .eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: data.role });
      if (error) return { ok: false, error: error.message };
    }

    return { ok: true, role: data.role, locked: false };
  });
