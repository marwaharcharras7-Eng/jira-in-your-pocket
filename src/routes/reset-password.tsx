import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPage,
  head: () => ({ meta: [{ title: "Reset password — Jira in Your Pocket" }] }),
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);

  // Supabase emits PASSWORD_RECOVERY when the user lands here from the recovery email.
  // We must wait for the recovery session to be established before allowing updateUser().
  useEffect(() => {
    let cancelled = false;

    // 1) If the URL contains a recovery hash (access_token + type=recovery), Supabase
    //    will handle it automatically (detectSessionInUrl is on by default) and emit
    //    PASSWORD_RECOVERY. We listen for it.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });

    // 2) Also check existing session (in case the event already fired before mount).
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setReady(true);
    });

    // 3) Detect bad / expired link: no hash and no session after a short delay.
    const t = setTimeout(() => {
      if (cancelled) return;
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (!ready && !hash.includes("access_token")) {
        setError(
          "This reset link is invalid or has expired. Please request a new one from the login page.",
        );
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess(true);
    // Sign out so user logs in fresh with new password
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate({ to: "/login" });
    }, 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.3)]">
        <h1 className="text-xl font-bold">Set a new password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter and confirm your new password below.
        </p>

        {success ? (
          <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
            <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
            <span>Password updated. Redirecting to sign in…</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                disabled={!ready || loading}
                className="w-full h-11 pl-10 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                disabled={!ready || loading}
                className="w-full h-11 pl-10 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              />
            </div>

            {!ready && !error && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Verifying reset link…
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!ready || loading}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
