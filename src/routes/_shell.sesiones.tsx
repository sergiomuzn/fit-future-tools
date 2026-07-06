import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Session, type Client, type Trainer, type ClientBono, type BonoCatalogo, ESTADO_LABEL } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Search, X } from "lucide-react";
import { exportToXlsx } from "@/lib/export-xlsx";
import { ESTADO_BG } from "@/lib/db";

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

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-past"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .lte("fecha", today)
        .in("estado", ["realizada", "cancelada"])
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
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*")).data as BonoCatalogo[] ?? [],
  });

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const trainerMap = new Map(trainers.map((t) => [t.id, t]));
  const catalogoMap = new Map(catalogo.map((b) => [b.id, b]));
  // Bono activo por cliente (fallback: más reciente por created_at)
  const clientBonoTipo = new Map<string, string>();
  const sortedBonos = [...clientBonos].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const cb of sortedBonos) {
    if (clientBonoTipo.has(cb.client_id)) continue;
    const cat = cb.bono_catalogo_id ? catalogoMap.get(cb.bono_catalogo_id) : null;
    if (cat?.tipo) clientBonoTipo.set(cb.client_id, cat.tipo);
  }
  const tipoForSession = (s: Session): string | null => {
    if (s.client_id) {
      const t = clientBonoTipo.get(s.client_id);
      if (t) return t;
    }
    return s.tipo ?? null;
  };

  const q = normalizeText(search.trim());
  const filtered = q
    ? sessions.filter((s) => {
        const name = normalizeText(s.client_id ? clientMap.get(s.client_id)?.nombre ?? "" : (s.titulo ?? ""));
        return name.includes(q) || s.fecha.includes(q);
      })
    : sessions;

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
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre o fecha (YYYY-MM-DD)…"
                className="h-9 w-64"
              />
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
          Cliente: s.client_id ? clientMap.get(s.client_id)?.nombre ?? "" : (s.titulo ?? ""),
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
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Cliente</TableHead>
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
                <TableCell>{s.client_id ? clientMap.get(s.client_id)?.nombre : (s.titulo ?? "—")}</TableCell>
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