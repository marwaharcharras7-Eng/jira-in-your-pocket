import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "manager" | "technician";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  jira_email: string | null;
  jira_account_id: string | null;
  avatar_url: string | null;
};

type AuthContextValue = {
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isManager: boolean;
  isTechnician: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

type WindowWithServerFnPatch = Window & { __sfFetchPatched?: boolean };

function installServerFnAuthFetchPatch() {
  if (typeof window === "undefined") return;

  const patchedWindow = window as WindowWithServerFnPatch;
  if (patchedWindow.__sfFetchPatched) return;

  patchedWindow.__sfFetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes("/_serverFn/")) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (token) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );

        if (!headers.has("authorization")) {
          headers.set("authorization", `Bearer ${token}`);
        }

        return originalFetch(input, { ...init, headers });
      }
    }

    return originalFetch(input, init);
  };
}

installServerFnAuthFetchPatch();

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  async function loadProfile(uid: string) {
    const [{ data: prof }, { data: roleRow }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile((prof as Profile) ?? null);
    setRole((roleRow?.role as AppRole) ?? null);
  }

  async function refresh() {
    if (user) await loadProfile(user.id);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadProfile(sess.user.id), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
  }

  const value: AuthContextValue = {
    loading,
    user,
    session,
    profile,
    role,
    isManager: role === "manager",
    isTechnician: role === "technician",
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
