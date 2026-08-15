import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, formatTipoBono, type Session, type Trainer, type Client, type ClientBono, type BonoCatalogo, type BonoTipo } from "@/lib/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipProvider as UITooltipProvider, TooltipTrigger as UITooltipTrigger } from "@/components/ui/tooltip";
import {
  Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid,
  Legend as RLegend, LineChart, Line, ComposedChart, LabelList, Cell,
} from "recharts";
import {
  useCenterConfig, openMinutesOfDay, openMinutesInHour, eachDate,
  type HorarioBase, type SpecialDay,
} from "@/lib/center-schedule";
import { trainerColor } from "@/lib/trainer-colors";
import { cn } from "@/lib/utils";
import { useStatsConfig, isDefaultCompat, type StatsKpiKey } from "@/lib/stats-config";
import { useBehaviorConfig, getBehaviorConfig, sessionCountsAsTraining } from "@/lib/behavior-config";

export const Route = createFileRoute("/_shell/estadisticas")({ component: StatsPage });

// ============================================================
// Constants
// ============================================================
const SLOTS = 3; // 3 espacios simultáneos disponibles
// Franja horaria del centro: 6:45 – 22:00 → buckets horarios 6..21
const HORA_MIN = 6;
const HORA_MAX = 21;
const HOURS = Array.from({ length: HORA_MAX - HORA_MIN + 1 }, (_, i) => HORA_MIN + i); // 6..21
const DOW_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function spacesFor(tipo: Session["tipo"]): number {
  if (tipo === "grupal") return 2;
  return 1; // individual, pareja, prueba, null
}
// Una sesión cuenta como entrenamiento si está realizada, o cancelada según el
// ajuste Configuración → Funcionamiento → Cancelaciones.
function countsAsTraining(s: Session): boolean {
  return sessionCountsAsTraining(s.estado, s.no_contabilizar, getBehaviorConfig().canceladasCuentanModo);
}
// Aplica la preferencia "Contabilizar grupales sin asistentes" del apartado
// Configuración → Funcionamiento. Si está desactivada, las sesiones grupales
// sin ningún cliente asignado no cuentan en estadísticas.
function passesGroupAttendance(
  s: Session,
  grupalesSinAsistentesCuentan: boolean,
  groupClientsMap: Map<string, string[]>,
): boolean {
  if (grupalesSinAsistentesCuentan) return true;
  const isGroup = !!s.group_id || s.ocupacion === 2 || s.tipo === "grupal";
  if (!isGroup) return true;
  if (s.client_id) return true;
  if (s.group_id) {
    const members = groupClientsMap.get(s.group_id) ?? [];
    if (members.length > 0) return true;
  }
  return false;
}
function hourOf(hhmm: string): number { return Number(hhmm.split(":")[0]); }
function durMin(hi?: string | null, hf?: string | null): number {
  if (!hi || !hf) return 0;
  const [h1, m1] = hi.split(":").map(Number);
  const [h2, m2] = hf.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function monthStart(y: number, m: number): Date { return new Date(y, m, 1); }
function monthEnd(y: number, m: number): Date { return new Date(y, m + 1, 0); }
function daysInMonth(y: number, m: number): number { return monthEnd(y, m).getDate(); }

// ============================================================
// Page
// ============================================================
function StatsPage() {
  const { horario, specialsMap, precios } = useCenterConfig();
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-all"],
    queryFn: async () => (await supabase.from("sessions").select("*")).data as Session[] ?? [],
  });
  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers"],
    queryFn: async () => (await supabase.from("trainers").select("*")).data as Trainer[] ?? [],
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await supabase.from("clients").select("*")).data as Client[] ?? [],
  });
  const { data: events = [] } = useQuery({
    queryKey: ["client_events"],
    queryFn: async () => (await supabase.from("client_events").select("*")).data as ClientEvent[] ?? [],
  });
  const { data: clientBonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => (await supabase.from("client_bonos").select("*")).data as ClientBono[] ?? [],
  });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [],
  });
  const { data: groupMembers = [] } = useQuery({
    queryKey: ["group_members"],
    queryFn: async () => (await supabase.from("group_members").select("*")).data as { group_id: string; client_id: string }[] ?? [],
  });
  const clientTipoMap = useMemo(() => {
    const catMap = new Map(catalogo.map((b) => [b.id, b]));
    const sorted = [...clientBonos].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    const m = new Map<string, BonoTipo>();
    for (const cb of sorted) {
      if (m.has(cb.client_id)) continue;
      const cat = cb.bono_catalogo_id ? catMap.get(cb.bono_catalogo_id) : null;
      if (cat?.tipo) m.set(cb.client_id, cat.tipo);
    }
    return m;
  }, [clientBonos, catalogo]);
  // Precio por sesión por cliente, según su bono más reciente.
  // - Individual/Pareja/Grupal/Prueba: precio del bono / sesiones incluidas.
  // - Gympass: se toma de Configuración → precios (gympass_ep / gympass_gr).
  // - Clientes genéricos ClassPass: precios.classpass.
  const clientPricePerSessionMap = useMemo(() => {
    const catMap = new Map(catalogo.map((b) => [b.id, b]));
    const nameById = new Map(clients.map((c) => [c.id, c.nombre]));
    const sorted = [...clientBonos].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    const m = new Map<string, number>();
    for (const cb of sorted) {
      if (m.has(cb.client_id)) continue;
      const cat = cb.bono_catalogo_id ? catMap.get(cb.bono_catalogo_id) : null;
      const nombreCli = (nameById.get(cb.client_id) ?? "").toLowerCase();
      const isClassPass = /classpass|claspas/.test(nombreCli);
      if (isClassPass) { m.set(cb.client_id, precios.classpass); continue; }
      if (!cat) continue;
      if (cat.tipo === "gympass") {
        const n = (cat.nombre ?? "").toLowerCase();
        const isGr = /\bgr\b|grup/.test(n);
        m.set(cb.client_id, isGr ? precios.gympass_gr : precios.gympass_ep);
        continue;
      }
      const ses = cat.sesiones_incluidas ?? 0;
      const price = ses > 0 ? (Number(cat.precio) || 0) / ses : 0;
      m.set(cb.client_id, price);
    }
    return m;
  }, [clientBonos, catalogo, clients, precios]);
  const groupClientsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const gm of groupMembers) {
      const arr = m.get(gm.group_id) ?? [];
      arr.push(gm.client_id);
      m.set(gm.group_id, arr);
    }
    return m;
  }, [groupMembers]);

  // Filtra sesiones según los ajustes de "Funcionamiento": si el usuario ha
  // desactivado "Contabilizar grupales sin asistentes", omitimos aquí las
  // grupales vacías para que no aparezcan en ningún KPI ni gráfica.
  const behavior = useBehaviorConfig();
  const filteredSessions = useMemo(() => {
    if (behavior.grupalesSinAsistentesCuentan) return sessions;
    return sessions.filter((s) =>
      passesGroupAttendance(s, behavior.grupalesSinAsistentesCuentan, groupClientsMap),
    );
  }, [sessions, behavior.grupalesSinAsistentesCuentan, groupClientsMap]);

  const nowPage = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${nowPage.getFullYear()}-${String(nowPage.getMonth() + 1).padStart(2, "0")}`,
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">Estadísticas</h1>
      </div>

      <KpiPanel ym={selectedMonth} onYmChange={setSelectedMonth} sessions={filteredSessions} clients={clients} events={events} horario={horario} specialsMap={specialsMap} clientPricePerSessionMap={clientPricePerSessionMap} groupClientsMap={groupClientsMap} />

      <ComparisonModule month={selectedMonth} sessions={filteredSessions} trainers={trainers} events={events} horario={horario} specialsMap={specialsMap} clientTipoMap={clientTipoMap} clientPricePerSessionMap={clientPricePerSessionMap} groupClientsMap={groupClientsMap} />
    </div>
  );
}

type ClientEvent = {
  id: string;
  client_id: string;
  tipo: "alta" | "baja";
  fecha: string;
  created_at: string;
};

// ============================================================
// KPI Panel
// ============================================================
function KpiPanel({ ym, onYmChange, sessions, clients, events, horario, specialsMap, clientPricePerSessionMap, groupClientsMap }: {
  ym: string; onYmChange: (v: string) => void;
  sessions: Session[]; clients: Client[]; events: ClientEvent[];
  horario: HorarioBase; specialsMap: Map<string, SpecialDay>;
  clientPricePerSessionMap: Map<string, number>;
  groupClientsMap: Map<string, string[]>;
}) {
  const now = new Date();
  const [ys, ms] = ym.split("-").map(Number);
  const y = ys;
  const m = ms - 1;
  const start = ymd(monthStart(y, m));
  const end = ymd(monthEnd(y, m));

  // Sólo mostrar meses/años con actividad real (sesiones o eventos), más el mes en curso.
  const activityMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    for (const s of sessions) if (s.fecha) set.add(s.fecha.slice(0, 7));
    for (const e of events) if (e.fecha) set.add(e.fecha.slice(0, 7));
    return set;
  }, [sessions, events, now]);

  const monthSessions = sessions.filter((s) => s.fecha >= start && s.fecha <= end);
  // Se lee la config para re-renderizar cuando cambia el criterio de canceladas.
  useBehaviorConfig();
  const realizadas = monthSessions.filter(countsAsTraining);
  const mananas = realizadas.filter((s) => hourOf(s.hora_inicio) < 14).length;
  const tardes = realizadas.length - mananas;

  // Ocupación media: sólo cuenta hasta hoy si el mes seleccionado es el actual
  // (ocupación real acumulada vs. capacidad disponible transcurrida).
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth();
  const capEnd = isCurrentMonth ? now : monthEnd(y, m);
  const capEndStr = ymd(capEnd);
  const occupiedMin = realizadas
    .filter((s) => s.fecha <= capEndStr)
    .reduce((acc, s) => acc + durMin(s.hora_inicio, s.hora_fin) * spacesFor(s.tipo), 0);
  let capacityMin = 0;
  for (const d of eachDate(monthStart(y, m), capEnd)) {
    capacityMin += openMinutesOfDay(d, horario, specialsMap) * SLOTS;
  }
  const ocupacionMedia = capacityMin > 0 ? (occupiedMin / capacityMin) * 100 : 0;

  const altasMes = events.filter((e) => e.tipo === "alta" && e.fecha >= start && e.fecha <= end).length;
  const bajasMes = events.filter((e) => e.tipo === "baja" && e.fecha >= start && e.fecha <= end).length;

  // KPIs adicionales configurables
  const facturacionMes = useMemo(() => {
    let total = 0;
    for (const s of realizadas) {
      if (s.client_id) total += clientPricePerSessionMap.get(s.client_id) ?? 0;
      else if (s.group_id) {
        const members = groupClientsMap.get(s.group_id) ?? [];
        for (const cid of members) total += clientPricePerSessionMap.get(cid) ?? 0;
      }
    }
    return Math.round(total);
  }, [realizadas, clientPricePerSessionMap, groupClientsMap]);
  const cancelacionesMes = monthSessions.filter((s) => s.estado === "cancelada").length;
  const sesionesGrupalesMes = realizadas.filter(
    (s) => !!s.group_id || s.tipo === "grupal" || s.ocupacion === 2,
  ).length;
  const clientesActivos = clients.filter((c) => c.activo).length;

  const statsConfig = useStatsConfig();
  const allKpis: { id: StatsKpiKey; label: string; value: string; hint: string; info: string }[] = [
    {
      id: "entrenamientos",
      label: "Entrenamientos totales",
      value: String(realizadas.length),
      hint: `${mananas} mañana · ${tardes} tarde`,
      info: "Suma de sesiones que cuentan como entrenamiento (realizadas + canceladas contabilizadas) dentro del mes seleccionado. Las canceladas marcadas como 'No contabilizar' (NC) quedan excluidas. Se separan en mañana (inicio < 14:00) y tarde (inicio ≥ 14:00).",
    },
    {
      id: "ocupacion",
      label: "Ocupación media del centro",
      value: `${ocupacionMedia.toFixed(1)}%`,
      hint: isCurrentMonth ? "Acumulado hasta hoy" : `${MES_LABEL[m]} ${y}`,
      info:
        `Minutos ocupados ÷ minutos disponibles del centro × 100.\n\n` +
        `• Minutos ocupados: duración de cada sesión que cuenta como entrenamiento (realizada o cancelada contabilizada) × espacios que usa ` +
        `(individual/pareja/prueba = 1 espacio, grupal = 2 espacios).\n` +
        `• Minutos disponibles: minutos que el centro está abierto × 3 espacios simultáneos, ` +
        `sumando todos los días del periodo.\n` +
        (isCurrentMonth
          ? `• Al ser el mes en curso, sólo se cuenta hasta hoy (ocupación real, no proyectada).\n\n`
          : `\n`) +
        `Actual: ${Math.round(occupiedMin)} min ocupados de ${Math.round(capacityMin)} min disponibles.`,
    },
    {
      id: "altas",
      label: "Altas del mes",
      value: String(altasMes),
      hint: `Nuevos clientes en ${MES_LABEL[m]} ${y}`,
      info: "Número de clientes cuyo primer bono (individual, pareja o grupal) se ha registrado dentro del mes seleccionado. No cuenta bonos de prueba ni pases genéricos (Gympass/ClassPass).",
    },
    {
      id: "bajas",
      label: "Bajas del mes",
      value: String(bajasMes),
      hint: `Clientes que pasaron a inactivo`,
      info: "Número de clientes marcados como inactivos durante el mes seleccionado. Si un cliente se reactiva, su baja deja de contar.",
    },
    {
      id: "facturacionMes",
      label: "Facturación estimada del mes",
      value: `${facturacionMes} €`,
      hint: `Sesiones realizadas y canceladas contabilizadas`,
      info: "Suma del precio por sesión de cada entrenamiento del mes (realizadas + canceladas contabilizadas). Precio por sesión = precio del bono ÷ sesiones incluidas. Gympass/ClassPass usan los precios de Configuración → Precios.",
    },
    {
      id: "cancelacionesMes",
      label: "Cancelaciones del mes",
      value: String(cancelacionesMes),
      hint: "Incluye las marcadas como No contabilizar",
      info: "Número de sesiones en estado 'cancelada' dentro del mes seleccionado, incluyendo las marcadas como 'No contabilizar'.",
    },
    {
      id: "sesionesGrupales",
      label: "Sesiones grupales del mes",
      value: String(sesionesGrupalesMes),
      hint: `${MES_LABEL[m]} ${y}`,
      info: "Entrenamientos grupales contabilizados en el mes (realizadas + canceladas contabilizadas). Depende del ajuste 'Contabilizar grupales sin asistentes' de Configuración → Funcionamiento.",
    },
    {
      id: "clientesActivos",
      label: "Clientes activos",
      value: String(clientesActivos),
      hint: "Total actual",
      info: "Número total de clientes marcados como activos en este momento (independiente del mes seleccionado).",
    },
  ];
  const kpis = allKpis.filter((k) => statsConfig.kpis[k.id]);

  return (
    <div className="space-y-3">
      <KpiMonthSelector value={ym} onChange={onYmChange} activityMonths={activityMonths} now={now} />
      <UITooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <span>{k.label}</span>
                <UITooltip>
                  <UITooltipTrigger asChild>
                    <button type="button" className="inline-flex items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring" aria-label="Explicación">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </UITooltipTrigger>
                  <UITooltipContent side="top" className="max-w-xs whitespace-pre-line text-xs normal-case tracking-normal font-normal">
                    {k.info}
                  </UITooltipContent>
                </UITooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display font-semibold">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      </UITooltipProvider>
    </div>
  );
}

function KpiMonthSelector({ value, onChange, activityMonths, now }: {
  value: string; onChange: (v: string) => void; activityMonths: Set<string>; now: Date;
}) {
  const [ys, ms] = value.split("-");
  const y = Number(ys); const m = Number(ms);
  const curY = now.getFullYear(); const curM = now.getMonth() + 1;
  const yearsSet = new Set<number>();
  for (const key of activityMonths) yearsSet.add(Number(key.slice(0, 4)));
  const years = Array.from(yearsSet).filter((yy) => Number.isFinite(yy)).sort((a, b) => b - a);
  const monthsForYearFn = (yy: number): number[] => {
    const out: number[] = [];
    for (let mm = 1; mm <= 12; mm++) {
      const key = `${yy}-${String(mm).padStart(2, "0")}`;
      if (activityMonths.has(key)) out.push(mm);
    }
    return out.sort((a, b) => a - b);
  };
  const months = monthsForYearFn(y);
  const setYear = (yy: string) => {
    const ny = Number(yy);
    const opts = monthsForYearFn(ny);
    let nm = m;
    if (!opts.includes(nm)) nm = opts.length ? opts[opts.length - 1] : (ny === curY ? curM : 12);
    onChange(`${yy}-${String(nm).padStart(2, "0")}`);
  };
  const setMonth = (mm: string) => onChange(`${ys}-${mm}`);
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Mes</Label>
        <div className="flex gap-2">
          <Select value={ms} onValueChange={setMonth}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((mm) => (
                <SelectItem key={mm} value={String(mm).padStart(2, "0")}>{MES_FULL[mm - 1]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ys} onValueChange={setYear}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((yy) => <SelectItem key={yy} value={String(yy)}>{yy}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        variant="outline" size="sm" className="h-9"
        onClick={() => onChange(`${curY}-${String(curM).padStart(2, "0")}`)}
        disabled={y === curY && m === curM}
      >
        Mes actual
      </Button>
    </div>
  );
}

// ============================================================
// Comparison Module
// ============================================================
type Metric = "ocupacion" | "sesiones" | "cancelaciones" | "porEntrenador" | "facturacion" | "altasBajas";
type Desglose = "franja" | "turno" | "dow" | "tipoSesion" | "total";
type PeriodMode = "mesUnico" | "comparar" | "historico";

type UnclassifiedInfo = {
  count: number;
  reasons: { sinCliente: number; tipoPrueba: number; otro: number };
  samples: { id: string; fecha: string; hora: string; reason: string }[];
};

const METRIC_LABEL: Record<Metric, string> = {
  ocupacion: "Ocupación del centro (%)",
  sesiones: "Nº sesiones",
  cancelaciones: "Cancelaciones (incl. NC)",
  porEntrenador: "Sesiones por entrenador",
  facturacion: "Facturación estimada (€)",
  altasBajas: "Altas y bajas por mes",
};
const DESGLOSE_LABEL: Record<Desglose, string> = {
  franja: "Franja horaria (6:45–22:00)",
  turno: "Turno (mañana / tarde)",
  dow: "Día de la semana",
  tipoSesion: "Tipo de sesión",
  total: "Sin desglosar",
};
const PERIOD_LABEL: Record<PeriodMode, string> = {
  mesUnico: "Mes actual",
  comparar: "Comparar meses",
  historico: "Histórico (todos los meses)",
};

// Reglas de combinaciones válidas (métrica, desglose, periodo) por DEFECTO.
// La compatibilidad métrica × desglose puede ampliarse/restringirse desde
// Configuración → Estadísticas. Las restricciones de PERIODO se mantienen aquí.
const NON_MVT_PERIODS: PeriodMode[] = ["mesUnico", "comparar", "historico"];
function isValidComboDefault(metric: Metric, desglose: Desglose, period: PeriodMode): boolean {
  if (metric === "altasBajas") {
    return desglose === "total";
  }
  // "Sin desglosar" es válido para cualquier métrica y periodo.
  if (desglose === "total") return true;
  if (metric === "ocupacion") {
    if (desglose === "turno" || desglose === "dow") return true;
    return false;
  }
  if (metric === "sesiones") {
    if (desglose === "franja") return period === "mesUnico";
    return true;
  }
  if (metric === "cancelaciones") {
    if (desglose === "franja") return period === "mesUnico";
    if (desglose === "tipoSesion") return false;
    return true;
  }
  if (metric === "porEntrenador") {
    if (period !== "mesUnico") return false;
    if (desglose === "turno" || desglose === "dow") return true;
    return false;
  }
  if (metric === "facturacion") {
    if (desglose === "franja" || desglose === "tipoSesion") return false;
    return true;
  }
  return true;
}
function isDesgloseAllowedDefault(metric: Metric, desglose: Desglose): boolean {
  if (metric === "altasBajas") return desglose === "total";
  if (desglose === "total") return true;
  if (desglose === "tipoSesion") return metric === "sesiones";
  if (metric === "ocupacion") return desglose === "turno" || desglose === "dow";
  if (metric === "porEntrenador") return desglose === "turno" || desglose === "dow";
  if (metric === "facturacion" && desglose === "franja") return false;
  return true;
}
// Las restricciones de periodo se configuran en Configuración → Estadísticas.

function getChartInfo(metric: Metric, desglose: Desglose, period: PeriodMode): string {
  const metricInfo: Record<Metric, string> = {
    ocupacion:
      "Ocupación del centro (%): minutos ocupados ÷ minutos disponibles × 100.\n" +
      "• Minutos ocupados: duración de cada sesión que cuenta como entrenamiento (realizada o cancelada contabilizada; NC excluida) × espacios que usa (individual/pareja/prueba = 1, grupal = 2).\n" +
      "• Minutos disponibles: minutos que el centro está abierto × 3 espacios simultáneos, sumando los días del periodo.",
    sesiones:
      "Nº de sesiones: total de entrenamientos dentro del periodo. Cuenta las realizadas y las canceladas contabilizadas (las canceladas marcadas como 'No contabilizar' quedan excluidas). No incluye reservadas ni renovaciones.",
    cancelaciones:
      "Cancelaciones: total de sesiones en estado 'cancelada' dentro del periodo, incluyendo las marcadas como 'No contabilizar' (NC).",
    porEntrenador:
      "Sesiones por entrenador: número de entrenamientos (realizadas + canceladas contabilizadas, NC excluidas) asignados a cada entrenador dentro del periodo. Sólo se muestra el mes actual.",
    facturacion:
      "Facturación estimada (€): suma, para cada sesión contabilizada (realizada o cancelada contabilizada) del periodo, del precio por sesión del bono del cliente.\n" +
      "• Precio por sesión = precio del bono ÷ sesiones incluidas (Individual, Pareja, Grupal, Prueba).\n" +
      "• Bonos Gympass (EP/GR) y ClassPass usan el precio fijado en Configuración → Precios.\n" +
      "• Sesiones grupales sin cliente asignado suman el precio por sesión de todos los miembros del grupo.",
    altasBajas:
      "Altas y bajas por mes:\n" +
      "• Altas: clientes cuyo primer bono (individual/pareja/grupal) se registró en el mes. No cuenta bonos de prueba ni pases genéricos (Gympass/ClassPass).\n" +
      "• Bajas: clientes marcados como inactivos en el mes. Si un cliente se reactiva su baja deja de contar.",
  };
  const desgloseInfo: Partial<Record<Desglose, string>> = {
    franja: "Desglose por franja horaria: cada punto agrupa las sesiones que empiezan en esa hora (6:00–21:00).",
    turno: "Desglose por turno: mañana (inicio < 14:00) y tarde (inicio ≥ 14:00).",
    dow: "Desglose por día de la semana: se suma en cada día (Lun–Dom) el total del periodo.",
    tipoSesion:
      "Desglose por tipo de sesión: se agrupa por el tipo del bono activo del cliente al momento de la sesión (Individual, Pareja, Grupal, Gympass). Los colores se configuran en Configuración → Tipos de bonos y precios.",
    total: "Sin desglosar: se muestra el valor total del periodo sin subdivisiones.",
  };
  const periodInfo: Record<PeriodMode, string> = {
    mesUnico: "Periodo: mes actual seleccionado.",
    comparar: "Periodo: comparación entre los meses elegidos, mostrados en paralelo.",
    historico: "Periodo: histórico cronológico de todos los meses con datos.",
  };
  return [
    metricInfo[metric],
    desgloseInfo[desglose],
    periodInfo[period],
  ]
    .filter(Boolean)
    .join("\n\n");
}

function ComparisonModule({ month, sessions, trainers, events, horario, specialsMap, clientTipoMap, clientPricePerSessionMap, groupClientsMap }: {
  month: string;
  sessions: Session[]; trainers: Trainer[]; events: ClientEvent[];
  horario: HorarioBase; specialsMap: Map<string, SpecialDay>;
  clientTipoMap: Map<string, BonoTipo>;
  clientPricePerSessionMap: Map<string, number>;
  groupClientsMap: Map<string, string[]>;
}) {
  const { colores: tipoColores } = useCenterConfig();
  const { data: catalogoTiposList = [] } = useQuery({
    queryKey: ["bonos_catalogo_tipos"],
    queryFn: async () => {
      const { data } = await supabase.from("bonos_catalogo").select("tipo");
      return Array.from(new Set(((data ?? []) as { tipo: string }[]).map((r) => r.tipo)));
    },
  });
  const [metric, setMetric] = useState<Metric>("sesiones");
  const [desglose, setDesglose] = useState<Desglose>("total");
  const [period, setPeriod] = useState<PeriodMode>("mesUnico");
  const [selectedTrainerIds, setSelectedTrainerIds] = useState<string[]>([]);
  const statsConfig = useStatsConfig();
  const canceladasModo = useBehaviorConfig().canceladasCuentanModo;

  // Compatibilidad efectiva: sólo la métrica × desglose configurada por el usuario.
  const isDesgloseAllowedForMetric = (mm: Metric, dd: Desglose): boolean =>
    !!statsConfig.compat[mm]?.[dd];
  const isValidCombo = (mm: Metric, dd: Desglose, _pp: PeriodMode): boolean =>
    isDesgloseAllowedForMetric(mm, dd);
  const firstValidDesglose = (mm: Metric, pp: PeriodMode): Desglose => {
    const order: Desglose[] = ["total", "turno", "dow", "franja", "tipoSesion"];
    for (const d of order) if (isValidCombo(mm, d, pp)) return d;
    return "total";
  };
  const firstValidPeriod = (_mm: Metric, _dd: Desglose): PeriodMode => {
    return "mesUnico";
  };

  // Al cambiar de métrica limpiamos la selección para evitar estados raros.
  useEffect(() => { setSelectedTrainerIds([]); }, [metric]);

  function toggleTrainer(id: string) {
    setSelectedTrainerIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur; // máximo 3
      return [...cur, id];
    });
  }
  const selectedTrainers = useMemo(
    () => selectedTrainerIds
      .map((id) => trainers.find((t) => t.id === id))
      .filter((t): t is Trainer => !!t),
    [selectedTrainerIds, trainers],
  );
  // Iniciales del entrenador seleccionado → color fijo. Se pasa al chart.
  const trainerColorByInitials = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of selectedTrainers) m.set(t.iniciales, trainerColor(t.id));
    return m;
  }, [selectedTrainers]);

  // Al cambiar métrica, corregir desglose/periodo si la combinación deja de ser válida.
  useEffect(() => {
    if (!isValidCombo(metric, desglose, period)) {
      const d = isDesgloseAllowedForMetric(metric, desglose) ? desglose : firstValidDesglose(metric, period);
      const p = isValidCombo(metric, d, period) ? period : firstValidPeriod(metric, d);
      if (d !== desglose) setDesglose(d);
      if (p !== period) setPeriod(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric]);

  const handleDesgloseChange = (v: string) => {
    const d = v as Desglose;
    setDesglose(d);
    if (!isValidCombo(metric, d, period)) setPeriod(firstValidPeriod(metric, d));
  };
  const handlePeriodChange = (v: string) => {
    const p = v as PeriodMode;
    setPeriod(p);
    if (!isValidCombo(metric, desglose, p)) setDesglose(firstValidDesglose(metric, p));
  };

  const now = new Date();
  const monthA = month;
  const [compareMonths, setCompareMonths] = useState<string[]>(() => {
    const out: string[] = [];
    for (let i = 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  });

  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);

  // Meses con actividad (sesiones o eventos) + mes en curso.
  const activityMonthsCmp = useMemo(() => {
    const set = new Set<string>();
    const nowD = new Date();
    set.add(`${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`);
    for (const s of sessions) if (s.fecha) set.add(s.fecha.slice(0, 7));
    for (const e of events) if (e.fecha) set.add(e.fecha.slice(0, 7));
    return set;
  }, [sessions, events]);
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const key of activityMonthsCmp) ys.add(Number(key.slice(0, 4)));
    return Array.from(ys).filter((y) => Number.isFinite(y)).sort((a, b) => b - a).map(String);
  }, [activityMonthsCmp]);
  const monthsForYear = (yStr: string): number[] => {
    const y = Number(yStr);
    const out: number[] = [];
    for (let mm = 1; mm <= 12; mm++) {
      if (activityMonthsCmp.has(`${y}-${String(mm).padStart(2, "0")}`)) out.push(mm - 1);
    }
    return out;
  };

  // Build series: [{ bucket, seriesA, seriesB?, ... }]
  const { rows, seriesKeys, isLineChart, unclassified } = useMemo(
    () => buildSeries({ sessions, events, metric, desglose, period, monthA, compareMonths, trainerMap, horario, specialsMap, clientTipoMap, clientPricePerSessionMap, groupClientsMap, selectedTrainerIds, catalogoTipos: catalogoTiposList }),
    [sessions, events, metric, desglose, period, monthA, compareMonths, trainerMap, horario, specialsMap, clientTipoMap, clientPricePerSessionMap, groupClientsMap, selectedTrainerIds, catalogoTiposList, canceladasModo],
  );

  function handleCsvExport() {
    if (rows.length === 0) return;
    const headers = ["bucket", ...seriesKeys];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? "")).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estadisticas-${metric}-${desglose}-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const palette = ["var(--primary)", "hsl(24 90% 55%)", "hsl(150 60% 45%)", "hsl(280 60% 55%)", "hsl(340 70% 55%)", "hsl(200 70% 50%)"];
  const colorForSeries = (name: string, idx: number): string => {
    const lower = name.toLowerCase();
    if (metric === "porEntrenador") {
      if (name === "Total") return "#94a3b8"; // neutro cuando no hay selección
      const c = trainerColorByInitials.get(name);
      if (c) return c;
    }
    if (lower.startsWith("alta")) return "hsl(150 65% 42%)";
    if (lower.startsWith("baja")) return "hsl(0 72% 55%)";
    // Buscar el color por tipo de bono a partir del label (formatTipoBono).
    for (const [tipoKey, hex] of Object.entries(tipoColores)) {
      if (formatTipoBono(tipoKey).toLowerCase() === lower) return hex;
    }
    return palette[idx % palette.length];
  };

  // Ya no se dibuja línea de total superpuesta sobre las barras.
  const rowsWithTotal = rows;
  // Ejes: cuando hay muchas etiquetas (franja horaria) se rotan y reducen.
  const manyTicks = rows.length > 10;
  const xAxisProps = manyTicks
    ? { tick: { fontSize: 10 }, angle: -45, textAnchor: "end" as const, height: 60, interval: 0 }
    : { tick: { fontSize: 12 } };
  const chartMargin = manyTicks ? { top: 10, right: 10, left: 0, bottom: 24 } : { top: 10, right: 10, left: 0, bottom: 0 };

  const chartInfo = getChartInfo(metric, desglose, period);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Métrica</Label>
          <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(METRIC_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Desglose</Label>
          <Select
            value={desglose}
            onValueChange={handleDesgloseChange}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(DESGLOSE_LABEL) as [Desglose, string][])
                .filter(([k]) => isDesgloseAllowedForMetric(metric, k))
                .map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Periodo</Label>
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(PERIOD_LABEL) as [PeriodMode, string][])
                .filter(([k]) => isValidCombo(metric, desglose, k))
                .map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        {period === "comparar" && (
          <div className="flex flex-wrap gap-2 items-end">
            {[...compareMonths]
              .map((mm, i) => ({ mm, i }))
              .sort((a, b) => a.mm.localeCompare(b.mm))
              .map(({ mm, i }, orderIdx) => (
                <div key={i} className="flex items-end gap-1">
                  <MonthYearPicker
                    label={`Mes ${orderIdx + 1}`}
                    value={mm}
                    onChange={(v) => setCompareMonths((cm) => cm.map((x, idx) => (idx === i ? v : x)))}
                    years={availableYears}
                    monthsForYear={monthsForYear}
                  />
                  {compareMonths.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setCompareMonths((cm) => cm.filter((_, idx) => idx !== i))}
                      aria-label="Quitar mes"
                    >×</Button>
                  )}
                </div>
              ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const sorted = [...compareMonths].sort();
                const earliest = sorted[0] ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                const [ey, em] = earliest.split("-").map(Number);
                const d = new Date(ey, em - 2, 1);
                const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                setCompareMonths((cm) => (cm.includes(next) ? cm : [...cm, next]));
              }}
            >
              + Añadir mes
            </Button>
          </div>
        )}
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <UITooltipProvider delayDuration={150}>
          <div className="flex items-center gap-1.5 mb-3">
            <h3 className="text-sm font-semibold">{METRIC_LABEL[metric]}</h3>
            <span className="text-xs text-muted-foreground">
              · {DESGLOSE_LABEL[desglose]} · {PERIOD_LABEL[period]}
            </span>
            <UITooltip>
              <UITooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  aria-label="Explicación de la gráfica"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </UITooltipTrigger>
              <UITooltipContent
                side="top"
                className="max-w-sm whitespace-pre-line text-xs normal-case tracking-normal font-normal"
              >
                {chartInfo}
              </UITooltipContent>
            </UITooltip>
          </div>
        </UITooltipProvider>
        {unclassified && unclassified.count > 0 && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  {unclassified.count} {unclassified.count === 1 ? "sesión realizada sin clasificar" : "sesiones realizadas sin clasificar"}
                </div>
                <ul className="list-disc pl-4 text-amber-900/90 dark:text-amber-100/90 space-y-0.5">
                  {unclassified.reasons.sinCliente > 0 && (
                    <li>{unclassified.reasons.sinCliente} sin cliente ni grupo asignado.</li>
                  )}
                  {unclassified.reasons.otro > 0 && (
                    <li>{unclassified.reasons.otro} con cliente sin bono activo válido.</li>
                  )}
                </ul>
                {unclassified.samples.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-amber-800 dark:text-amber-200 hover:underline">
                      Ver ejemplos ({unclassified.samples.length}{unclassified.count > unclassified.samples.length ? ` de ${unclassified.count}` : ""})
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-1">
                      {unclassified.samples.map((s) => (
                        <li key={s.id} className="font-mono text-[11px]">
                          {s.fecha} {s.hora} — {s.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}
        {metric === "porEntrenador" && (
          <div className="mb-3 space-y-1.5">
            <div className="text-xs text-muted-foreground">
              Selecciona hasta 3 entrenadores para comparar. Sin selección se muestra el total global.
            </div>
            <div className="flex flex-wrap gap-2">
              {trainers.map((t) => {
                const active = selectedTrainerIds.includes(t.id);
                const disabled = !active && selectedTrainerIds.length >= 3;
                const color = trainerColor(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTrainer(t.id)}
                    disabled={disabled}
                    title={t.nombre}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "text-white border-transparent"
                        : "bg-muted text-foreground border-border hover:bg-muted/70",
                      disabled && "opacity-40 cursor-not-allowed hover:bg-muted",
                    )}
                    style={active ? { backgroundColor: color, borderColor: color } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-white/40"
                      style={{ backgroundColor: color }}
                    />
                    {t.iniciales}
                    <span className="opacity-80 font-normal">· {t.nombre}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="h-[420px] overflow-x-auto">
          <div
            className="h-full"
            style={desglose === "franja" ? undefined : { minWidth: Math.max(rows.length * 80, 400) }}
          >
          {rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sin datos para esta combinación.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {isLineChart ? (
                <LineChart data={rows} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" {...xAxisProps} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} allowDecimals={false} />
                   {metric !== "porEntrenador" && <RLegend />}
                   {seriesKeys.map((k, i) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={colorForSeries(k, i)}
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 4, fill: colorForSeries(k, i), stroke: "#ffffff", strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: colorForSeries(k, i), stroke: "#ffffff", strokeWidth: 2 }}
                      isAnimationActive={false}
                    >
                      <LabelList dataKey={k} position="top" style={{ fill: "var(--color-foreground)", fontSize: 11, fontWeight: 600 }} />
                    </Line>
                  ))}
                </LineChart>
              ) : (
                <ComposedChart data={rowsWithTotal} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" {...xAxisProps} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} allowDecimals={false} />
                  {metric !== "porEntrenador" && <RLegend />}
                  {seriesKeys.map((k, i) => (
                    <Bar key={k} dataKey={k} fill={colorForSeries(k, i)} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {desglose === "tipoSesion" && seriesKeys.length === 1 &&
                        rowsWithTotal.map((r, idx) => (
                          <Cell key={`c-${idx}`} fill={colorForSeries(String((r as { bucket: string }).bucket), idx)} />
                        ))}
                      <LabelList dataKey={k} position="top" style={{ fill: "var(--color-foreground)", fontSize: 11, fontWeight: 600 }} />
                    </Bar>
                  ))}
                </ComposedChart>
              )}
            </ResponsiveContainer>
          )}
          </div>
        </div>
        {metric === "porEntrenador" && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {selectedTrainers.length === 0 ? (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "#94a3b8" }} />
                Total global (sin entrenador seleccionado)
              </div>
            ) : (
              selectedTrainers.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: trainerColor(t.id) }} />
                  <span className="font-medium">{t.iniciales}</span>
                  <span className="text-muted-foreground">{t.nombre}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MonthYearPicker({ label, value, onChange, years, monthsForYear }: {
  label: string; value: string; onChange: (v: string) => void;
  years: string[]; monthsForYear: (y: string) => number[];
}) {
  const [y, m] = value.split("-");
  const monthOptions = monthsForYear(y);
  const setMonth = (mm: string) => onChange(`${y}-${mm}`);
  const setYear = (yy: string) => {
    const opts = monthsForYear(yy);
    let mm = m;
    const currentIdx = Number(m) - 1;
    if (!opts.includes(currentIdx)) {
      const last = opts.length ? opts[opts.length - 1] : 0;
      mm = String(last + 1).padStart(2, "0");
    }
    onChange(`${yy}-${mm}`);
  };
  return (
    <div className="flex gap-2 items-end">
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select value={m} onValueChange={setMonth}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map((i) => <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{MES_FULL[i]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>&nbsp;</Label>
        <Select value={y} onValueChange={setYear}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((yy) => <SelectItem key={yy} value={yy}>{yy}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function YearSelect({ label, value, onChange, years }: {
  label: string; value: string; onChange: (v: string) => void; years: string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          {years.map((yy) => <SelectItem key={yy} value={yy}>{yy}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================
// Series builder
// ============================================================
type SeriesRow = { bucket: string; [key: string]: string | number };

function buildSeries(args: {
  sessions: Session[]; events: ClientEvent[]; metric: Metric; desglose: Desglose; period: PeriodMode;
  monthA: string; compareMonths: string[];
  trainerMap: Map<string, Trainer>;
  horario: HorarioBase; specialsMap: Map<string, SpecialDay>;
  clientTipoMap: Map<string, BonoTipo>;
  clientPricePerSessionMap: Map<string, number>;
  groupClientsMap: Map<string, string[]>;
  selectedTrainerIds?: string[];
  catalogoTipos?: string[];
}): { rows: SeriesRow[]; seriesKeys: string[]; isLineChart: boolean; unclassified?: UnclassifiedInfo } {
  const { sessions, events, metric, desglose, period, monthA, compareMonths, trainerMap, horario, specialsMap, clientTipoMap, clientPricePerSessionMap, groupClientsMap, selectedTrainerIds = [], catalogoTipos = [] } = args;
  const knownTipos = Array.from(new Set<string>([
    "individual", "pareja", "grupal", "gympass", "prueba",
    ...catalogoTipos,
  ]));
  const tipoOf = (s: Session): Session["tipo"] => {
    // Cualquier sesión con grupo cuenta siempre como "grupal",
    // aunque no tenga clientes asignados.
    if (s.group_id) return "grupal";
    if (s.client_id) {
      const t = clientTipoMap.get(s.client_id);
      if (t) return t as Session["tipo"];
    }
    return s.tipo;
  };

  // Lista cronológica de meses según el modo de periodo.
  const parseYmTop = (ym: string) => { const [y, m] = ym.split("-").map(Number); return { y, m: m - 1 }; };
  const monthLblTop = (y: number, m: number) => `${MES_LABEL[m]} ${y}`;
  const collectMonthList = (source: "sessions" | "events" | "both"): { y: number; m: number; key: string }[] => {
    if (period === "mesUnico") {
      const { y, m } = parseYmTop(monthA);
      return [{ y, m, key: monthLblTop(y, m) }];
    }
    if (period === "comparar") {
      const seen = new Set<string>();
      return [...compareMonths]
        .filter((mm) => { if (seen.has(mm)) return false; seen.add(mm); return true; })
        .sort()
        .map((mm) => { const { y, m } = parseYmTop(mm); return { y, m, key: monthLblTop(y, m) }; });
    }
    // historico: rango desde el mes más antiguo con datos hasta el mes actual
    const all: string[] = [];
    if (source !== "events") for (const s of sessions) if (s.fecha) all.push(s.fecha);
    if (source !== "sessions") for (const e of events) if (e.fecha) all.push(e.fecha);
    all.sort();
    const now = new Date();
    const start = all[0] ? new Date(all[0] + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), 1);
    const out: { y: number; m: number; key: string }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const endD = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cur.getTime() <= endD.getTime()) {
      out.push({ y: cur.getFullYear(), m: cur.getMonth(), key: monthLblTop(cur.getFullYear(), cur.getMonth()) });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  };

  // -------- Altas / Bajas metric (bucketed by month, independent of desglose) --------
  if (metric === "altasBajas") {
    const buckets = collectMonthList("events");
    const rows: SeriesRow[] = buckets.map(({ key, y, m }) => {
      const s = ymd(monthStart(y, m));
      const e = ymd(monthEnd(y, m));
      const altas = events.filter((ev) => ev.tipo === "alta" && ev.fecha >= s && ev.fecha <= e).length;
      const bajas = events.filter((ev) => ev.tipo === "baja" && ev.fecha >= s && ev.fecha <= e).length;
      return { bucket: key, Altas: altas, Bajas: bajas };
    });
    return { rows, seriesKeys: ["Altas", "Bajas"], isLineChart: period === "historico" };
  }

  // -------- Facturación estimada (por turno, día de la semana o total) --------
  // Precio por sesión derivado del bono real del cliente:
  //   • Individual / Pareja / Grupal / Prueba → precio del bono / sesiones incluidas.
  //   • Gympass (EP/GR) y ClassPass → precios configurados en Configuración.
  // Para sesiones grupales sin cliente asignado se suman los precios por sesión
  // de todos los miembros del grupo.
  if (metric === "facturacion") {
    const monthsFact = collectMonthList("sessions");
    const inRange = (s: Session, y: number, m: number) =>
      s.fecha >= ymd(monthStart(y, m)) && s.fecha <= ymd(monthEnd(y, m));
    const periodsFact = monthsFact.map(({ y, m, key }) => ({
      key, y, m, filter: (s: Session) => inRange(s, y, m),
    }));
    const amountOf = (s: Session): number => {
      if (!countsAsTraining(s)) return 0;
      if (s.client_id) return clientPricePerSessionMap.get(s.client_id) ?? 0;
      if (s.group_id) {
        const members = groupClientsMap.get(s.group_id) ?? [];
        let total = 0;
        for (const cid of members) total += clientPricePerSessionMap.get(cid) ?? 0;
        return total;
      }
      return 0;
    };
    const DOW_KEYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
    // Devuelve el índice 0..5 (Lun..Sáb) o -1 si es domingo (se omite).
    const dowIdx = (s: Session) => {
      const d = new Date(s.fecha + "T00:00:00").getDay(); // 0=Dom
      return d === 0 ? -1 : d - 1;
    };
    if (period === "mesUnico") {
      const p = periodsFact[0];
      if (!p) return { rows: [], seriesKeys: [], isLineChart: false };
      const filtered = sessions.filter(p.filter);
      if (desglose === "total") {
        let total = 0;
        for (const s of filtered) total += amountOf(s);
        return { rows: [{ bucket: "Total", [p.key]: Math.round(total) }], seriesKeys: [p.key], isLineChart: false };
      }
      if (desglose === "dow") {
        const acc = new Array(6).fill(0) as number[];
        for (const s of filtered) {
          const i = dowIdx(s);
          if (i < 0) continue;
          acc[i] += amountOf(s);
        }
        const rows: SeriesRow[] = DOW_KEYS.map((k, i) => ({ bucket: k, [p.key]: Math.round(acc[i]) }));
        return { rows, seriesKeys: [p.key], isLineChart: false };
      }
      // turno
      let am = 0, pm = 0;
      for (const s of filtered) {
        const amt = amountOf(s);
        if (amt === 0) continue;
        if (hourOf(s.hora_inicio) < 14) am += amt; else pm += amt;
      }
      const rows: SeriesRow[] = [
        { bucket: "Mañana", [p.key]: Math.round(am) },
        { bucket: "Tarde", [p.key]: Math.round(pm) },
        { bucket: "Total", [p.key]: Math.round(am + pm) },
      ];
      return { rows, seriesKeys: [p.key], isLineChart: false };
    }
    // comparar / historico: X = meses; series según desglose
    const rows: SeriesRow[] = [];
    for (const p of periodsFact) {
      const filtered = sessions.filter(p.filter);
      const row: SeriesRow = { bucket: p.key };
      if (desglose === "turno") {
        let am = 0, pm = 0;
        for (const s of filtered) {
          const amt = amountOf(s);
          if (amt === 0) continue;
          if (hourOf(s.hora_inicio) < 14) am += amt; else pm += amt;
        }
        row["Mañana"] = Math.round(am);
        row["Tarde"] = Math.round(pm);
      } else if (desglose === "dow") {
        const acc = new Array(6).fill(0) as number[];
        for (const s of filtered) {
          const i = dowIdx(s);
          if (i < 0) continue;
          acc[i] += amountOf(s);
        }
        for (let i = 0; i < 6; i++) row[DOW_KEYS[i]] = Math.round(acc[i]);
      } else {
        let total = 0;
        for (const s of filtered) total += amountOf(s);
        row["Total"] = Math.round(total);
      }
      rows.push(row);
    }
    const seriesKeys =
      desglose === "turno" ? ["Mañana", "Tarde"] :
      desglose === "dow" ? [...DOW_KEYS] :
      ["Total"];
    return { rows, seriesKeys, isLineChart: period === "historico" };
  }

  // Determine periods (label + filter fn)
  const periods: { key: string; filter: (s: Session) => boolean; days: number }[] = [];
  const inMonth = (s: Session, y: number, m: number) => {
    const start = ymd(monthStart(y, m));
    const end = ymd(monthEnd(y, m));
    return s.fecha >= start && s.fecha <= end;
  };
  const monthsForPeriods = collectMonthList("sessions");
  for (const { y, m, key } of monthsForPeriods) {
    periods.push({ key, filter: (s: Session) => inMonth(s, y, m), days: daysInMonth(y, m) });
  }

  // ---------------------------------------------------------------
  // Casos especiales de comparación por meses
  // ---------------------------------------------------------------
  const MONTH_PALETTE = ["#0EA5E9", "#F97316", "#22C55E", "#A855F7"];
  const MONTH_PALETTE_NC = ["#075985", "#9A3412", "#166534", "#6B21A8"];

  // Cancelaciones · comparar meses
  if (metric === "cancelaciones" && period === "comparar") {
    const isCanc = (s: Session) => s.estado === "cancelada";
    if (desglose === "total") {
      // X = meses. Cada barra apila: cancelaciones contabilizadas + NC.
      const rowsC: SeriesRow[] = periods.map((p) => {
        const list = sessions.filter((s) => p.filter(s) && isCanc(s));
        return {
          bucket: p.key,
          Cancelada: list.filter((s) => !s.no_contabilizar).length,
          NC: list.filter((s) => !!s.no_contabilizar).length,
        };
      });
      return {
        rows: rowsC,
        seriesKeys: ["Cancelada", "NC"],
        isLineChart: false,
        stackMap: { Cancelada: "canc", NC: "canc" },
        seriesColors: { Cancelada: MONTH_PALETTE[0], NC: MONTH_PALETTE[1] },
      };
    }
    if (desglose === "turno") {
      // X = Mañana / Tarde. Una barra apilada (Cancelada + NC) por cada mes.
      const keys: string[] = [];
      const stackMap: Record<string, string> = {};
      const seriesColors: Record<string, string> = {};
      periods.forEach((p, i) => {
        const kc = `${p.key} · Cancelada`;
        const kn = `${p.key} · NC`;
        keys.push(kc, kn);
        stackMap[kc] = p.key;
        stackMap[kn] = p.key;
        seriesColors[kc] = MONTH_PALETTE[i % MONTH_PALETTE.length];
        seriesColors[kn] = MONTH_PALETTE_NC[i % MONTH_PALETTE_NC.length];
      });
      const rowsC: SeriesRow[] = (["Mañana", "Tarde"] as const).map((turno) => {
        const row: SeriesRow = { bucket: turno };
        for (const p of periods) {
          const list = sessions.filter(
            (s) => p.filter(s) && isCanc(s) &&
              ((hourOf(s.hora_inicio) < 14) === (turno === "Mañana")),
          );
          row[`${p.key} · Cancelada`] = list.filter((s) => !s.no_contabilizar).length;
          row[`${p.key} · NC`] = list.filter((s) => !!s.no_contabilizar).length;
        }
        return row;
      });
      return { rows: rowsC, seriesKeys: keys, isLineChart: false, stackMap, seriesColors };
    }
    if (desglose === "dow") {
      // X = días de la semana. Sólo totales (NC incluidas), una barra por mes.
      const DOWS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
      const idxLbl = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const seriesColors: Record<string, string> = {};
      periods.forEach((p, i) => { seriesColors[p.key] = MONTH_PALETTE[i % MONTH_PALETTE.length]; });
      const rowsC: SeriesRow[] = DOWS.map((d) => {
        const row: SeriesRow = { bucket: d };
        for (const p of periods) {
          row[p.key] = sessions.filter(
            (s) => p.filter(s) && isCanc(s) &&
              idxLbl[new Date(s.fecha + "T00:00:00").getDay()] === d,
          ).length;
        }
        return row;
      });
      const nz = rowsC.filter((r) => periods.some((p) => Number(r[p.key]) !== 0));
      return {
        rows: nz.length ? nz : rowsC,
        seriesKeys: periods.map((p) => p.key),
        isLineChart: false,
        seriesColors,
      };
    }
  }

  // Sesiones por entrenador · sin desglosar · comparar / histórico
  if (metric === "porEntrenador" && desglose === "total" && period !== "mesUnico") {
    const ids = selectedTrainerIds.length
      ? selectedTrainerIds
      : Array.from(trainerMap.keys());
    const initialsOf = (id: string) => trainerMap.get(id)?.iniciales ?? "—";
    const countFor = (id: string, p: { filter: (s: Session) => boolean }) =>
      sessions.filter((s) => p.filter(s) && countsAsTraining(s) && s.trainer_id === id).length;
    if (period === "comparar") {
      // X = entrenadores, una barra por mes.
      const seriesColors: Record<string, string> = {};
      periods.forEach((p, i) => { seriesColors[p.key] = MONTH_PALETTE[i % MONTH_PALETTE.length]; });
      const rowsT: SeriesRow[] = ids.map((id) => {
        const row: SeriesRow = { bucket: initialsOf(id) };
        for (const p of periods) row[p.key] = countFor(id, p);
        return row;
      });
      const nz = rowsT.filter((r) => periods.some((p) => Number(r[p.key]) !== 0));
      return {
        rows: nz.length ? nz : rowsT,
        seriesKeys: periods.map((p) => p.key),
        isLineChart: false,
        seriesColors,
      };
    }
    // histórico: X = meses, una serie (puntos/línea) por entrenador.
    const rowsT: SeriesRow[] = periods.map((p) => {
      const row: SeriesRow = { bucket: p.key };
      for (const id of ids) row[initialsOf(id)] = countFor(id, p);
      return row;
    });
    return { rows: rowsT, seriesKeys: ids.map(initialsOf), isLineChart: true };
  }

  // Buckets
  const bucketKeys: string[] = (() => {
    if (desglose === "franja") return HOURS.map((h) => `${String(h).padStart(2, "0")}:00`);
    if (desglose === "turno") return ["Mañana", "Tarde"];
    if (desglose === "dow") return ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    if (desglose === "total") return ["Total"];
    return knownTipos.map((t) => formatTipoBono(t));
  })();

  const bucketOf = (s: Session): string | null => {
    if (desglose === "total") return "Total";
    if (desglose === "franja") {
      const h = hourOf(s.hora_inicio);
      if (h < HORA_MIN || h > HORA_MAX) return null;
      return `${String(h).padStart(2, "0")}:00`;
    }
    if (desglose === "turno") return hourOf(s.hora_inicio) < 14 ? "Mañana" : "Tarde";
    if (desglose === "dow") {
      const d = new Date(s.fecha + "T00:00:00");
      const idx = d.getDay(); // 0=Dom
      return ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][idx];
    }
    // tipoSesion → tipo de bono del cliente
    const t = tipoOf(s);
    if (!t) return null;
    if (!knownTipos.includes(t as string)) return null;
    return formatTipoBono(t as string);
  };

  // For metric = porEntrenador we produce multiple series per period.
  // For simplicity when comparing periods too, we combine: seriesKey = `${periodKey} · ${breakdownKey}` if periods > 1.
  const isMultiSeries = metric === "porEntrenador";

  const seriesKeysSet = new Set<string>();
  const acc = new Map<string, Map<string, number>>(); // bucket -> series -> value
  const capacityByBucketPeriod = new Map<string, number>(); // for ocupacion: bucket|period -> capacity

  const trackUnclassified = metric === "sesiones" && desglose === "tipoSesion";
  const unclassified: UnclassifiedInfo = {
    count: 0,
    reasons: { sinCliente: 0, tipoPrueba: 0, otro: 0 },
    samples: [],
  };

  function addTo(bucket: string, series: string, val: number) {
    seriesKeysSet.add(series);
    if (!acc.has(bucket)) acc.set(bucket, new Map());
    const m = acc.get(bucket)!;
    m.set(series, (m.get(series) ?? 0) + val);
  }

  for (const p of periods) {
    const periodSessions = sessions.filter(p.filter);

    // Compute capacity per bucket for the period (for ocupacion metric).
    // Capacity is measured in "espacios·minuto" = openMinutes × SLOTS,
    // usando el horario real del centro (días festivos y horarios especiales).
    if (metric === "ocupacion") {
      const [py, pm] = periodMonthOfPeriod(p, monthA);
      const isMananaTurno = p.key.startsWith("Mañana ·");
      const isTardeTurno = p.key.startsWith("Tarde ·");
      const capByBucket = new Map<string, number>();
      const addCap = (b: string, min: number) => capByBucket.set(b, (capByBucket.get(b) ?? 0) + min * SLOTS);
      // El mes en curso no se extrapola: sólo cuentan los días transcurridos.
      const todayD = new Date();
      const isCurrentMonth = py === todayD.getFullYear() && pm === todayD.getMonth();
      const capEnd = isCurrentMonth
        ? new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate())
        : monthEnd(py, pm);
      for (const d of eachDate(monthStart(py, pm), capEnd)) {
        const dayOpen = openMinutesOfDay(d, horario, specialsMap);
        if (dayOpen === 0) continue;
        if (desglose === "franja") {
          for (const b of bucketKeys) {
            const h = Number(b.slice(0, 2));
            if (isMananaTurno && h >= 14) continue;
            if (isTardeTurno && h < 14) continue;
            addCap(b, openMinutesInHour(d, h, horario, specialsMap));
          }
        } else if (desglose === "turno") {
          let am = 0, pmMin = 0;
          for (let h = 0; h < 24; h++) {
            const om = openMinutesInHour(d, h, horario, specialsMap);
            if (h < 14) am += om; else pmMin += om;
          }
          if (!isTardeTurno) addCap("Mañana", am);
          if (!isMananaTurno) addCap("Tarde", pmMin);
        } else if (desglose === "dow") {
          const dowLabel = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][d.getDay()];
          let usable = dayOpen;
          if (isMananaTurno || isTardeTurno) {
            usable = 0;
            for (let h = 0; h < 24; h++) {
              const om = openMinutesInHour(d, h, horario, specialsMap);
              if (isMananaTurno && h < 14) usable += om;
              if (isTardeTurno && h >= 14) usable += om;
            }
          }
          addCap(dowLabel, usable);
        } else if (desglose === "tipoSesion") {
          let usable = dayOpen;
          if (isMananaTurno || isTardeTurno) {
            usable = 0;
            for (let h = 0; h < 24; h++) {
              const om = openMinutesInHour(d, h, horario, specialsMap);
              if (isMananaTurno && h < 14) usable += om;
              if (isTardeTurno && h >= 14) usable += om;
            }
          }
          for (const b of bucketKeys) addCap(b, usable);
        } else if (desglose === "total") {
          let usable = dayOpen;
          if (isMananaTurno || isTardeTurno) {
            usable = 0;
            for (let h = 0; h < 24; h++) {
              const om = openMinutesInHour(d, h, horario, specialsMap);
              if (isMananaTurno && h < 14) usable += om;
              if (isTardeTurno && h >= 14) usable += om;
            }
          }
          addCap("Total", usable);
        }
      }
      for (const [b, cap] of capByBucket) capacityByBucketPeriod.set(`${b}||${p.key}`, cap);
    }

    for (const s of periodSessions) {
      const b = bucketOf(s);
      if (!b) {
        if (trackUnclassified && countsAsTraining(s)) {
          unclassified.count += 1;
          let reason: string;
          if (!s.client_id && !s.group_id) {
            unclassified.reasons.sinCliente += 1;
            reason = "Sin cliente ni grupo asignado";
          } else {
            unclassified.reasons.otro += 1;
            reason = "Cliente sin bono activo válido";
          }
          if (unclassified.samples.length < 20) {
            unclassified.samples.push({ id: s.id, fecha: s.fecha, hora: s.hora_inicio, reason });
          }
        }
        continue;
      }

      if (metric === "sesiones") {
        if (!countsAsTraining(s)) continue;
        addTo(b, p.key, 1);
      } else if (metric === "cancelaciones") {
        if (s.estado !== "cancelada") continue;
        const key = s.no_contabilizar ? `${p.key} · NC` : `${p.key} · Cancelada`;
        addTo(b, key, 1);
      } else if (metric === "ocupacion") {
        if (!countsAsTraining(s)) continue;
        addTo(b, p.key, durMin(s.hora_inicio, s.hora_fin) * spacesFor(s.tipo));
      } else if (metric === "porEntrenador") {
        if (!countsAsTraining(s)) continue;
        if (selectedTrainerIds.length === 0) {
          // Sin selección → total global neutro en una sola serie "Total".
          const series = periods.length > 1 ? `${p.key} · Total` : "Total";
          addTo(b, series, 1);
        } else {
          if (!s.trainer_id || !selectedTrainerIds.includes(s.trainer_id)) continue;
          const tname = trainerMap.get(s.trainer_id)?.iniciales ?? "—";
          const series = periods.length > 1 ? `${p.key} · ${tname}` : tname;
          addTo(b, series, 1);
        }
      }
    }
  }

  // Convert to percentages for ocupacion
  if (metric === "ocupacion") {
    for (const [b, m] of acc) {
      for (const [s, v] of m) {
        const cap = capacityByBucketPeriod.get(`${b}||${s}`) ?? 0;
        m.set(s, cap > 0 ? Math.round((v / cap) * 1000) / 10 : 0);
      }
    }
  }

  const seriesKeys = Array.from(seriesKeysSet);
  const rows: SeriesRow[] = bucketKeys.map((b) => {
    const row: SeriesRow = { bucket: b };
    for (const k of seriesKeys) row[k] = Number(acc.get(b)?.get(k) ?? 0);
    return row;
  });

  // Para comparar/histórico: transponer para que X = meses y series = slots de desglose.
  if (period !== "mesUnico") {
    // Comparar meses con desgloses categóricos ordenados (franja, día de la
    // semana, turno): X = buckets del desglose y cada mes es una serie propia.
    if (
      period === "comparar" &&
      (desglose === "franja" || desglose === "dow" || desglose === "turno" || desglose === "tipoSesion") &&
      metric !== "porEntrenador"
    ) {
      const monthSeries = periods.map((p) => p.key).filter((k) => seriesKeys.includes(k));
      const finalSeriesM = monthSeries.length ? monthSeries : seriesKeys;
      const keepAll = desglose === "franja";
      const rowsM = keepAll
        ? rows
        : (rows.filter((r) => finalSeriesM.some((k) => Number(r[k]) !== 0)).length
            ? rows.filter((r) => finalSeriesM.some((k) => Number(r[k]) !== 0))
            : rows);
      return {
        rows: rowsM,
        seriesKeys: finalSeriesM,
        isLineChart: desglose === "franja" || desglose === "dow",
        unclassified: trackUnclassified ? unclassified : undefined,
      };
    }
    const monthOrder = periods.map((p) => p.key);
    const slotOrder = bucketKeys.filter((b) => seriesKeys.some((k) => k === b || k.endsWith(` · ${b}`)) || acc.get(b));
    // Recolectar todas las "series" reales: bucketKeys que aparecen como bucket.
    const usedSlots = bucketKeys.filter((b) => (acc.get(b)?.size ?? 0) > 0);
    const slots = usedSlots.length ? usedSlots : bucketKeys;
    const trows: SeriesRow[] = monthOrder.map((mk) => {
      const row: SeriesRow = { bucket: mk };
      for (const slot of slots) {
        // Serie puede llamarse tal cual mk (caso general) o `${mk} · X` (porTipo/porEntrenador con multiples periodos)
        let val = Number(acc.get(slot)?.get(mk) ?? 0);
        if (!val) {
          // sumar variantes con prefijo del mes
          let sum = 0;
          for (const [k, v] of (acc.get(slot) ?? new Map())) {
            if (typeof k === "string" && k.startsWith(`${mk} · `)) sum += Number(v);
          }
          val = sum;
        }
        row[slot] = val;
      }
      return row;
    });
    // filtrar meses todo cero para evitar ruido en histórico
    const nzT = trows.filter((r) => slots.some((k) => Number(r[k]) !== 0));
    void slotOrder;
    // Histórico (meses cronológicos consecutivos) → línea con puntos.
    // Comparar meses (selección puntual en paralelo) → barras.
    return { rows: nzT.length ? nzT : trows, seriesKeys: slots, isLineChart: period === "historico", unclassified: trackUnclassified ? unclassified : undefined };
  }

  // filter rows with all zero (for tipoSesion when nothing exists)
  const nonZero = rows.filter((r) => seriesKeys.some((k) => Number(r[k]) !== 0));

  // En mesUnico ninguna vista es puramente lineal: franja/dow se dibujan como
  // barras con línea de puntos superpuesta; el resto son barras.
  // Franja horaria: siempre líneas con puntos conectados.
  const isLineChart = desglose === "franja";
  // Para franja horaria mantenemos TODAS las horas (aunque valgan 0) para que
  // la línea sea continua de izquierda a derecha sin huecos.
  const finalRows = isLineChart ? rows : (nonZero.length ? nonZero : rows);
  const finalSeries = seriesKeys.length ? seriesKeys : ["value"];
  return { rows: finalRows, seriesKeys: finalSeries, isLineChart, unclassified: trackUnclassified ? unclassified : undefined };

  // suppress unused
  void isMultiSeries;
}

function periodMonthOfPeriod(_p: { key: string }, monthA: string): [number, number] {
  // Parse from period key: "MMM YYYY"
  const parts = _p.key.split(" ");
  const lastPart = parts[parts.length - 1];
  const monthPart = parts[parts.length - 2];
  const y = Number(lastPart);
  const m = MES_LABEL.indexOf(monthPart);
  if (!isNaN(y) && m >= 0) return [y, m];
  // fallback
  const [ya, ma] = monthA.split("-").map(Number);
  return [ya, ma - 1];
}

