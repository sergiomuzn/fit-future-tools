import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, ChevronDown, ChevronRight } from "lucide-react";
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
  const [showCatalog, setShowCatalog] = useState(false);

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

  const TIPO_LABEL: Record<string, string> = { individual: "Individual", pareja: "Pareja", grupal: "Grupal" };
  const TIPO_CLASS: Record<string, string> = {
    individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
    grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  };
  const tipoRank: Record<string, number> = { individual: 0, pareja: 1, grupal: 2 };

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
      <CatalogoSection open={showCatalog} onToggle={() => setShowCatalog((v) => !v)} catalogo={catalogo} />
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
                <div className="space-y-1.5"><Label>Disponibles</Label><Input type="number" value={editing.sesiones_disponibles} onChange={(e) => setEditing({ ...editing, sesiones_disponibles: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Realizadas</Label><Input type="number" value={editing.sesiones_realizadas} onChange={(e) => setEditing({ ...editing, sesiones_realizadas: Number(e.target.value) })} /></div>
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
    </div>
  );
}

function CatalogoSection({ open, onToggle, catalogo }: { open: boolean; onToggle: () => void; catalogo: BonoCatalogo[] }) {
  const qc = useQueryClient();
  const TIPO_LABEL: Record<string, string> = { individual: "Individual", pareja: "Pareja", grupal: "Grupal" };
  const [drafts, setDrafts] = useState<Record<string, { precio: string; tipo: string }>>({});

  function getVal(c: BonoCatalogo, field: "precio" | "tipo") {
    const d = drafts[c.id];
    if (d) return d[field];
    return field === "precio" ? String(c.precio) : c.tipo;
  }
  function setVal(c: BonoCatalogo, field: "precio" | "tipo", v: string) {
    setDrafts((prev) => ({
      ...prev,
      [c.id]: {
        precio: field === "precio" ? v : prev[c.id]?.precio ?? String(c.precio),
        tipo: field === "tipo" ? v : prev[c.id]?.tipo ?? c.tipo,
      },
    }));
  }
  async function saveRow(c: BonoCatalogo) {
    const d = drafts[c.id];
    if (!d) return;
    const precio = Number(d.precio);
    if (Number.isNaN(precio)) { toast.error("Precio inválido"); return; }
    const { error } = await supabase.from("bonos_catalogo").update({ precio, tipo: d.tipo as BonoCatalogo["tipo"] }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    setDrafts((prev) => { const { [c.id]: _, ...rest } = prev; return rest; });
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Bono actualizado");
  }

  const sorted = sortCatalogo(catalogo);

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-accent/40"
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Tipos de bono y precios
        <span className="text-xs text-muted-foreground ml-auto">Modifica precio y tipo · afecta a Facturación y Bonos</span>
      </button>
      {open && (
        <div className="border-t p-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bono</TableHead>
                <TableHead className="w-40">Tipo</TableHead>
                <TableHead className="w-32">Sesiones</TableHead>
                <TableHead className="w-32">Precio (€)</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => {
                const dirty = !!drafts[c.id];
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{prettyBonoNombre(c.nombre)}</TableCell>
                    <TableCell>
                      <Select value={getVal(c, "tipo")} onValueChange={(v) => setVal(c, "tipo", v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{c.sesiones_incluidas}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8"
                        value={getVal(c, "precio")}
                        onChange={(e) => setVal(c, "precio", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" disabled={!dirty} onClick={() => saveRow(c)}>Guardar</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}