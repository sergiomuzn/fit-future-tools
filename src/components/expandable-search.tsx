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

  function close() {
    onChange("");
    setOpen(false);
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
    <div className={cn("flex items-center gap-1", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className={cn("h-9 w-64 pl-8 pr-8", inputClassName)}
        />
        {value && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Button variant="ghost" size="icon" aria-label="Cerrar búsqueda" onClick={close}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
