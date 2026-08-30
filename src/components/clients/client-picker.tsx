import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase, type Client } from "@/lib/db";
import { toast } from "sonner";
import { normalizeText, formatNameTitle, fuzzyMatch } from "@/lib/utils";

interface Props {
  value: string | null;
  onChange: (clientId: string | null, client: Client | null) => void;
  autoFocus?: boolean;
  /** Texto libre escrito en el buscador (aunque no haya cliente seleccionado). */
  onTextChange?: (text: string) => void;
  /** Texto inicial mostrado cuando no hay cliente seleccionado. */
  initialText?: string;
}

export function ClientPicker({ value, onChange, autoFocus, onTextChange, initialText }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Client>>({});
  const [listOpen, setListOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await supabase.from("clients").select("*").order("nombre")).data as Client[] ?? [],
  });

  const selected = clients.find((c) => c.id === value) ?? null;

  // Keep the input text in sync with the externally selected client so the
  // user can actually edit/delete the visible name (previously it was shown
  // only as placeholder, so backspacing did nothing and the field felt locked).
  useEffect(() => {
    if (selected) setSearch(selected.nombre);
    else setSearch(initialText ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const filtered = useMemo(
    () => {
      const q = normalizeText(search);
      // If the current search text exactly matches the selected client name,
      // treat it as "no filter" so the user sees the full list to switch.
      if (!q || (selected && normalizeText(selected.nombre) === q)) return clients;
      const exact = clients.filter((c) => normalizeText(c.nombre).includes(q));
      if (exact.length > 0) return exact;
      return clients.filter((c) => fuzzyMatch(c.nombre, q));
    },
    [clients, search, selected],
  );

  useEffect(() => {
    setHighlight(0);
  }, [search, listOpen]);

  useEffect(() => {
    if (!listOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, listOpen]);

  function openNew() {
    setDraft({ nombre: search.trim(), fecha_inicio: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  async function saveNew() {
    const nombre = formatNameTitle((draft.nombre ?? "").trim());
    if (!nombre) { toast.error("Nombre requerido"); return; }
    const { data, error } = await supabase.from("clients").insert({
      nombre,
      telefono: draft.telefono ?? null,
      fecha_inicio: draft.fecha_inicio ?? null,
      cumpleanos: draft.cumpleanos ?? null,
      notas: draft.notas ?? null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["clients-search"] });
    toast.success(`Cliente «${nombre}» creado`);
    onChange(data.id, data as Client);
    setSearch((data as Client).nombre);
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          autoFocus={autoFocus}
          placeholder="Buscar cliente..."
          value={search}
          className={`${selected ? "placeholder:text-foreground/90" : ""} ${selected || search ? "pr-8" : ""}`.trim() || undefined}
          onChange={(e) => {
            const v = e.target.value;
            setSearch(v);
            setListOpen(true);
            onTextChange?.(v);
            // If the user edits the text away from the selected client, clear
            // the selection so the parent state reflects "no client picked".
            if (selected && v !== selected.nombre) onChange(null, null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setListOpen(true);
              setHighlight((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setListOpen(true);
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              if (listOpen && filtered[highlight]) {
                e.preventDefault();
                e.stopPropagation();
                const c = filtered[highlight];
                onChange(c.id, c);
                setSearch(c.nombre);
                onTextChange?.(c.nombre);
                setListOpen(false);
              }
            } else if (e.key === "Escape") {
              setListOpen(false);
            }
          }}
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
            aria-label="Limpiar cliente"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setSearch(""); onTextChange?.(""); onChange(null, null); setListOpen(true); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {listOpen && (
      <div ref={listRef} className="max-h-40 overflow-y-auto rounded-md border">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openNew}
          className="w-full text-left px-2 py-1.5 text-sm text-primary hover:bg-accent border-b border-dashed sticky top-0 bg-secondary z-10 flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo cliente{search.trim() ? ` «${search.trim()}»` : ""}
        </button>
        {filtered.map((c, idx) => (
          <button
            key={c.id}
            type="button"
            data-idx={idx}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(idx)}
            onClick={() => { onChange(c.id, c); setSearch(c.nombre); onTextChange?.(c.nombre); setListOpen(false); }}
            className={`w-full text-left px-2 py-1.5 text-sm ${idx === highlight ? "bg-accent" : ""} ${value === c.id ? "font-medium" : ""}`}
          >
            {formatNameTitle(c.nombre)}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="p-2 text-xs text-muted-foreground">Sin coincidencias.</div>
        )}
      </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input autoFocus value={draft.nombre ?? ""} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={draft.telefono ?? ""} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha de inicio</Label>
                <Input type="date" value={draft.fecha_inicio ?? ""} onChange={(e) => setDraft({ ...draft, fecha_inicio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de nacimiento</Label>
                <Input type="date" value={draft.cumpleanos ?? ""} onChange={(e) => setDraft({ ...draft, cumpleanos: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={2} value={draft.notas ?? ""} onChange={(e) => setDraft({ ...draft, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={saveNew}>Crear cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}