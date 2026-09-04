import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { supabase, prettyBonoNombre, type ClientBono, type Client, type BonoCatalogo } from "@/lib/db";
import { BonoSelectContent, withModalidad } from "@/components/bonos/bono-select-content";
import { useCenterConfig } from "@/lib/center-schedule";
import { servicioColorOf, tipoColorOf, chipStyle } from "@/lib/colors";
import { useClientesEnPrueba, PRUEBA_SLUG, PRUEBA_LABEL } from "@/lib/prueba";
import { useServicios } from "@/lib/servicios";
import { useModalidades } from "@/lib/modalidades";
import { normalizeText, formatNameTitle, fuzzyMatch } from "@/lib/utils";
import { ExpandableSearch } from "@/components/expandable-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { ClientDetailsDialog } from "@/components/clients/client-details-dialog";
import { ClientPicker } from "@/components/clients/client-picker";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUpDown, Plus, Info, Search, X, SlidersHorizontal } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { useColumnVisibility } from "@/components/columns-menu";
import { useBehaviorConfig } from "@/lib/behavior-config";

const BONO_COLUMNS = [
  { key: "servicio", label: "Servicio" },
  { key: "modalidad", label: "Modalidad" },
  { key: "teoricas", label: "Teóricas" },
  { key: "realizadas", label: "Realizadas" },
  { key: "restantes", label: "Restantes" },
  { key: "estado", label: "Estado" },
  { key: "ultimo", label: "Último bono" },
  { key: "fecha", label: "Fecha de bono" },
];

export function BonosPanel() {
  const { confirm, dialog } = useConfirm();
  const qc = useQueryClient();
  const { colores: tipoColores } = useCenterConfig();
  const behavior = useBehaviorConfig();
  const { show, menu: columnsMenu, visibleCount } = useColumnVisibility("bonos-columns", BONO_COLUMNS);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientBono | null>(null);
  const [sortBy, setSortBy] = useState<"nombre" | "estado">("nombre");
  const [q, setQ] = useState("");
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fEstado, setFEstado] = useState<"todos" | "activo" | "agotado">("todos");
  const [fServicio, setFServicio] = useState<string>("todos");
  const [fModalidad, setFModalidad] = useState<string>("todas");
  const [addOpen, setAddOpen] = useState(false);
  const [nuevo, setNuevo] = useState<{
    client_id: string | null;
    bono_catalogo_id: string;
    sesiones_disponibles: string;
    fecha_inicio: string;
    nota: string;
  }>({
    client_id: null,
    bono_catalogo_id: "",
    sesiones_disponibles: "",
    fecha_inicio: new Date().toISOString().slice(0, 10),
    nota: "",
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
  const { data: enPrueba = new Set<string>() } = useClientesEnPrueba();
  const { data: servicios = [] } = useServicios();
  const servMap = new Map(servicios.map((s) => [s.slug, s.nombre]));
  const servicioDe = (b: ClientBono) => {
    const slug = catMap.get(b.bono_catalogo_id ?? "")?.servicio_slug ?? b.servicio_slug;
    return slug ? servMap.get(slug) ?? slug : null;
  };
  const { data: modalidades = [] } = useModalidades();
  /** Modalidad efectiva del bono (la del catálogo manda sobre la copia guardada). */
  const modalidadDe = (b: ClientBono) =>
    catMap.get(b.bono_catalogo_id ?? "")?.modalidad ?? b.modalidad ?? null;
  /** Modalidades disponibles según el filtro de servicio activo. */
  const modalidadesFiltro = [
    ...new Set(
      modalidades
        .filter((m) => fServicio === "todos" || m.servicio_slug === fServicio)
        .map((m) => m.nombre),
    ),
  ];

  const hoyISO = new Date().toISOString().slice(0, 10);
  /** Un bono con caducidad configurada que ya ha superado su fecha límite. */
  const isCaducado = (b: ClientBono) => !!b.fecha_caducidad && b.fecha_caducidad < hoyISO;

  // Marca los bonos caducados y avisa al buzón del cliente (idempotente).
  useEffect(() => {
    void (async () => {
      const { error } = await supabase.rpc("notify_bonos_caducados");
      if (!error) qc.invalidateQueries({ queryKey: ["client_bonos"] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  function estadoRank(b: ClientBono): number {
    const tipoBono = (catMap.get(b.bono_catalogo_id ?? "")?.tipo ?? b.tipo) as string | undefined;
    const isGympass = tipoBono === "gympass";
    const noBono = !b.bono_catalogo_id;
    if (!b.activo) return 2;
    if (isCaducado(b)) return 1;
    if (isGympass || noBono || b.sesiones_disponibles > 0) return 0;
    return 1;
  }

  const sorted = [...bonos].sort((a, b) => {
    if (sortBy === "estado") {
      const ra = estadoRank(a);
      const rb = estadoRank(b);
      if (ra !== rb) return ra - rb;
    }
    const na = clientMap.get(a.client_id)?.nombre ?? "";
    const nb = clientMap.get(b.client_id)?.nombre ?? "";
    return na.localeCompare(nb, "es", { sensitivity: "base" });
  });

  const visible = sorted.filter((b) => {
    // Los bonos archivados (renovados) sólo viven en el historial del cliente
    if (!b.activo) return false;
    const t = (catMap.get(b.bono_catalogo_id ?? "")?.tipo ?? b.tipo) as string | undefined;
    // Los bonos de tipo "prueba" no se listan en Bonos (sólo en Clientes)
    if (t === "prueba") return false;
    const isGympass = t === "gympass";
    const noBono = !b.bono_catalogo_id;
    const activo = !isCaducado(b) && (isGympass || noBono || b.sesiones_disponibles > 0);

    // Cliente inactivo y bono sin sesiones restantes → oculto (configurable)
    if (behavior.ocultarBonosInactivosAgotados) {
      const cliente = clientMap.get(b.client_id);
      if (cliente && !cliente.activo && b.sesiones_disponibles <= 0) return false;
    }

    if (fEstado === "activo" && !activo) return false;
    if (fEstado === "agotado" && activo) return false;
    if (fServicio !== "todos") {
      const slug = catMap.get(b.bono_catalogo_id ?? "")?.servicio_slug ?? b.servicio_slug;
      if (slug !== fServicio) return false;
    }
    if (fModalidad !== "todas" && (modalidadDe(b) ?? "") !== fModalidad) return false;
    return true;
  });

  const textForBono = (b: (typeof visible)[number]) => {
    const client = clientMap.get(b.client_id);
    const cat = catMap.get(b.bono_catalogo_id ?? "");
    return [
      client?.nombre ?? "",
      servicioDe(b) ?? "",
      prettyBonoNombre(b.ultimo_bono_nombre),
      b.ultimo_bono_fecha ?? "",
    ].join(" ");
  };
  const exactBonos = visible.filter((b) => normalizeText(textForBono(b)).includes(normalizeText(q)));
  const filtered = !q.trim() || exactBonos.length > 0
    ? exactBonos
    : visible.filter((b) => fuzzyMatch(clientMap.get(b.client_id)?.nombre ?? "", q));

  // Agrupa los bonos por cliente: una sola fila por cliente con una sub-fila por bono.
  const grouped: { clientId: string; bonos: ClientBono[] }[] = [];
  for (const b of filtered) {
    const g = grouped.find((x) => x.clientId === b.client_id);
    if (g) g.bonos.push(b);
    else grouped.push({ clientId: b.client_id, bonos: [b] });
  }
  const SUB = "h-9 flex items-center";

  async function save() {
    if (!editing) return;
    const selectedCatalogo = catalogo.find((c) => c.id === editing.bono_catalogo_id);
    const { error } = await supabase.from("client_bonos").update({
      bono_catalogo_id: editing.bono_catalogo_id,
      sesiones_disponibles: editing.sesiones_disponibles,
      sesiones_realizadas: editing.sesiones_realizadas,
      activo: editing.activo,
      ultimo_bono_nombre: selectedCatalogo?.nombre ?? editing.ultimo_bono_nombre,
      nota: editing.nota ?? null,
    }).eq("id", editing.id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["client_bonos"] }); setOpen(false); toast.success("Bono actualizado"); }
  }

  async function removeBono() {
    if (!editing) return;
    if (!(await confirm({ title: "¿Eliminar este bono?", description: "Esta acción no se puede deshacer." }))) return;
    const { error } = await supabase.from("client_bonos").delete().eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    setOpen(false);
    setEditing(null);
    toast.success("Bono eliminado");
  }

  async function addBono() {
    if (!nuevo.client_id) { toast.error("Selecciona un cliente"); return; }
    const cat = nuevo.bono_catalogo_id ? catalogo.find((c) => c.id === nuevo.bono_catalogo_id) : null;
    const sesiones = Number(nuevo.sesiones_disponibles);
    if (nuevo.sesiones_disponibles.trim() === "" || !Number.isFinite(sesiones)) {
      toast.error("Introduce un número de sesiones válido"); return;
    }
    // Un cliente puede tener varios bonos activos de distinto servicio/tipo.
    // Si ya existe uno idéntico, la base de datos lo archiva y arrastra sus sesiones.
    const { error } = await supabase.from("client_bonos").insert({
      client_id: nuevo.client_id,
      bono_catalogo_id: cat?.id ?? null,
      fecha_inicio: nuevo.fecha_inicio || new Date().toISOString().slice(0, 10),
      sesiones_disponibles: sesiones,
      sesiones_realizadas: 0,
      activo: true,
      ultimo_bono_nombre: cat?.nombre ?? "Manual",
      ultimo_bono_fecha: nuevo.fecha_inicio || new Date().toISOString().slice(0, 10),
      servicio_slug: cat?.servicio_slug ?? servicios[0]?.slug ?? "personal",
      nota: nuevo.nota.trim() || null,
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
      nota: "",
    });
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-center justify-between gap-4">
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
          {columnsMenu}
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo bono</Button>
      </div>
      {filtersOpen && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end rounded-lg border bg-card p-3">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={fEstado} onValueChange={(v) => setFEstado(v as typeof fEstado)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="agotado">Agotado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">

            <Label>Servicio</Label>
            <Select
              value={fServicio}
              onValueChange={(v) => { setFServicio(v); setFModalidad("todas"); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {servicios.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {modalidadesFiltro.length > 0 && (
            <div className="space-y-1.5">
              <Label>Modalidad</Label>
              <Select value={fModalidad} onValueChange={setFModalidad}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {modalidadesFiltro.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => { setFEstado("todos"); setFServicio("todos"); setFModalidad("todas"); }}
          >
            Limpiar filtros
          </Button>
        </div>
      )}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSortBy("nombre")}>
                  Nombre <ArrowUpDown className={`h-3 w-3 ${sortBy === "nombre" ? "text-foreground" : "opacity-40"}`} />
                </button>
              </TableHead>
              {show("servicio") && <TableHead>Servicio</TableHead>}
              {show("modalidad") && <TableHead>Modalidad</TableHead>}
              {show("teoricas") && <TableHead>Teóricas</TableHead>}

              {show("realizadas") && <TableHead>Realizadas</TableHead>}
              {show("restantes") && <TableHead>Restantes</TableHead>}
              {show("estado") && <TableHead>
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSortBy("estado")}>
                  Estado <ArrowUpDown className={`h-3 w-3 ${sortBy === "estado" ? "text-foreground" : "opacity-40"}`} />
                </button>
              </TableHead>}
              {show("ultimo") && <TableHead>Último bono</TableHead>}
              {show("fecha") && <TableHead>Fecha de bono</TableHead>}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map((g) => (
              <TableRow key={g.clientId} className="align-top">
                <TableCell className="font-medium">
                  <div className={SUB}>
                    <button
                      className="hover:underline text-left"
                      onClick={() => setHistoryClient(clientMap.get(g.clientId) ?? null)}
                    >
                      {formatNameTitle(clientMap.get(g.clientId)?.nombre) ?? "?"}
                    </button>
                  </div>
                </TableCell>
                {show("servicio") && <TableCell>
                  {g.bonos.map((b) => (
                    <div key={b.id} className={SUB}>
                      {enPrueba.has(g.clientId) ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={chipStyle(tipoColorOf(tipoColores, PRUEBA_SLUG) ?? "#1CDB14")}
                        >
                          {PRUEBA_LABEL}
                        </span>
                      ) : servicioDe(b) ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={chipStyle(servicioColorOf(tipoColores, catMap.get(b.bono_catalogo_id ?? "")?.servicio_slug ?? b.servicio_slug)!)}
                        >
                          {servicioDe(b)}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </div>
                  ))}
                </TableCell>}

                {show("modalidad") && <TableCell>
                  {g.bonos.map((b) => (
                    <div key={b.id} className={SUB}>
                      {modalidadDe(b) ?? <span className="text-muted-foreground">—</span>}
                    </div>
                  ))}
                </TableCell>}

                {show("teoricas") && <TableCell>
                  {g.bonos.map((b) => {
                    const t = (catMap.get(b.bono_catalogo_id ?? "")?.tipo ?? b.tipo) as string | undefined;
                    const isGympass = t === "gympass";
                    const noBono = !b.bono_catalogo_id;
                    return <div key={b.id} className={SUB}>{isGympass ? "—" : noBono ? 0 : b.sesiones_disponibles + b.sesiones_realizadas}</div>;
                  })}
                </TableCell>}
                {show("realizadas") && <TableCell>
                  {g.bonos.map((b) => <div key={b.id} className={SUB}>{b.sesiones_realizadas}</div>)}
                </TableCell>}
                {show("restantes") && <TableCell>
                  {g.bonos.map((b) => {
                    const t = (catMap.get(b.bono_catalogo_id ?? "")?.tipo ?? b.tipo) as string | undefined;
                    const isGympass = t === "gympass";
                    const noBono = !b.bono_catalogo_id;
                    return (
                      <div
                        key={b.id}
                        className={`${SUB} ${
                          isGympass || noBono
                            ? ""
                            : b.sesiones_disponibles <= 0
                              ? "text-red-600 dark:text-red-400 font-semibold"
                              : b.sesiones_disponibles <= 1
                                ? "text-orange-500 font-semibold"
                                : ""
                        }`}
                      >
                        {isGympass || noBono ? "—" : b.sesiones_disponibles}
                      </div>
                    );
                  })}
                </TableCell>}
                {show("estado") && <TableCell>
                  {g.bonos.map((b) => {
                    const t = (catMap.get(b.bono_catalogo_id ?? "")?.tipo ?? b.tipo) as string | undefined;
                    const isGympass = t === "gympass";
                    const noBono = !b.bono_catalogo_id;
                    const caducado = isCaducado(b);
                    const activo = !caducado && (isGympass || noBono || b.sesiones_disponibles > 0);
                    return (
                      <div key={b.id} className={SUB}>
                        {activo ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-state-prueba/30 text-state-prueba-fg">Activo</span>
                        ) : caducado ? (
                          <span
                            title={`Bono caducado el ${b.fecha_caducidad}`}
                            className="text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                          >Agotado</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20">Agotado</span>
                        )}
                      </div>
                    );
                  })}
                </TableCell>}
                {show("ultimo") && <TableCell>
                  {g.bonos.map((b) => <div key={b.id} className={SUB}>{prettyBonoNombre(b.ultimo_bono_nombre)}</div>)}
                </TableCell>}
                {show("fecha") && <TableCell>
                  {g.bonos.map((b) => <div key={b.id} className={SUB}>{b.ultimo_bono_fecha ?? "—"}</div>)}
                </TableCell>}
                <TableCell>
                  {g.bonos.map((b) => (
                    <div key={b.id} className={SUB}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(b); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            ))}
            {grouped.length === 0 && (
              <TableRow><TableCell colSpan={visibleCount + 2} className="text-center text-muted-foreground py-8">Sin bonos aún · añade una factura para generar uno</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onKeyDown={enterToSave(save)}>
          <DialogHeader><DialogTitle>Editar bono</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="text-sm text-muted-foreground">{formatNameTitle(clientMap.get(editing.client_id)?.nombre)}</div>
            <div className="space-y-1.5">
                <Label>Tipo de bono</Label>
                <Select value={editing.bono_catalogo_id ?? ""} onValueChange={(v) => setEditing({ ...editing, bono_catalogo_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona bono">
                      {(() => {
                        const b = catalogo.find((x) => x.id === editing.bono_catalogo_id);
                        if (!b) return "Selecciona bono";
                        const serv = servicios.find((s) => s.slug === b.servicio_slug)?.nombre ?? b.servicio_slug;
                        return `${serv} — ${withModalidad(b, prettyBonoNombre(b.nombre))}`;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <BonoSelectContent catalogo={catalogo} />
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Teóricas</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={editing.sesiones_disponibles + editing.sesiones_realizadas === 0 ? "" : editing.sesiones_disponibles + editing.sesiones_realizadas}
                    onChange={(e) => {
                      const total = Number(e.target.value) || 0;
                      setEditing({ ...editing, sesiones_disponibles: total - editing.sesiones_realizadas });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Realizadas</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={editing.sesiones_realizadas === 0 ? "" : editing.sesiones_realizadas}
                    onChange={(e) => {
                      const total = editing.sesiones_disponibles + editing.sesiones_realizadas;
                      const realizadas = Number(e.target.value) || 0;
                      setEditing({ ...editing, sesiones_realizadas: realizadas, sesiones_disponibles: total - realizadas });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Restantes</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={editing.sesiones_disponibles === 0 ? "" : editing.sesiones_disponibles}
                    onChange={(e) => setEditing({ ...editing, sesiones_disponibles: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.activo} onCheckedChange={(c) => setEditing({ ...editing, activo: c })} /><Label>Activo</Label></div>
              <div className="space-y-1.5">
                <Label>Nota</Label>
                <Textarea rows={3} placeholder="Añade una nota opcional…" value={editing.nota ?? ""} onChange={(e) => setEditing({ ...editing, nota: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="destructive" onClick={removeBono} className="mr-auto">Eliminar</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientDetailsDialog client={historyClient} defaultTab="calendario" onOpenChange={(o) => !o && setHistoryClient(null)} />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent onKeyDown={enterToSave(addBono)}>
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
              <Select value={nuevo.bono_catalogo_id || ""} onValueChange={(raw) => {
                const v = raw === "__none__" ? "" : raw;
                const cat = v ? catalogo.find((c) => c.id === v) : null;
                setNuevo({
                  ...nuevo,
                  bono_catalogo_id: v,
                  sesiones_disponibles: cat && !nuevo.sesiones_disponibles
                    ? String(cat.sesiones_incluidas ?? "")
                    : nuevo.sesiones_disponibles,
                });
              }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un bono">
                      {(() => {
                        const b = catalogo.find((x) => x.id === nuevo.bono_catalogo_id);
                        if (!b) return "Selecciona un bono";
                        const serv = servicios.find((s) => s.slug === b.servicio_slug)?.nombre ?? b.servicio_slug;
                        return `${serv} — ${withModalidad(b, prettyBonoNombre(b.nombre))}`;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <BonoSelectContent catalogo={catalogo} noneValue="__none__" />
               </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sesiones teóricas</Label>
                <Input type="number" placeholder="Ej. 10" value={nuevo.sesiones_disponibles}
                  onChange={(e) => setNuevo({ ...nuevo, sesiones_disponibles: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={nuevo.fecha_inicio}
                  onChange={(e) => setNuevo({ ...nuevo, fecha_inicio: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nota</Label>
              <Textarea rows={3} placeholder="Añade una nota opcional…" value={nuevo.nota}
                onChange={(e) => setNuevo({ ...nuevo, nota: e.target.value })} />
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