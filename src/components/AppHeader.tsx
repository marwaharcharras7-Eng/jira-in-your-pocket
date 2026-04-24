import { useState } from "react";
import { LogOut, User as UserIcon, Shield, Wrench } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const { profile, role, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const initials = (profile?.display_name ?? profile?.email ?? "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    window.location.href = "/login";
  }

  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-end gap-2 px-4">
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 h-9 px-2 rounded-lg border border-border bg-card hover:bg-accent transition-all">
              <div className="size-7 rounded-md bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-xs font-bold flex items-center justify-center">
                {initials}
              </div>
              <span className="text-xs font-medium hidden sm:block">
                {profile?.display_name ?? profile?.email}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{profile?.display_name}</span>
                <span className="text-xs text-muted-foreground font-normal">{profile?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-2 text-xs">
                {role === "manager" ? (
                  <>
                    <Shield className="size-3.5 text-primary" />
                    <span className="text-primary font-semibold">Maintenance Manager</span>
                  </>
                ) : (
                  <>
                    <Wrench className="size-3.5 text-info" />
                    <span className="text-info font-semibold">Maintenance Technician</span>
                  </>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserIcon className="size-4 mr-2" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
              <LogOut className="size-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
