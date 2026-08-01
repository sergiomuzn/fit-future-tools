import { useEffect, useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { devSignInAs } from "@/lib/dev-auth.functions";
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrent(getDevRoleOverride());
    setMounted(true);
  }, []);

  if (!isDevPreview || !mounted) return null;

  async function pick(value: string) {
    if (value === "real") {
      setDevRoleOverride(null);
      await supabase.auth.signOut();
      window.location.href = "/auth";
      return;
    }
    const role = value as Exclude<AppRole, "entrenador">;
    setBusy(true);
    try {
      const session = await devSignInAs({ data: { role } });
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) throw error;
      setDevRoleOverride(role);
      window.location.href = homePathForRole(role);
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar de rol");
    }
  }

  return (
    <div className="fixed right-3 top-3 z-[100] print:hidden">
      <div className="flex items-center gap-1.5 rounded-full border bg-card/95 py-1 pl-2.5 pr-1 shadow-lg backdrop-blur">
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Select value={current ?? "real"} onValueChange={(v) => void pick(v)} disabled={busy}>
          <SelectTrigger className="h-7 w-[150px] rounded-full border-0 bg-transparent text-xs shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="cliente">Cliente</SelectItem>
            <SelectItem value="real">Cerrar sesión (real)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
