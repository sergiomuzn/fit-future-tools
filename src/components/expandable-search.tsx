import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

/** Buscador compacto: solo la lupa; al pincharla se despliega el campo. */
export function ExpandableSearch({
  value,
  onChange,
  placeholder = "Buscar...",
  className,
  inputClassName,
}: Props) {
  const [open, setOpen] = React.useState(false);
  // Texto local: las letras aparecen al instante y la lista se filtra
  // un momento después, sin bloquear la escritura.
  const [text, setText] = React.useState(value);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const container = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    function onOutsideClick(event: MouseEvent) {
      if (!(event.target instanceof Node) || container.current?.contains(event.target)) return;
      // A nonempty search remains visible and keeps filtering after outside clicks.
      if (text) return;
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        setOpen(false);
      }, 0);
    }
    document.addEventListener("click", onOutsideClick, true);
    return () => {
      document.removeEventListener("click", onOutsideClick, true);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [open, text]);
  React.useEffect(() => {
    if (timer.current == null) setText(value);
  }, [value]);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function emit(v: string, immediate = false) {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    if (immediate) {
      timer.current = null;
      onChange(v);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      onChange(v);
    }, 150);
  }

  function close() {
    if (!text) setOpen(false);
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label="Buscar"
        title="Buscar"
        className={className}
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div ref={container} className={cn("flex items-center gap-1", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          autoComplete="nope"
          value={text}
          placeholder={placeholder}
          onChange={(e) => emit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className={cn("h-9 w-64 pl-8 pr-8", inputClassName)}
        />
        {text && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => emit("", true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
