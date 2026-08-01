import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, GripVertical, Loader2 } from "lucide-react";
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

const POS_KEY = "dev-role-switcher-pos";

function clampToViewport(x: number, y: number, w = 220, h = 40) {
  return {
    x: Math.min(Math.max(x, 4), Math.max(4, window.innerWidth - w - 4)),
    y: Math.min(Math.max(y, 4), Math.max(4, window.innerHeight - h - 4)),
  };
}

/** Selector de rol visible solo en desarrollo. */
export function DevRoleSwitcher() {
  const [current, setCurrent] = useState<AppRole | null>(null);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setCurrent(getDevRoleOverride());
    setMounted(true);
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (typeof p?.x === "number" && typeof p?.y === "number") setPos(clampToViewport(p.x, p.y));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    const next = clampToViewport(
      e.clientX - offsetRef.current.x,
      e.clientY - offsetRef.current.y,
      rect?.width,
      rect?.height,
    );
    setPos(next);
  }, []);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    setPos((p) => {
      if (p) {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(p));
        } catch {
          /* ignore */
        }
      }
      return p;
    });
  }, []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragging, onPointerMove, onPointerUp]);

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

  function startDrag(e: React.PointerEvent) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    offsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top });
    setDragging(true);
    e.preventDefault();
  }

  return (
    <div
      ref={boxRef}
      className="fixed z-[100] print:hidden"
      style={pos ? { left: pos.x, top: pos.y } : { right: 12, top: 12 }}
    >
      <div className="flex items-center gap-1 rounded-full border bg-card/95 py-1 pl-1 pr-1 shadow-lg backdrop-blur">
        <button
          type="button"
          onPointerDown={startDrag}
          aria-label="Mover selector de rol"
          title="Arrastra para mover"
          className={`flex h-6 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
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
