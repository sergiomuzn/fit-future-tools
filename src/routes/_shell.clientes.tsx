import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Download, X, Info } from "lucide-react";
import { supabase, type Client, type ClientBono, type BonoCatalogo, type Group, type Session, DIAS_SEMANA } from "@/lib/db";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GroupDialog } from "@/components/groups/group-dialog";
import { normalizeText, formatNameTitle, fuzzyMatch } from "@/lib/utils";
import { useEffect } from "react";
import { getBehaviorConfig } from "@/lib/behavior-config";
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
  const [tab, setTab] = useState<"clientes" | "grupos">("clientes");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupEditing, setGroupEditing] = useState<Group | null>(null);

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
  for (const b of clientBonos) {
    if (!b.activo) continue;
    if (b.bono_catalogo_id) {
      const t = catMap.get(b.bono_catalogo_id)?.tipo;
      if (t && !tipoByClient.has(b.client_id)) tipoByClient.set(b.client_id, t);
    }
  }
  const TIPO_LABEL: Record<string, string> = { prueba: "Prueba", individual: "Individual", pareja: "Pareja", grupal: "Grupal", gympass: "Gympass" };
  const TIPO_CLASS: Record<string, string> = {
    prueba: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
    grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    gympass: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  };

  const matchesExact = clients.filter((c) => normalizeText(c.nombre).includes(normalizeText(q)));
  const filtered = (matchesExact.length > 0 || !q.trim()
    ? matchesExact
    : clients.filter((c) => fuzzyMatch(c.nombre, q))
  )
    .slice()
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
    if (!(await confirm({ title: "¿Eliminar cliente?", description: "Esta acción no se puede deshacer." }))) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Cliente eliminado"); qc.invalidateQueries({ queryKey: ["clients"] }); }
  }

  return (
    <div className="p-6 space-y-4">
      {dialog}
      <div className="flex items-center justify-between">
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
          <Button variant="outline" onClick={() => exportToXlsx("clientes", filtered.map((c) => ({
            Nombre: formatNameTitle(c.nombre),
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
        ) : (
          <Button onClick={() => { setGroupEditing(null); setGroupOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo grupo
          </Button>
        )}
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "clientes" | "grupos")}>
        <TabsList>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
        </TabsList>
        <TabsContent value="clientes" className="space-y-4">
      <div className="relative max-w-sm">
        <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="pr-8" />
        {q && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo de bono</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Fecha inicio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cumpleaños</TableHead>
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
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin clientes</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
        </TabsContent>
        <TabsContent value="grupos" className="space-y-4">
          <GruposPanel onEdit={(g) => { setGroupEditing(g); setGroupOpen(true); }} />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onKeyDown={enterToSave(save)}>
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
      <GroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} group={groupEditing} />
    </div>
  );
}

function GruposPanel({ onEdit }: { onEdit: (g: Group) => void }) {
  const { confirm: confirmGroup, dialog: groupDialog } = useConfirm();
  const qc = useQueryClient();
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await supabase.from("groups").select("*").order("nombre")).data as Group[] ?? [],
  });
  // Derive each group's schedule from its agenda sessions. We look at the last
  // ~90 days so recurring blocks appear even outside the current week.
  const { data: groupSessions = [] } = useQuery({
    queryKey: ["group_sessions_for_groups_panel"],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const iso = from.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("sessions")
        .select("group_id,fecha,hora_inicio,client_id")
        .not("group_id", "is", null)
        .gte("fecha", iso);
      return (data ?? []) as Pick<Session, "group_id" | "fecha" | "hora_inicio" | "client_id">[];
    },
  });

  // group_id -> map<hora "HH:MM", Set<dow>>
  const scheduleByGroup = new Map<string, Map<string, Set<number>>>();
  for (const s of groupSessions) {
    if (!s.group_id) continue;
    const hora = (s.hora_inicio ?? "").slice(0, 5);
    const dow = new Date(`${s.fecha}T00:00:00`).getDay();
    if (hora) {
      if (!scheduleByGroup.has(s.group_id)) scheduleByGroup.set(s.group_id, new Map());
      const perHora = scheduleByGroup.get(s.group_id)!;
      if (!perHora.has(hora)) perHora.set(hora, new Set());
      perHora.get(hora)!.add(dow);
    }
  }

  function horarioSummary(groupId: string): string {
    const perHora = scheduleByGroup.get(groupId);
    if (!perHora || perHora.size === 0) return "—";
    return [...perHora.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hora, dows]) => {
        const days = [...dows].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        return `${days.map((d) => DIAS_SEMANA[d]).join(", ")} ${hora}`;
      })
      .join(" · ");
  }

  async function removeGroup(id: string, nombre: string) {
    if (!(await confirmGroup({ title: `¿Eliminar grupo «${nombre}»?`, description: "Esta acción no se puede deshacer." }))) return;
    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Grupo eliminado"); qc.invalidateQueries({ queryKey: ["groups"] }); }
  }

  const sorted = [...groups].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {groupDialog}
      {sorted.map((g) => (
        <div
          key={g.id}
          onClick={() => onEdit(g)}
          className={`group relative rounded-lg border bg-card p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition ${g.activo ? "" : "opacity-60"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{g.nombre}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Capacidad {g.capacidad}</div>
            </div>
            <span
              className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${g.activo ? "bg-state-prueba/30 text-state-prueba-fg" : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20"}`}
            >
              {g.activo ? "Activo" : "Inactivo"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {horarioSummary(g.id)}
          </div>
          <div className="mt-2 flex justify-end opacity-0 group-hover:opacity-100 transition">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); removeGroup(g.id, g.nombre); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <div className="col-span-full text-center text-muted-foreground py-8 border rounded-lg bg-card">Sin grupos aún</div>
      )}
    </div>
  );
}