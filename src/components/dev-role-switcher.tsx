import { useEffect, useState } from "react";
import { Shield, Dumbbell, User, FlaskConical } from "lucide-react";
import type { AppRole } from "@/lib/roles";
import {
  getDevRoleOverride,
  homePathForRole,
  isDevPreview,
  setDevRoleOverride,
} from "@/lib/dev-role-preview";
import { cn } from "@/lib/utils";

const ROLES: { role: AppRole; label: string; icon: typeof Shield }[] = [
  { role: "admin", label: "Admin", icon: Shield },
  { role: "entrenador", label: "Entrenador", icon: Dumbbell },
  { role: "cliente", label: "Cliente", icon: User },
];

/** Selector de rol visible solo en desarrollo. */
export function DevRoleSwitcher() {
  const [current, setCurrent] = useState<AppRole | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCurrent(getDevRoleOverride());
    setMounted(true);
  }, []);

  if (!isDevPreview || !mounted) return null;

  function pick(role: AppRole | null) {
    setDevRoleOverride(role);
    window.location.href = role ? homePathForRole(role) : "/";
  }

  return (
    <div className="fixed bottom-3 left-1/2 z-[100] -translate-x-1/2 print:hidden">
      <div className="flex items-center gap-1 rounded-full border bg-card/95 px-2 py-1 shadow-lg backdrop-blur">
        <FlaskConical className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
        <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Vista dev
        </span>
        {ROLES.map(({ role, label, icon: Icon }) => (
          <button
            key={role}
            type="button"
            onClick={() => pick(role)}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
              current === role
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => pick(null)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs transition-colors",
            current === null
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          Real
        </button>
      </div>
    </div>
  );
}
