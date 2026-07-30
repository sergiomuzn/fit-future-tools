import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Session, type Client, type Trainer, type ClientBono, type BonoCatalogo, type Group, ESTADO_LABEL } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Search, X } from "lucide-react";
import { exportToXlsx } from "@/lib/export-xlsx";
import { ESTADO_BG } from "@/lib/db";
import { normalizeText, formatNameTitle } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = {
  individual: "Individual",
  pareja: "Pareja",
  grupal: "Grupal",
  prueba: "Prueba",
  gympass: "Gympass",
};

const TIPO_CLASS: Record<string, string> = {
  prueba: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  gympass: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
};

export const Route = createFileRoute("/_shell/sesiones")({ component: SesionesPage });

function SesionesPage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [estadoFilter, setEstadoFilter] = useState<string>("todos");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-past"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .lte("fecha", today)
        .in("estado", ["realizada", "cancelada", "prueba"])
        .order("fecha", { ascending: false })
        .order("hora_inicio", { ascending: false })
        .limit(500);
      const rows = (data ?? []) as Session[];
      // Excluir sesiones "por confirmar" y las de hoy cuyo fin + 15 min aún no ha pasado.
      const now = new Date();
      const GRACE_MS = 15 * 60 * 1000;
      return rows.filter((s) => {
        if ((s as any).por_confirmar) return false;
        const end = new Date(`${s.fecha}T${s.hora_fin}`);
        return end.getTime() + GRACE_MS < now.getTime();
      });
    },
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: async () => (await supabase.from("clients").select("*")).data as Client[] ?? [] });
  const { data: trainers = [] } = useQuery({ queryKey: ["trainers"], queryFn: async () => (await supabase.from("trainers").select("*")).data as Trainer[] ?? [] });
  const { data: clientBonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => (await supabase.from("client_bonos").select("*")).data as ClientBono[] ?? [],
  });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [],
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await supabase.from("groups").select("*")).data as Group[] ?? [],
  });

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const trainerMap = new Map(trainers.map((t) => [t.id, t]));
  const catalogoMap = new Map(catalogo.map((b) => [b.id, b]));
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  // Bono activo por cliente (fallback: más reciente por created_at)
  const clientBonoTipo = new Map<string, string>();
  const sortedBonos = [...clientBonos].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const cb of sortedBonos) {
    if (clientBonoTipo.has(cb.client_id)) continue;
    const cat = cb.bono_catalogo_id ? catalogoMap.get(cb.bono_catalogo_id) : null;
    if (cat?.tipo) clientBonoTipo.set(cb.client_id, cat.tipo);
  }
  const tipoForSession = (s: Session): string | null => {
    if (s.ocupacion === 2) return "grupal";
    if (s.client_id) {
      const t = clientBonoTipo.get(s.client_id);
      if (t) return t;
    }
    return s.tipo ?? null;
  };

  // Nombre a mostrar: si es grupo, nombre del grupo; si no, cliente o título.
  const nameForSession = (s: Session): string => {
    if (s.ocupacion === 2) {
      return (s.group_id ? groupMap.get(s.group_id)?.nombre : null) ?? s.titulo ?? "Grupo";
    }
    return (s.client_id ? formatNameTitle(clientMap.get(s.client_id)?.nombre) : s.titulo) ?? "—";
  };

  // Colapsar filas de una misma sesión de grupo (mismo recurrencia+fecha+hora) en una sola fila.
  const collapsed: Session[] = (() => {
    const seen = new Set<string>();
    const out: Session[] = [];
    for (const s of sessions) {
      if (s.ocupacion === 2 && s.recurrencia_id) {
        const key = `${s.recurrencia_id}|${s.fecha}|${s.hora_inicio}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(s);
    }
    return out;
  })();

  const q = normalizeText(search.trim());
  const filtered = collapsed.filter((s) => {
    if (q) {
      const name = normalizeText(nameForSession(s));
      if (!name.includes(q) && !s.fecha.includes(q)) return false;
    }
    if (desde && s.fecha < desde) return false;
    if (hasta && s.fecha > hasta) return false;
    if (estadoFilter !== "todos") {
      if (estadoFilter === "cancelada" && !(s.estado === "cancelada" && !s.no_contabilizar)) return false;
      if (estadoFilter === "cancelada_nc" && !(s.estado === "cancelada" && s.no_contabilizar)) return false;
      if (estadoFilter !== "cancelada" && estadoFilter !== "cancelada_nc" && s.estado !== estadoFilter) return false;
    }
    if (tipoFilter !== "todos" && tipoForSession(s) !== tipoFilter) return false;
    return true;
  });

  const tipoOptions = Array.from(
    new Set([...Object.keys(TIPO_LABEL), ...catalogo.map((c) => c.tipo).filter(Boolean) as string[]]),
  );
  const filtrosActivos = estadoFilter !== "todos" || tipoFilter !== "todos" || !!desde || !!hasta;

  async function updateIncidencia(id: string, val: string) {
    const { error } = await supabase.from("sessions").update({ incidencia: val || null }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["sessions-past"] });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-display font-semibold">Sesiones realizadas</h1>
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="relative flex items-center gap-1">
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre o fecha (YYYY-MM-DD)…"
                className="h-9 w-64 pr-8"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setSearch("")}
                  className="absolute right-10 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <Button variant="ghost" size="icon" onClick={() => { setSearch(""); setSearchOpen(false); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="icon" onClick={() => setSearchOpen(true)} aria-label="Buscar">
              <Search className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" onClick={() => exportToXlsx("sesiones", filtered.map((s) => ({
          Fecha: s.fecha,
          Hora: s.hora_inicio.slice(0, 5),
          Cliente: nameForSession(s),
          Tipo: (() => { const t = tipoForSession(s); return t ? TIPO_LABEL[t] ?? t : ""; })(),
          Entrenador: s.trainer_id ? trainerMap.get(s.trainer_id)?.nombre ?? "" : "",
          Estado: s.estado === "cancelada" && s.no_contabilizar ? "Cancelada NC" : ESTADO_LABEL[s.estado],
          Ocupación: s.ocupacion,
          Incidencia: s.incidencia ?? "",
          })), "Sesiones")}>
            <Download className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Estado</Label>
          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="realizada">Realizada</SelectItem>
              <SelectItem value="prueba">Prueba</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
              <SelectItem value="cancelada_nc">Cancelada NC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo de bono</Label>
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              {tipoOptions.map((t) => (
                <SelectItem key={t} value={t}>{TIPO_LABEL[t] ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="date" className="h-9 w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="date" className="h-9 w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        {filtrosActivos && (
          <Button
            variant="ghost"
            className="h-9"
            onClick={() => { setEstadoFilter("todos"); setTipoFilter("todos"); setDesde(""); setHasta(""); }}
          >
            <X className="h-4 w-4 mr-1" /> Limpiar filtros
          </Button>
        )}
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Cliente / Grupo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Entrenador</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Incidencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.fecha}</TableCell>
                <TableCell>{s.hora_inicio.slice(0,5)}</TableCell>
                <TableCell>{nameForSession(s)}</TableCell>
                <TableCell>
                  {(() => {
                    const t = tipoForSession(s);
                    return t ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_CLASS[t] ?? ""}`}>
                        {TIPO_LABEL[t] ?? t}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    );
                  })()}
                </TableCell>
                <TableCell>{s.trainer_id ? trainerMap.get(s.trainer_id)?.nombre : "—"}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center h-7 px-2.5 rounded-full text-xs font-medium ${ESTADO_BG[s.estado]} opacity-60`}
                  >
                    {s.estado === "cancelada" && s.no_contabilizar
                      ? "Cancelada NC"
                      : ESTADO_LABEL[s.estado]}
                  </span>
                </TableCell>
                <TableCell>
                  <Input defaultValue={s.incidencia ?? ""} onBlur={(e) => updateIncidencia(s.id, e.target.value)} placeholder="—" className="h-8" />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin sesiones aún</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}