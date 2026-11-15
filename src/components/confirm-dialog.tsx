import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  textInput?: { label: string; onConfirm: (value: string) => void };
};

/**
 * Sustituye a window.confirm por un diálogo con la estética de la app.
 * Uso: const { confirm, dialog } = useConfirm();  ...  {dialog}
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const [text, setText] = useState("");
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const o = typeof options === "string" ? { description: options } : options;
    setOpts(o);
    setText("");
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    if (value) opts.textInput?.onConfirm(text);
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  const dialog = (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts.title ?? "¿Confirmar acción?"}</AlertDialogTitle>
          {opts.description ? (
            <AlertDialogDescription>{opts.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {opts.textInput && <div className="space-y-2"><Label htmlFor="confirmation-note">{opts.textInput.label}</Label><Textarea id="confirmation-note" value={text} onChange={(e) => setText(e.target.value)} rows={1} className="min-h-0 resize-none [field-sizing:content]" /></div>}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {opts.cancelText ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={opts.destructive === false ? undefined : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            onClick={() => close(true)}
          >
            {opts.confirmText ?? "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
