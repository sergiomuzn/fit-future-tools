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
import { ClientPicker } from "@/components/clients/client-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUpDown, Plus, Info } from "lucide-react";

export const Route = createFileRoute("/_shell/bonos")({ component: BonosPage });

function BonosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientBono | null>(null);
  const [sortBy, setSortBy] = useState<"nombre" | "tipo">("nombre");
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nuevo, setNuevo] = useState<{
    client_id: string | null;
    bono_catalogo_id: string;
    sesiones_disponibles: string;
    fecha_inicio: string;
  }>({
    client_id: null,
    bono_catalogo_id: "",
    sesiones_disponibles: "",
    fecha_inicio: new Date().toISOString().slice(0, 10),
  });

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

  const TIPO_LABEL: Record<string, string> = { prueba: "Prueba", individual: "Individual", pareja: "Pareja", grupal: "Grupal", gympass: "Gympass" };
  const TIPO_CLASS: Record<string, string> = {
    prueba: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
    grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    gympass: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  };
  const tipoRank: Record<string, number> = { prueba: 0, individual: 1, pareja: 2, grupal: 3, gympass: 4 };

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

  async function addBono() {
    if (!nuevo.client_id) { toast.error("Selecciona un cliente"); return; }
    if (!nuevo.bono_catalogo_id) { toast.error("Selecciona un tipo de bono"); return; }
    const sesiones = Number(nuevo.sesiones_disponibles);
    if (!Number.isFinite(sesiones) || sesiones <= 0) { toast.error("Introduce un número de sesiones válido"); return; }
    const cat = catalogo.find((c) => c.id === nuevo.bono_catalogo_id);
    // Desactivar bono activo previo del cliente
    const { error: deactErr } = await supabase
      .from("client_bonos")
      .update({ activo: false })
      .eq("client_id", nuevo.client_id)
      .eq("activo", true);
    if (deactErr) { toast.error(deactErr.message); return; }
    const { error } = await supabase.from("client_bonos").insert({
      client_id: nuevo.client_id,
      bono_catalogo_id: cat?.id ?? null,
      fecha_inicio: nuevo.fecha_inicio || new Date().toISOString().slice(0, 10),
      sesiones_disponibles: sesiones,
      sesiones_realizadas: 0,
      activo: true,
      ultimo_bono_nombre: cat?.nombre ?? "Manual",
      ultimo_bono_fecha: nuevo.fecha_inicio || new Date().toISOString().slice(0, 10),
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    toast.success("Bono añadido");
    setAddOpen(false);
    setNuevo({
      client_id: null,
      bono_catalogo_id: "",
      sesiones_disponibles: "",
      fecha_inicio: new Date().toISOString().slice(0, 10),
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-display font-semibold">Bonos</h1>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo bono</Button>
      </div>
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
              (() => {
              const tipoBono = catMap.get(b.bono_catalogo_id ?? "")?.tipo as string | undefined;
              const isGympass = tipoBono === "gympass";
              return (
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
                <TableCell>{isGympass ? "—" : b.sesiones_disponibles + b.sesiones_realizadas}</TableCell>
                <TableCell>{b.sesiones_realizadas}</TableCell>
                <TableCell className={!isGympass && b.sesiones_disponibles <= 1 ? "text-orange-500 font-semibold" : ""}>{isGympass ? "—" : b.sesiones_disponibles}</TableCell>
                <TableCell>
                  {isGympass ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-state-prueba/30 text-state-prueba-fg">Activo</span>
                  ) : b.sesiones_disponibles > 0 ? (
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
              );
              })()
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo bono</DialogTitle></DialogHeader>
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Los bonos se añaden normalmente desde <b>Facturación</b>. Lo que añadas aquí <b>no contará como facturado</b>.</span>
          </div>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <ClientPicker value={nuevo.client_id} onChange={(id) => setNuevo({ ...nuevo, client_id: id })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de bono</Label>
              <Select value={nuevo.bono_catalogo_id || ""} onValueChange={(v) => {
                const cat = v ? catalogo.find((c) => c.id === v) : null;
                setNuevo({
                  ...nuevo,
                  bono_catalogo_id: v,
                  sesiones_disponibles: cat && !nuevo.sesiones_disponibles
                    ? String(cat.sesiones_incluidas ?? "")
                    : nuevo.sesiones_disponibles,
                });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona un bono" /></SelectTrigger>
                <SelectContent>
                  {sortCatalogo(catalogo).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{TIPO_LABEL[c.tipo]} · {prettyBonoNombre(c.nombre)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sesiones</Label>
                <Input type="number" min={1} placeholder="Ej. 10" value={nuevo.sesiones_disponibles}
                  onChange={(e) => setNuevo({ ...nuevo, sesiones_disponibles: e.target.value.replace(/^0+(?=\d)/, "") })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={nuevo.fecha_inicio}
                  onChange={(e) => setNuevo({ ...nuevo, fecha_inicio: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={addBono}>Añadir bono</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}