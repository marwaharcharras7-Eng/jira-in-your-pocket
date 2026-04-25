import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Kanban,
  Sparkles,
  Copy,
  AlertTriangle,
  MessageSquare,
  Users,
  Activity,
  Shield,
  Wrench,
  BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  const { role, profile } = useAuth();
  const items = NAV.filter((n) => !role || (n.roles as readonly string[]).includes(role));

  return (
    <div className="flex flex-col h-full px-3 py-5">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2 px-2 mb-5">
        <div className="size-8 rounded-md bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center font-bold text-primary-foreground shadow-[0_0_20px_oklch(0.68_0.20_255_/_0.4)]">
          A
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-foreground">AgileFlow</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">CMV · AI</span>
        </div>
      </Link>

      {role && (
        <div className="mx-2 mb-4 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border">
          {role === "manager" ? (
            <Shield className="size-3.5 text-primary" />
          ) : (
            <Wrench className="size-3.5 text-info" />
          )}
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {role === "manager" ? "Manager" : "Technician"}
            </span>
            <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
              {profile?.display_name?.split(" ")[0] ?? "—"}
            </span>
          </div>
        </div>
      )}

      <nav className="flex flex-col gap-0.5 overflow-y-auto">
        {items.map((n) => {
          const Icon = n.icon;
          const active = loc.pathname === n.to;
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_0.05)]"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} />
              <span className="font-medium">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pt-4 border-t border-sidebar-border">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Connected to
        </div>
        <div className="text-xs text-foreground font-medium">bpmproject.atlassian.net</div>
        <div className="text-xs text-muted-foreground">Project · CMV</div>
      </div>
    </div>
  );
}

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["manager", "technician"] },
  { to: "/board", label: "Board", icon: Kanban, roles: ["manager", "technician"] },
  { to: "/backlog", label: "Backlog", icon: Activity, roles: ["manager", "technician"] },
  { to: "/duplicates", label: "Duplicates", icon: Copy, roles: ["manager"] },
  { to: "/rewriter", label: "AI Rewriter", icon: Sparkles, roles: ["manager", "technician"] },
  { to: "/suggestions", label: "AI Suggestions", icon: BrainCircuit, roles: ["manager"] },
  { to: "/risk", label: "Risk Radar", icon: AlertTriangle, roles: ["manager"] },
  { to: "/team", label: "Team Load", icon: Users, roles: ["manager"] },
  { to: "/chat", label: "Ask AI", icon: MessageSquare, roles: ["manager", "technician"] },
] as const;

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-sidebar h-screen sticky top-0">
      <SidebarContent />
    </aside>
  );
}
