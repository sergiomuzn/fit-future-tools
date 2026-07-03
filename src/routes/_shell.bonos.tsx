import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { supabase, prettyBonoNombre, sortCatalogo, type ClientBono, type Client, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClientDetailsDialog } from "@/components/clients/client-details-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/_shell/bonos")({ component: BonosPage });

function BonosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientBono | null>(null);
  const [sortBy, setSortBy] = useState<"nombre" | "tipo">("nombre");
  const [historyClient, setHistoryClient] = useState<Client | null>(null);

  const { data: bonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => {
      const { data } = await supabase.from("client_bonos").select("*").order("updated_at", { ascending: false });
      return (data ?? []) as ClientBono[];
    },
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*");
      return (data ?? []) as Client[];
    },
  });
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => {
      const { data } = await supabase.from("bonos_catalogo").select("*").order("orden");
      return (data ?? []) as BonoCatalogo[];
    },
  });
  const catMap = new Map(catalogo.map((c) => [c.id, c]));

  const TIPO_LABEL: Record<string, string> = { prueba: "Prueba", individual: "Individual", pareja: "Pareja", grupal: "Grupal" };
  const TIPO_CLASS: Record<string, string> = {
    prueba: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
    grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  };
  const tipoRank: Record<string, number> = { prueba: 0, individual: 1, pareja: 2, grupal: 3 };

  const activeBonos = bonos.filter((b) => b.activo);

  const sorted = [...activeBonos].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    if (sortBy === "nombre") {
      const na = clientMap.get(a.client_id)?.nombre ?? "";
      const nb = clientMap.get(b.client_id)?.nombre ?? "";
      return na.localeCompare(nb, "es", { sensitivity: "base" });
    }
    const ta = catMap.get(a.bono_catalogo_id ?? "")?.tipo;
    const tb = catMap.get(b.bono_catalogo_id ?? "")?.tipo;
    const ra = ta ? tipoRank[ta] : 99;
    const rb = tb ? tipoRank[tb] : 99;
    if (ra !== rb) return ra - rb;
    const na = clientMap.get(a.client_id)?.nombre ?? "";
    const nb = clientMap.get(b.client_id)?.nombre ?? "";
    return na.localeCompare(nb, "es", { sensitivity: "base" });
  });

  async function save() {
    if (!editing) return;
    const selectedCatalogo = catalogo.find((c) => c.id === editing.bono_catalogo_id);
    const { error } = await supabase.from("client_bonos").update({
      bono_catalogo_id: editing.bono_catalogo_id,
      sesiones_disponibles: editing.sesiones_disponibles,
      sesiones_realizadas: editing.sesiones_realizadas,
      activo: editing.activo,
      ultimo_bono_nombre: selectedCatalogo?.nombre ?? editing.ultimo_bono_nombre,
    }).eq("id", editing.id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["client_bonos"] }); setOpen(false); toast.success("Bono actualizado"); }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Bonos</h1>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSortBy("nombre")}>
                  Nombre <ArrowUpDown className={`h-3 w-3 ${sortBy === "nombre" ? "text-foreground" : "opacity-40"}`} />
                </button>
              </TableHead>
              <TableHead>
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSortBy("tipo")}>
                  Tipo de bono <ArrowUpDown className={`h-3 w-3 ${sortBy === "tipo" ? "text-foreground" : "opacity-40"}`} />
                </button>
              </TableHead>
              <TableHead>Teóricas</TableHead>
              <TableHead>Realizadas</TableHead>
              <TableHead>Restantes</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último bono</TableHead>
              <TableHead>Última fecha</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((b) => (
              <TableRow key={b.id} className={b.activo ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  <button
                    className="hover:underline text-left"
                    onClick={() => setHistoryClient(clientMap.get(b.client_id) ?? null)}
                  >
                    {clientMap.get(b.client_id)?.nombre ?? "?"}
                  </button>
                </TableCell>
                <TableCell>
                  {(() => {
                    const t = catMap.get(b.bono_catalogo_id ?? "")?.tipo;
                    return t ? <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_CLASS[t]}`}>{TIPO_LABEL[t]}</span> : <span className="text-muted-foreground">—</span>;
                  })()}
                </TableCell>
                <TableCell>{b.sesiones_disponibles + b.sesiones_realizadas}</TableCell>
                <TableCell>{b.sesiones_realizadas}</TableCell>
                <TableCell className={b.sesiones_disponibles <= 1 ? "text-orange-500 font-semibold" : ""}>{b.sesiones_disponibles}</TableCell>
                <TableCell>
                  {b.sesiones_disponibles > 0 ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-state-prueba/30 text-state-prueba-fg">Activo</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20">Agotado</span>
                  )}
                </TableCell>
                  <TableCell>{prettyBonoNombre(b.ultimo_bono_nombre)}</TableCell>
                <TableCell>{b.ultimo_bono_fecha ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(b); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sin bonos aún · añade una factura para generar uno</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar bono</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="text-sm text-muted-foreground">{clientMap.get(editing.client_id)?.nombre}</div>
            <div className="space-y-1.5">
                <Label>Tipo de bono</Label>
                <Select value={editing.bono_catalogo_id ?? ""} onValueChange={(v) => setEditing({ ...editing, bono_catalogo_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona bono" /></SelectTrigger>
                  <SelectContent>
                    {sortCatalogo(catalogo).map((c) => <SelectItem key={c.id} value={c.id}>{TIPO_LABEL[c.tipo]} · {prettyBonoNombre(c.nombre)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Teóricas</Label><Input type="number" placeholder="0" value={editing.sesiones_disponibles === 0 ? "" : editing.sesiones_disponibles} onChange={(e) => setEditing({ ...editing, sesiones_disponibles: Number(e.target.value) || 0 })} /></div>
                <div className="space-y-1.5"><Label>Realizadas</Label><Input type="number" placeholder="0" value={editing.sesiones_realizadas === 0 ? "" : editing.sesiones_realizadas} onChange={(e) => setEditing({ ...editing, sesiones_realizadas: Number(e.target.value) || 0 })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.activo} onCheckedChange={(c) => setEditing({ ...editing, activo: c })} /><Label>Activo</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientDetailsDialog client={historyClient} defaultTab="historial" onOpenChange={(o) => !o && setHistoryClient(null)} />

      <div className="pt-2">
        <Button variant="outline" onClick={() => setShowCatalog(true)}>
          <Settings2 className="h-4 w-4 mr-1" /> Tipos de bono y precios
        </Button>
      </div>

      <CatalogoDialog open={showCatalog} onOpenChange={setShowCatalog} catalogo={catalogo} />
    </div>
  );
}

function CatalogoDialog({ open, onOpenChange, catalogo }: { open: boolean; onOpenChange: (v: boolean) => void; catalogo: BonoCatalogo[] }) {
  const qc = useQueryClient();
  const TIPO_LABEL: Record<string, string> = { individual: "Individual", pareja: "Pareja", grupal: "Grupal" };
  const [drafts, setDrafts] = useState<Record<string, { precio: string; tipo: string; sesiones: string }>>({});
  const [adding, setAdding] = useState(false);
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: string; sesiones_incluidas: string; precio: string }>({
    nombre: "", tipo: "individual", sesiones_incluidas: "1", precio: "0",
  });

  function getVal(c: BonoCatalogo, field: "precio" | "tipo" | "sesiones") {
    const d = drafts[c.id];
    if (d) return d[field];
    if (field === "precio") return String(c.precio);
    if (field === "sesiones") return String(c.sesiones_incluidas);
    return c.tipo;
  }
  function setVal(c: BonoCatalogo, field: "precio" | "tipo" | "sesiones", v: string) {
    if (field !== "tipo") v = v.replace(/^0+(?=\d)/, "");
    setDrafts((prev) => ({
      ...prev,
      [c.id]: {
        precio: field === "precio" ? v : prev[c.id]?.precio ?? String(c.precio),
        tipo: field === "tipo" ? v : prev[c.id]?.tipo ?? c.tipo,
        sesiones: field === "sesiones" ? v : prev[c.id]?.sesiones ?? String(c.sesiones_incluidas),
      },
    }));
  }
  async function saveRow(c: BonoCatalogo) {
    const d = drafts[c.id];
    if (!d) return;
    const precio = Number(d.precio);
    const sesiones = Number(d.sesiones);
    if (Number.isNaN(precio) || Number.isNaN(sesiones)) { toast.error("Valores numéricos inválidos"); return; }
    const { error } = await supabase.from("bonos_catalogo").update({
      precio,
      tipo: d.tipo as BonoCatalogo["tipo"],
      sesiones_incluidas: sesiones,
    }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    setDrafts((prev) => { const { [c.id]: _, ...rest } = prev; return rest; });
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Bono actualizado");
  }
  async function removeRow(c: BonoCatalogo) {
    if (!confirm(`¿Eliminar "${prettyBonoNombre(c.nombre)}"?`)) return;
    const { error } = await supabase.from("bonos_catalogo").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Bono eliminado");
  }
  async function addRow() {
    if (!nuevo.nombre.trim()) { toast.error("Nombre requerido"); return; }
    const sesiones = Number(nuevo.sesiones_incluidas);
    const precio = Number(nuevo.precio);
    if (Number.isNaN(sesiones) || Number.isNaN(precio)) { toast.error("Valores numéricos inválidos"); return; }
    const maxOrden = catalogo.reduce((m, c) => Math.max(m, c.orden), 0);
    const { error } = await supabase.from("bonos_catalogo").insert({
      nombre: nuevo.nombre.trim(),
      tipo: nuevo.tipo as BonoCatalogo["tipo"],
      sesiones_incluidas: sesiones,
      precio,
      orden: maxOrden + 1,
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Bono añadido");
    setNuevo({ nombre: "", tipo: "individual", sesiones_incluidas: "1", precio: "0" });
    setAdding(false);
  }

  const sorted = sortCatalogo(catalogo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tipos de bono y precios</DialogTitle>
          <p className="text-xs text-muted-foreground">Los cambios afectan a Facturación y Bonos.</p>
        </DialogHeader>
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Tipo</TableHead>
                <TableHead>Bono</TableHead>
                <TableHead className="w-24">Sesiones</TableHead>
                <TableHead className="w-28">Precio (€)</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => {
                const dirty = !!drafts[c.id];
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Select value={getVal(c, "tipo")} onValueChange={(v) => setVal(c, "tipo", v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="font-medium">{prettyBonoNombre(c.nombre)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8"
                        value={getVal(c, "sesiones")}
                        onChange={(e) => setVal(c, "sesiones", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="5"
                        className="h-8"
                        value={getVal(c, "precio")}
                        onChange={(e) => setVal(c, "precio", e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" disabled={!dirty} onClick={() => saveRow(c)}>Guardar</Button>
                      <Button size="icon" variant="ghost" onClick={() => removeRow(c)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {adding && (
                <TableRow>
                  <TableCell>
                    <Select value={nuevo.tipo} onValueChange={(v) => setNuevo({ ...nuevo, tipo: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input className="h-8" placeholder="Nombre (p. ej. 10 ses 45')" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8" type="number" value={nuevo.sesiones_incluidas} onChange={(e) => setNuevo({ ...nuevo, sesiones_incluidas: e.target.value.replace(/^0+(?=\d)/, "") })} />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8" type="number" step="5" value={nuevo.precio} onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value.replace(/^0+(?=\d)/, "") })} />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" onClick={addRow}>Añadir</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          {!adding && (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo tipo de bono
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}