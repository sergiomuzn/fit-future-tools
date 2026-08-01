import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { AppRole } from "@/lib/roles";
import {
  getDevRoleOverride,
  homePathForRole,
  isDevPreview,
  setDevRoleOverride,
} from "@/lib/dev-role-preview";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Selector de rol visible solo en desarrollo. */
export function DevRoleSwitcher() {
  const [current, setCurrent] = useState<AppRole | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCurrent(getDevRoleOverride());
    setMounted(true);
  }, []);

  if (!isDevPreview || !mounted) return null;

  function pick(value: string) {
    const role = value === "real" ? null : (value as AppRole);
    setDevRoleOverride(role);
    window.location.href = role ? homePathForRole(role) : "/";
  }

  return (
    <div className="fixed right-3 top-3 z-[100] print:hidden">
      <div className="flex items-center gap-1.5 rounded-full border bg-card/95 py-1 pl-2.5 pr-1 shadow-lg backdrop-blur">
        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={current ?? "real"} onValueChange={pick}>
          <SelectTrigger className="h-7 w-[150px] rounded-full border-0 bg-transparent text-xs shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="cliente">Cliente</SelectItem>
            <SelectItem value="real">Rol real</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
