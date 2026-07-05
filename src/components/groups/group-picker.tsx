import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase, type Group } from "@/lib/db";

interface Props {
  value: string | null;
  onChange: (groupId: string | null, group: Group | null) => void;
}

export function GroupPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await supabase.from("groups").select("*").order("nombre")).data as Group[] ?? [],
  });

  const selected = groups.find((g) => g.id === value) ?? null;
  const filtered = useMemo(
    () => groups.filter((g) => g.nombre.toLowerCase().includes(search.toLowerCase())),
    [groups, search],
  );

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          placeholder={selected ? selected.nombre : "Buscar grupo..."}
          value={search}
          className={`${selected ? "placeholder:text-foreground/90" : ""} ${selected || search ? "pr-8" : ""}`.trim() || undefined}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => {
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
            setListOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setListOpen(false), 150);
          }}
        />
        {(selected || search) && (
          <button
            type="button"
            aria-label="Limpiar grupo"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setSearch(""); onChange(null, null); setListOpen(true); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {listOpen && (
        <div className="max-h-40 overflow-y-auto rounded-md border">
          {filtered.map((g) => (
            <button
              key={g.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(g.id, g); setSearch(g.nombre); setListOpen(false); }}
              className={`w-full text-left px-2 py-1.5 text-sm hover:bg-accent ${value === g.id ? "bg-accent font-medium" : ""}`}
            >
              {g.nombre}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-2 text-xs text-muted-foreground">Sin grupos. Créalos en Clientes → Grupos.</div>
          )}
        </div>
      )}
    </div>
  );
}