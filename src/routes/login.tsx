import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Mail, Lock, Loader2, AlertCircle, Shield, Wrench } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ThemeToggle } from "@/components/ThemeToggle";
import { setMyRole } from "@/server/account.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — Jira in Your Pocket" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupRole, setSignupRole] = useState<"manager" | "technician">("technician");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { selected_role: signupRole },
          },
        });
        if (err) throw err;
        // auto-confirm enabled → session is active
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session) {
          // Persist the chosen role server-side (respects team_seed lock).
          try {
            const result = await setMyRole({ data: { role: signupRole } });
            if (result?.locked) {
              setInfo(
                `Your account is pre-assigned the "${result.role}" role and cannot be changed.`,
              );
            }
          } catch (roleErr) {
            console.error("setMyRole failed", roleErr);
          }
          navigate({ to: "/" });
        } else {
          setInfo(
            `Account created as ${signupRole === "manager" ? "Maintenance Manager" : "Maintenance Technician"}. Check your email to confirm, then sign in.`,
          );
          setMode("signin");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/`,
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (!result.redirected) {
      navigate({ to: "/" });
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div
        className="absolute inset-0 -z-10 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.68 0.20 255 / 0.25), transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground font-bold text-xl shadow-[0_0_30px_oklch(0.68_0.20_255_/_0.5)]">
            A
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Jira in Your Pocket</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            CMV Maintenance Backlog Intelligence
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-6 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.5)]">
          <div className="flex gap-1 mb-5 p-1 rounded-lg bg-muted">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "signin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "signup" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@uit.ac.ma"
                className="w-full h-11 pl-10 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full h-11 pl-10 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
              />
            </div>


            {mode === "signup" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground px-1">
                  Choose your role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSignupRole("technician")}
                    className={`flex flex-col items-center justify-center gap-1.5 h-20 rounded-lg border text-xs font-medium transition-all ${
                      signupRole === "technician"
                        ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/30"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <Wrench className="size-4" />
                    Maintenance Technician
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignupRole("manager")}
                    className={`flex flex-col items-center justify-center gap-1.5 h-20 rounded-lg border text-xs font-medium transition-all ${
                      signupRole === "manager"
                        ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/30"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <Shield className="size-4" />
                    Maintenance Manager
                  </button>
                </div>
              </div>
            )}

            {mode === "signin" && (
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="p-2.5 rounded-lg bg-info/10 border border-info/30 text-info text-xs">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="relative my-5 flex items-center">
            <div className="flex-1 h-px bg-border" />
            <span className="px-3 text-[10px] uppercase tracking-wider text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={handleGoogle}
            className="w-full h-11 rounded-lg border border-border bg-background hover:bg-accent transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <svg className="size-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5">
          Use your <span className="text-foreground font-medium">@uit.ac.ma</span> email to be matched
          to your Jira role automatically.
        </p>
      </motion.div>
    </div>
  );
}
