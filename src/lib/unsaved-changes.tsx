import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Sistema de aviso de "cambios sin guardar".
 * Cada formulario registra su estado con useUnsavedGuard(id, { dirty, save, discard }).
 * Al cambiar de pestaña o de apartado con cambios pendientes se muestra un diálogo
 * que permite guardar y salir, salir sin guardar o cancelar.
 */
export type UnsavedEntry = {
  dirty: () => boolean;
  /** Guarda los cambios. Devuelve false si no se pudo guardar (se cancela la salida). */
  save: () => Promise<boolean> | boolean;
  /** Restaura los valores guardados (se usa al "Salir sin guardar"). */
  discard?: () => void;
};

type CtxValue = {
  register: (id: string, entry: MutableRefObject<UnsavedEntry>) => void;
  unregister: (id: string) => void;
  /** Ejecuta la acción (cambio de pestaña, cierre…) o pide confirmación si hay cambios. */
  attempt: (action: () => void) => void;
};

const Ctx = createContext<CtxValue | null>(null);

/**
 * Dentro del editor de Lovable (la app embebida en un iframe de previsualización)
 * no mostramos el aviso de cambios sin guardar: solo molesta mientras se edita código.
 */
function isLovableEditorPreview() {
  if (typeof window === "undefined") return false;
  try {
    // Debe estar embebido en un iframe; la app publicada nunca lo está.
    if (!window.top || window.self === window.top) return false;

    const host = window.location.hostname;
    const ZONES = [
      "lovableproject.com",
      "lovableproject-dev.com",
      "lovable.app",
      "lovable.dev",
      "gpt-eng.com",
      "gptengineer.run",
    ];
    const isLovableHost = ZONES.some((z) => host === z || host.endsWith("." + z));
    if (isLovableHost) return true;

    // Si ancestorOrigins está disponible, comprobar también los orígenes superiores.
    const ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length > 0) {
      for (let i = 0; i < ancestors.length; i++) {
        const originHost = new URL(ancestors[i]).hostname;
        if (ZONES.some((z) => originHost === z || originHost.endsWith("." + z))) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, MutableRefObject<UnsavedEntry>>());
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const cancelBlockRef = useRef<(() => void) | null>(null);

  const disabled = useRef(isLovableEditorPreview());

  const hasDirty = useCallback(() => {
    if (disabled.current) return false;
    for (const r of entries.current.values()) {
      try {
        if (r.current.dirty()) return true;
      } catch {
        /* noop */
      }
    }
    return false;
  }, []);

  // Bloquea la navegación entre apartados (sidebar, enlaces, atrás…)
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => hasDirty(),
    withResolver: true,
  });

  useEffect(() => {
    if (status === "blocked") {
      cancelBlockRef.current = reset;
      setPendingAction(() => () => proceed());
    }
  }, [status, proceed, reset]);

  const register = useCallback((id: string, entry: MutableRefObject<UnsavedEntry>) => {
    entries.current.set(id, entry);
  }, []);

  const unregister = useCallback((id: string) => {
    entries.current.delete(id);
  }, []);

  const attempt = useCallback(
    (action: () => void) => {
      if (hasDirty()) setPendingAction(() => action);
      else action();
    },
    [hasDirty],
  );

  function cancel() {
    setPendingAction(null);
    cancelBlockRef.current?.();
    cancelBlockRef.current = null;
  }

  async function saveAndContinue() {
    if (!pendingAction) return;
    setSaving(true);
    let ok = true;
    for (const r of entries.current.values()) {
      try {
        if (r.current.dirty()) {
          const res = await r.current.save();
          if (res === false) ok = false;
        }
      } catch {
        ok = false;
      }
    }
    setSaving(false);
    if (!ok) return; // algún guardado falló: el usuario decide de nuevo
    const action = pendingAction;
    cancelBlockRef.current = null;
    setPendingAction(null);
    action();
  }

  function discardAndContinue() {
    for (const r of entries.current.values()) {
      try {
        if (r.current.dirty()) r.current.discard?.();
      } catch {
        /* noop */
      }
    }
    const action = pendingAction;
    cancelBlockRef.current = null;
    setPendingAction(null);
    action?.();
  }

  return (
    <Ctx.Provider value={{ register, unregister, attempt }}>
      {children}
      <AlertDialog open={pendingAction !== null} onOpenChange={(o) => { if (!o) cancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Has hecho cambios que aún no se han guardado. ¿Quieres guardarlos antes de salir?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancel} disabled={saving}>
              Cancelar
            </AlertDialogCancel>
            <Button variant="outline" onClick={discardAndContinue} disabled={saving}>
              Salir sin guardar
            </Button>
            <Button onClick={() => void saveAndContinue()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar y salir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}

export function useUnsavedChanges(): CtxValue {
  const ctx = useContext(Ctx);
  return ctx ?? { register: () => {}, unregister: () => {}, attempt: (a) => a() };
}

/**
 * Registra un formulario con cambios pendientes.
 *
 * Solo se considera que hay cambios sin guardar si el formulario llegó a estar
 * "limpio" alguna vez y además el usuario ha interactuado con él. Así evitamos
 * avisos falsos por diferencias de carga inicial o valores por defecto.
 */
export function useUnsavedGuard(id: string, entry: UnsavedEntry) {
  const ctx = useContext(Ctx);
  const sawClean = useRef(false);
  const interacted = useRef(false);
  const entryRef = useRef(entry);
  entryRef.current = entry;

  // Detecta interacción real del usuario en la página.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mark = () => {
      interacted.current = true;
    };
    window.addEventListener("pointerdown", mark, true);
    window.addEventListener("keydown", mark, true);
    return () => {
      window.removeEventListener("pointerdown", mark, true);
      window.removeEventListener("keydown", mark, true);
    };
  }, []);

  const ref = useRef<UnsavedEntry>({
    dirty: () => false,
    save: () => true,
  });
  ref.current = {
    dirty: () => {
      let d = false;
      try {
        d = entryRef.current.dirty();
      } catch {
        return false;
      }
      if (!d) {
        sawClean.current = true;
        return false;
      }
      return sawClean.current && interacted.current;
    },
    save: () => entryRef.current.save(),
    discard: () => entryRef.current.discard?.(),
  };

  useEffect(() => {
    if (!ctx) return;
    ctx.register(id, ref);
    return () => ctx.unregister(id);
  }, [ctx, id]);
}
