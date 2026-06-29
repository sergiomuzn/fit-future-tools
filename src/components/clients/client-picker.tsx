import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase, type Client } from "@/lib/db";
import { toast } from "sonner";

interface Props {
  value: string | null;
  onChange: (clientId: string, client: Client) => void;
}

export function ClientPicker({ value, onChange }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Client>>({});

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await supabase.from("clients").select("*").order("nombre")).data as Client[] ?? [],
  });

  const selected = clients.find((c) => c.id === value) ?? null;
  const filtered = useMemo(
    () => clients.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase())),
    [clients, search],
  );

  function openNew() {
    setDraft({ nombre: search.trim(), fecha_inicio: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  async function saveNew() {
    const nombre = (draft.nombre ?? "").trim();
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
      <Input
        placeholder={selected ? selected.nombre : "Buscar cliente..."}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-40 overflow-y-auto rounded-md border">
        <button
          type="button"
          onClick={openNew}
          className="w-full text-left px-2 py-1.5 text-sm text-primary hover:bg-accent border-b sticky top-0 bg-card flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo cliente{search.trim() ? ` «${search.trim()}»` : ""}
        </button>
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { onChange(c.id, c); setSearch(c.nombre); }}
            className={`w-full text-left px-2 py-1.5 text-sm hover:bg-accent ${value === c.id ? "bg-accent font-medium" : ""}`}
          >
            {c.nombre}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="p-2 text-xs text-muted-foreground">Sin coincidencias.</div>
        )}
      </div>

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
                <Label>Cumpleaños</Label>
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