import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Download, Upload, X, Info, SlidersHorizontal, MoreHorizontal } from "lucide-react";
import { supabase, type Client, type ClientBono, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientDetailsDialog } from "@/components/clients/client-details-dialog";
import { exportToXlsx } from "@/lib/export-xlsx";
import { readXlsxRows, mapClientRows } from "@/lib/import-xlsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExpandableSearch } from "@/components/expandable-search";
import { BonosPanel } from "@/components/bonos/bonos-panel";
import { AccesosPanel } from "@/components/clients/accesos-panel";
import { normalizeText, formatNameTitle, fuzzyMatch } from "@/lib/utils";
import { useEffect } from "react";
import { getBehaviorConfig } from "@/lib/behavior-config";
import { useServicios } from "@/lib/servicios";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/confirm-dialog";

export const Route = createFileRoute("/_shell/clientes")({
  component: ClientesPage,
});

function ClientesPage() {
  const { confirm, dialog } = useConfirm();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Client> | null>(null);
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState<Client | null>(null);
  const [tab, setTab] = useState<"clientes" | "accesos" | "bonos">("clientes");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fEstado, setFEstado] = useState<"todos" | "activo" | "inactivo">("todos");
  const [fTipo, setFTipo] = useState<string>("todos");
  const [fServicio, setFServicio] = useState<string>("todos");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Ejecuta al montar la limpieza automática de clientes de prueba caducados.
  useEffect(() => {
    (async () => {
      const cfg = getBehaviorConfig();
      if (!cfg.pruebaAutoInactivar) return;
      const { error } = await supabase.rpc(
        "auto_deactivate_prueba_clients" as never,
        { p_dias: cfg.pruebaDiasInactivar } as never,
      );
      if (!error) {
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [],
  });
  const catMap = new Map(catalogo.map((c) => [c.id, c]));
  const tipoByClient = new Map<string, string>();
  const serviciosByClient = new Map<string, string[]>();
  for (const b of clientBonos) {
    if (!b.activo) continue;
    if (b.bono_catalogo_id) {
      const cat = catMap.get(b.bono_catalogo_id);
      const t = cat?.tipo;
      if (t && !tipoByClient.has(b.client_id)) tipoByClient.set(b.client_id, t);
      const slug = cat?.servicio_slug;
      if (slug) {
        const prev = serviciosByClient.get(b.client_id) ?? [];
        if (!prev.includes(slug)) serviciosByClient.set(b.client_id, [...prev, slug]);
      }
    }
  }
  const { data: servicios = [] } = useServicios();
  const nombreServicio = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;
  const TIPO_LABEL: Record<string, string> = { prueba: "Prueba", individual: "Individual", pareja: "Pareja", grupal: "Grupal", gympass: "Gympass" };
  const TIPO_CLASS: Record<string, string> = {
    prueba: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
    grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    gympass: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  };

  const matchesExact = clients.filter((c) => normalizeText(c.nombre).includes(normalizeText(q)));
  const searched = (matchesExact.length > 0 || !q.trim()
    ? matchesExact
    : clients.filter((c) => fuzzyMatch(c.nombre, q))
  );
  const filtered = searched
    .filter((c) => {
      if (fEstado === "activo" && !c.activo) return false;
      if (fEstado === "inactivo" && c.activo) return false;
      if (fTipo !== "todos" && (tipoByClient.get(c.id) ?? "") !== fTipo) return false;
      if (fServicio !== "todos" && !(serviciosByClient.get(c.id) ?? []).includes(fServicio)) return false;
      if (fDesde && (!c.fecha_inicio || c.fecha_inicio < fDesde)) return false;
      if (fHasta && (!c.fecha_inicio || c.fecha_inicio > fHasta)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      const aa = a.activo ? 0 : 1;
      const bb = b.activo ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });

  const fileRef = useRef<HTMLInputElement>(null);

  async function importClients(file: File) {
    try {
      const rows = mapClientRows(await readXlsxRows(file));
      if (!rows.length) { toast.error("No se han encontrado clientes en el archivo"); return; }
      const existentes = new Set(clients.map((c) => normalizeText(c.nombre)));
      const nuevos = rows.filter((r) => !existentes.has(normalizeText(r.nombre)));
      const dup = rows.length - nuevos.length;
      if (!nuevos.length) { toast.error("Todos los clientes del archivo ya existen"); return; }
      const ok = await confirm({
        title: "¿Importar clientes?",
        description: `Se añadirán ${nuevos.length} ${nuevos.length === 1 ? "cliente" : "clientes"}${
          dup ? ` (${dup} ya existían y se omitirán)` : ""
        }.`,
        confirmText: "Importar",
        destructive: false,
      });
      if (!ok) return;
      const { error } = await supabase.from("clients").insert(nuevos);
      if (error) { toast.error(error.message); return; }
      toast.success(`${nuevos.length} clientes importados`);
      qc.invalidateQueries({ queryKey: ["clients"] });
      setImportOpen(false);
    } catch {
      toast.error("No se ha podido leer el archivo");
    }
  }

  async function save() {
    if (!editing?.nombre) { toast.error("Nombre requerido"); return; }
    const payload = {
      nombre: formatNameTitle(editing.nombre),
      telefono: editing.telefono ?? null,
      email: editing.email ?? null,
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

    let reservas: { id: string; group_id: string | null }[] = [];
    try {
      const { data } = await supabase
        .from("sessions")
        .select("id,group_id,fecha")
        .eq("client_id", id)
        .eq("estado", "reservada")
        .gte("fecha", new Date().toISOString().slice(0, 10));
      reservas = (data ?? []) as { id: string; group_id: string | null }[];
    } catch {
      reservas = [];
    }
    const total = reservas.length;
    const enGrupo = reservas.filter((s) => s.group_id).length;
    const description = total
      ? `Este cliente tiene ${total} ${total === 1 ? "sesión reservada" : "sesiones reservadas"} pendientes${
          enGrupo ? ` (${enGrupo} en entrenamientos grupales)` : ""
        }. Si lo eliminas, esas reservas se borrarán. Esta acción no se puede deshacer.`
      : "Se eliminarán todos sus datos y su historial. Esta acción no se puede deshacer.";
    if (!(await confirm({ title: "¿Eliminar cliente?", description }))) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Cliente eliminado"); qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["sessions"] }); }
  }

  return (
    <div className="page-tabbed min-h-screen p-6 space-y-4">
      {dialog}
      <div className="flex min-h-10 items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-display font-semibold">Clientes</h1>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm text-xs leading-relaxed">
                Cuando se registra por primera vez una sesión de <b>Prueba</b> con un cliente,
                se le asigna automáticamente el bono <b>Prueba</b> y pasa a estar <b>Activo</b>.
                Si transcurre <b>1 mes</b> sin que ese cliente reciba un nuevo bono (facturación),
                su estado pasa a <b>Inactivo</b> automáticamente, pero conserva el bono de prueba
                como su último tipo, igual que ocurre con el resto de clientes.
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
        {tab === "clientes" ? (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importClients(f);
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Acciones" title="Acciones">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => exportToXlsx("clientes", filtered.map((c) => ({
                  Nombre: formatNameTitle(c.nombre),
                  "Tipo de bono": (TIPO_LABEL[tipoByClient.get(c.id) ?? ""] ?? ""),
                  Servicio: (serviciosByClient.get(c.id) ?? []).map(nombreServicio).join(", "),
                  Estado: c.activo ? "Activo" : "Inactivo",
                  Teléfono: c.telefono ?? "",
                  Email: c.email ?? "",
                  "Fecha inicio": c.fecha_inicio ?? "",
                  "Fecha de nacimiento": c.cumpleanos ?? "",
                  Notas: c.notas ?? "",
                })), "Clientes")}
              >
                <Download className="h-4 w-4 mr-2" /> Exportar datos
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" /> Importar clientes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => { setEditing({}); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo cliente
          </Button>
        </div>
        ) : null}
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "clientes" | "accesos" | "bonos")}>
        <TabsList>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="bonos">Bonos</TabsTrigger>
          <TabsTrigger value="accesos">Accesos</TabsTrigger>
        </TabsList>
        <TabsContent value="clientes" className="space-y-4">
      <div className="flex items-center gap-2">
        <ExpandableSearch value={q} onChange={setQ} />
        <Button
          variant={filtersOpen ? "secondary" : "outline"}
          size="icon"
          aria-label="Filtrar"
          title="Filtrar"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>
      {filtersOpen && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end rounded-lg border bg-card p-3">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={fEstado} onValueChange={(v) => setFEstado(v as typeof fEstado)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de bono</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {[...new Set(catalogo.map((c) => c.tipo))].map((t) => (
                  <SelectItem key={t} value={t}>{TIPO_LABEL[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Servicio</Label>
            <Select value={fServicio} onValueChange={setFServicio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {servicios.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Desde (fecha inicio)</Label>
            <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hasta (fecha inicio)</Label>
            <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
          </div>
          <Button
            variant="ghost"
            onClick={() => { setFEstado("todos"); setFTipo("todos"); setFServicio("todos"); setFDesde(""); setFHasta(""); }}
          >
            Limpiar filtros
          </Button>
        </div>
      )}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Tipo de bono</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Fecha inicio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha de nacimiento</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className={c.activo ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  <button className="hover:underline text-left" onClick={() => setViewing(c)}>{formatNameTitle(c.nombre)}</button>
                </TableCell>
                <TableCell>
                  {(() => {
                    const ss = serviciosByClient.get(c.id) ?? [];
                    if (ss.length === 0) return <span className="text-muted-foreground">—</span>;
                    return (
                      <div className="flex flex-wrap gap-1">
                        {ss.map((s) => (
                          <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                            {nombreServicio(s)}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  {(() => {
                    const t = tipoByClient.get(c.id);
                    return t ? <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_CLASS[t]}`}>{TIPO_LABEL[t]}</span> : <span className="text-muted-foreground">—</span>;
                  })()}
                </TableCell>
                <TableCell>{c.telefono ?? "—"}</TableCell>
                <TableCell>{c.fecha_inicio ?? "—"}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.activo ? "bg-state-prueba/30 text-state-prueba-fg" : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20"}`}>{c.activo ? "Activo" : "Inactivo"}</span>
                </TableCell>
                <TableCell>{c.cumpleanos ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin clientes</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
        </TabsContent>
        <TabsContent value="bonos" className="space-y-4">
          <BonosPanel />
        </TabsContent>
        <TabsContent value="accesos" className="space-y-4">
          <AccesosPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onKeyDown={enterToSave(save)}>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={editing?.nombre ?? ""} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Teléfono</Label><Input value={editing?.telefono ?? ""} onChange={(e) => setEditing({ ...editing, telefono: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={editing?.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={editing?.fecha_inicio ?? ""} onChange={(e) => setEditing({ ...editing, fecha_inicio: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Fecha de nacimiento</Label><Input type="date" value={editing?.cumpleanos ?? ""} onChange={(e) => setEditing({ ...editing, cumpleanos: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notas</Label><Textarea rows={2} value={editing?.notas ?? ""} onChange={(e) => setEditing({ ...editing, notas: e.target.value })} /></div>
            {editing?.id && (
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="activo" checked={editing?.activo ?? true} onCheckedChange={(v) => setEditing({ ...editing, activo: Boolean(v) })} />
                <Label htmlFor="activo" className="cursor-pointer">Activo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ClientDetailsDialog client={viewing} defaultTab="info" onOpenChange={(o) => !o && setViewing(null)} />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Importar clientes</DialogTitle></DialogHeader>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void importClients(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:bg-accent/50"
            }`}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Arrastra aquí el archivo o haz clic para seleccionarlo</p>
            <p className="text-xs text-muted-foreground">Formatos admitidos: .xlsx, .xls, .csv</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p>
              Los nombres de las columnas deben coincidir con los campos del cliente:{" "}
              <b>Nombre</b>, <b>Apellido</b>, <b>Teléfono</b>, <b>Email</b>, <b>Fecha inicio</b>,{" "}
              <b>Fecha de nacimiento</b>, <b>Notas</b> y <b>Estado</b> (Activo/Inactivo).
            </p>
            <p>
              Los datos que no estén rellenados quedarán vacíos o con su valor predeterminado
              (si no se indica <b>Estado</b>, el cliente se crea como <b>Activo</b>).
            </p>
            <p>Se omitirán los clientes cuyo nombre ya exista.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
