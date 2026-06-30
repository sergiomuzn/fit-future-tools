import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { supabase, type Client, type ClientBono, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientDetailsDialog } from "@/components/clients/client-details-dialog";
import { exportToXlsx } from "@/lib/export-xlsx";

export const Route = createFileRoute("/_shell/clientes")({
  component: ClientesPage,
});

function ClientesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Client> | null>(null);
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState<Client | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").order("nombre");
      return (data ?? []) as Client[];
    },
  });
  const { data: clientBonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => (await supabase.from("client_bonos").select("*")).data as ClientBono[] ?? [],
  });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*")).data as BonoCatalogo[] ?? [],
  });
  const catMap = new Map(catalogo.map((c) => [c.id, c]));
  const tipoByClient = new Map<string, "individual" | "pareja" | "grupal">();
  for (const b of clientBonos) {
    if (!b.activo) continue;
    if (b.bono_catalogo_id) {
      const t = catMap.get(b.bono_catalogo_id)?.tipo;
      if (t && !tipoByClient.has(b.client_id)) tipoByClient.set(b.client_id, t);
    }
  }
  const TIPO_LABEL: Record<string, string> = { individual: "Individual", pareja: "Pareja", grupal: "Grupal" };
  const TIPO_CLASS: Record<string, string> = {
    individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
    grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  };

    const filtered = clients
    .filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const aa = a.activo ? 0 : 1;
      const bb = b.activo ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });

  async function save() {
    if (!editing?.nombre) { toast.error("Nombre requerido"); return; }
    const payload = {
      nombre: editing.nombre,
      telefono: editing.telefono ?? null,
      fecha_inicio: editing.fecha_inicio ?? null,
      cumpleanos: editing.cumpleanos ?? null,
      notas: editing.notas ?? null,
      activo: editing.activo ?? true,
    };
    const { error } = editing.id
      ? await supabase.from("clients").update(payload).eq("id", editing.id)
      : await supabase.from("clients").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Cliente guardado"); qc.invalidateQueries({ queryKey: ["clients"] }); setOpen(false); }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar cliente?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Cliente eliminado"); qc.invalidateQueries({ queryKey: ["clients"] }); }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold">Clientes</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => exportToXlsx("clientes", filtered.map((c) => ({
            Nombre: c.nombre,
            "Tipo de bono": (TIPO_LABEL[tipoByClient.get(c.id) ?? ""] ?? ""),
            Estado: c.activo ? "Activo" : "Inactivo",
            Teléfono: c.telefono ?? "",
            "Fecha inicio": c.fecha_inicio ?? "",
            Cumpleaños: c.cumpleanos ?? "",
            Notas: c.notas ?? "",
          })), "Clientes")}>
            <Download className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button onClick={() => { setEditing({}); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo cliente
          </Button>
        </div>
      </div>
      <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo de bono</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Fecha inicio</TableHead>
              <TableHead>Cumpleaños</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className={c.activo ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  <button className="hover:underline text-left" onClick={() => setViewing(c)}>{c.nombre}</button>
                </TableCell>
                <TableCell>
                  {(() => {
                    const t = tipoByClient.get(c.id);
                    return t ? <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_CLASS[t]}`}>{TIPO_LABEL[t]}</span> : <span className="text-muted-foreground">—</span>;
                  })()}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.activo ? "bg-state-prueba/30 text-state-prueba-fg" : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20"}`}>{c.activo ? "Activo" : "Inactivo"}</span>
                </TableCell>
                <TableCell>{c.telefono ?? "—"}</TableCell>
                <TableCell>{c.fecha_inicio ?? "—"}</TableCell>
                <TableCell>{c.cumpleanos ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin clientes</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={editing?.nombre ?? ""} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Teléfono</Label><Input value={editing?.telefono ?? ""} onChange={(e) => setEditing({ ...editing, telefono: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={editing?.fecha_inicio ?? ""} onChange={(e) => setEditing({ ...editing, fecha_inicio: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Cumpleaños</Label><Input type="date" value={editing?.cumpleanos ?? ""} onChange={(e) => setEditing({ ...editing, cumpleanos: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notas</Label><Textarea rows={2} value={editing?.notas ?? ""} onChange={(e) => setEditing({ ...editing, notas: e.target.value })} /></div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="activo" checked={editing?.activo ?? true} onCheckedChange={(v) => setEditing({ ...editing, activo: Boolean(v) })} />
              <Label htmlFor="activo" className="cursor-pointer">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ClientDetailsDialog client={viewing} defaultTab="info" onOpenChange={(o) => !o && setViewing(null)} />
    </div>
  );
}