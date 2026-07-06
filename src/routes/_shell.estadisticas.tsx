import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Session, type Trainer, type Client, type ClientBono, type BonoCatalogo, type BonoTipo } from "@/lib/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend as RLegend, LineChart, Line, ComposedChart,
} from "recharts";
import {
  useCenterConfig, openMinutesOfDay, openMinutesInHour, eachDate,
  type HorarioBase, type SpecialDay,
} from "@/lib/center-schedule";

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
  const { horario, specialsMap } = useCenterConfig();
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">Estadísticas</h1>
        <p className="text-sm text-muted-foreground">KPIs del mes en curso y comparaciones flexibles.</p>
      </div>

      <KpiPanel sessions={sessions} clients={clients} events={events} horario={horario} specialsMap={specialsMap} />

      <ComparisonModule sessions={sessions} trainers={trainers} events={events} horario={horario} specialsMap={specialsMap} clientTipoMap={clientTipoMap} />
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
function KpiPanel({ sessions, clients, events, horario, specialsMap }: {
  sessions: Session[]; clients: Client[]; events: ClientEvent[];
  horario: HorarioBase; specialsMap: Map<string, SpecialDay>;
}) {
  void clients;
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [ys, ms] = ym.split("-").map(Number);
  const y = ys;
  const m = ms - 1;
  const start = ymd(monthStart(y, m));
  const end = ymd(monthEnd(y, m));

  // Rango histórico ilimitado: desde el año más antiguo con datos (o hace 5 años) hasta hoy.
  const earliestYear = useMemo(() => {
    let min = now.getFullYear();
    for (const s of sessions) {
      if (s.fecha) { const yy = Number(s.fecha.slice(0, 4)); if (Number.isFinite(yy) && yy < min) min = yy; }
    }
    for (const e of events) {
      if (e.fecha) { const yy = Number(e.fecha.slice(0, 4)); if (Number.isFinite(yy) && yy < min) min = yy; }
    }
    return Math.min(min, now.getFullYear() - 5);
  }, [sessions, events, now]);

  const monthSessions = sessions.filter((s) => s.fecha >= start && s.fecha <= end);
  const realizadas = monthSessions.filter((s) => s.estado === "realizada");
  const mananas = realizadas.filter((s) => hourOf(s.hora_inicio) < 14).length;
  const tardes = realizadas.length - mananas;

  // Ocupación media (minutos ocupados / capacidad real del centro).
  const occupiedMin = realizadas.reduce(
    (acc, s) => acc + durMin(s.hora_inicio, s.hora_fin) * spacesFor(s.tipo),
    0,
  );
  let capacityMin = 0;
  for (const d of eachDate(monthStart(y, m), monthEnd(y, m))) {
    capacityMin += openMinutesOfDay(d, horario, specialsMap) * SLOTS;
  }
  const ocupacionMedia = capacityMin > 0 ? (occupiedMin / capacityMin) * 100 : 0;

  const altasMes = events.filter((e) => e.tipo === "alta" && e.fecha >= start && e.fecha <= end).length;
  const bajasMes = events.filter((e) => e.tipo === "baja" && e.fecha >= start && e.fecha <= end).length;

  const kpis = [
    {
      label: "Entrenamientos totales",
      value: String(realizadas.length),
      hint: `${mananas} mañana · ${tardes} tarde`,
    },
    {
      label: "Ocupación media del centro",
      value: `${ocupacionMedia.toFixed(1)}%`,
      hint: `${Math.round(occupiedMin)}/${Math.round(capacityMin)} min`,
    },
    { label: "Altas del mes", value: String(altasMes), hint: `Nuevos clientes en ${MES_LABEL[m]} ${y}` },
    { label: "Bajas del mes", value: String(bajasMes), hint: `Clientes que pasaron a inactivo` },
  ];

  return (
    <div className="space-y-3">
      <KpiMonthSelector value={ym} onChange={setYm} earliestYear={earliestYear} now={now} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-display font-semibold">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function KpiMonthSelector({ value, onChange, earliestYear, now }: {
  value: string; onChange: (v: string) => void; earliestYear: number; now: Date;
}) {
  const [ys, ms] = value.split("-");
  const y = Number(ys); const m = Number(ms);
  const curY = now.getFullYear(); const curM = now.getMonth() + 1;
  const years: number[] = [];
  for (let yy = curY; yy >= earliestYear; yy--) years.push(yy);
  const maxMonth = y === curY ? curM : 12;
  const months: number[] = [];
  for (let mm = 1; mm <= maxMonth; mm++) months.push(mm);
  const setYear = (yy: string) => {
    const ny = Number(yy);
    const nMax = ny === curY ? curM : 12;
    const nm = Math.min(m, nMax);
    onChange(`${yy}-${String(nm).padStart(2, "0")}`);
  };
  const setMonth = (mm: string) => onChange(`${ys}-${mm}`);
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Mes de los KPIs</Label>
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
        variant="outline" size="sm"
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
type Metric = "ocupacion" | "sesiones" | "cancelaciones" | "porTipo" | "porEntrenador" | "facturacion" | "altasBajas";
type Desglose = "franja" | "turno" | "dow" | "tipoSesion" | "total";
type PeriodMode = "mesUnico" | "dosMeses" | "anoVsAno" | "mananaVsTarde" | "historico";

const METRIC_LABEL: Record<Metric, string> = {
  ocupacion: "Ocupación del centro (%)",
  sesiones: "Nº sesiones",
  cancelaciones: "Cancelaciones (incl. NC)",
  porTipo: "Sesiones por tipo",
  porEntrenador: "Sesiones por entrenador",
  facturacion: "Facturación estimada (€)",
  altasBajas: "Altas y bajas por mes",
};
const DESGLOSE_LABEL: Record<Desglose, string> = {
  franja: "Franja horaria (6:45–22:00)",
  turno: "Turno (mañana / tarde)",
  dow: "Día de la semana",
  tipoSesion: "Tipo de sesión",
  total: "Total del periodo",
};
const PERIOD_LABEL: Record<PeriodMode, string> = {
  mesUnico: "Un mes concreto",
  dosMeses: "Comparar dos meses",
  anoVsAno: "Mismo mes en años distintos",
  mananaVsTarde: "Mañanas vs Tardes (mismo periodo)",
  historico: "Histórico (todos los meses)",
};

// Reglas de combinaciones válidas (métrica, desglose, periodo).
const NON_MVT_PERIODS: PeriodMode[] = ["mesUnico", "dosMeses", "anoVsAno", "historico"];
function isValidCombo(metric: Metric, desglose: Desglose, period: PeriodMode): boolean {
  if (metric === "altasBajas") {
    // Sin desglose real; solo periodos que agrupan por mes.
    return NON_MVT_PERIODS.includes(period);
  }
  // "Total del periodo" es válido para cualquier métrica y periodo.
  if (desglose === "total") return true;
  if (metric === "ocupacion" || metric === "sesiones") {
    if (desglose === "franja" || desglose === "dow") return NON_MVT_PERIODS.includes(period);
    return true; // turno / tipoSesion cualquier periodo
  }
  if (metric === "cancelaciones") {
    if (desglose === "franja") return period !== "mananaVsTarde";
    return true;
  }
  if (metric === "porTipo") return true;
  if (metric === "porEntrenador") {
    if (desglose === "franja") return false; // ilegible con 13 entrenadores
    if (desglose === "dow") return period !== "mananaVsTarde";
    return true;
  }
  if (metric === "facturacion") {
    if (desglose === "franja") return false;
    // mañana vs tarde es en sí mismo el desglose → no combinable con otro
    if (period === "mananaVsTarde") return false;
    return true;
  }
  return true;
}
function isDesgloseAllowedForMetric(metric: Metric, desglose: Desglose): boolean {
  if (metric === "altasBajas") return false;
  if (desglose === "total") return true;
  if (metric === "porEntrenador" && desglose === "franja") return false;
  if (metric === "facturacion" && desglose === "franja") return false;
  return true;
}
function isPeriodAllowedForMetric(metric: Metric, period: PeriodMode): boolean {
  if (metric === "altasBajas") return NON_MVT_PERIODS.includes(period);
  if (metric === "facturacion" && period === "mananaVsTarde") return false;
  return true;
}
function firstValidDesglose(metric: Metric, period: PeriodMode): Desglose {
  const order: Desglose[] = ["turno", "tipoSesion", "dow", "franja"];
  for (const d of order) if (isValidCombo(metric, d, period)) return d;
  return "turno";
}
function firstValidPeriod(metric: Metric, desglose: Desglose): PeriodMode {
  const order: PeriodMode[] = ["mesUnico", "dosMeses", "anoVsAno", "historico", "mananaVsTarde"];
  for (const p of order) if (isValidCombo(metric, desglose, p)) return p;
  return "mesUnico";
}

function ComparisonModule({ sessions, trainers, events, horario, specialsMap, clientTipoMap }: {
  sessions: Session[]; trainers: Trainer[]; events: ClientEvent[];
  horario: HorarioBase; specialsMap: Map<string, SpecialDay>;
  clientTipoMap: Map<string, BonoTipo>;
}) {
  const [metric, setMetric] = useState<Metric>("sesiones");
  const [desglose, setDesglose] = useState<Desglose>("franja");
  const [period, setPeriod] = useState<PeriodMode>("mesUnico");

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
  const [monthA, setMonthA] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [monthB, setMonthB] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [yearA, setYearA] = useState(String(now.getFullYear()));
  const [yearB, setYearB] = useState(String(now.getFullYear() - 1));
  const [monthOfYear, setMonthOfYear] = useState(String(now.getMonth() + 1).padStart(2, "0"));

  const trainerMap = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);

  // Años disponibles: desde el año más antiguo con datos (o hace 5 años) hasta el año actual.
  // Todos los meses son seleccionables (limitados al mes actual en el año en curso).
  const availableYears = useMemo(() => {
    const nowD = new Date();
    const curY = nowD.getFullYear();
    let min = curY;
    const scan = (d: string | null | undefined) => {
      if (!d) return;
      const yy = Number(d.slice(0, 4));
      if (Number.isFinite(yy) && yy < min) min = yy;
    };
    for (const s of sessions) scan(s.fecha);
    for (const e of events) scan(e.fecha);
    min = Math.min(min, curY - 5);
    const out: string[] = [];
    for (let y = curY; y >= min; y--) out.push(String(y));
    return out;
  }, [sessions, events]);

  const monthsForYear = (yStr: string): number[] => {
    const nowD = new Date();
    const curY = nowD.getFullYear();
    const y = Number(yStr);
    const max = y === curY ? nowD.getMonth() : 11;
    const out: number[] = [];
    for (let i = 0; i <= max; i++) out.push(i);
    return out;
  };

  // Build series: [{ bucket, seriesA, seriesB?, ... }]
  const { rows, seriesKeys, isLineChart } = useMemo(
    () => buildSeries({ sessions, events, metric, desglose, period, monthA, monthB, yearA, yearB, monthOfYear, trainerMap, horario, specialsMap, clientTipoMap }),
    [sessions, events, metric, desglose, period, monthA, monthB, yearA, yearB, monthOfYear, trainerMap, horario, specialsMap, clientTipoMap],
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

  const palette = ["hsl(var(--primary))", "hsl(24 90% 55%)", "hsl(150 60% 45%)", "hsl(280 60% 55%)", "hsl(340 70% 55%)", "hsl(200 70% 50%)"];
  const colorForSeries = (name: string, idx: number): string => {
    const lower = name.toLowerCase();
    if (lower.startsWith("alta")) return "hsl(150 65% 42%)";
    if (lower.startsWith("baja")) return "hsl(0 72% 55%)";
    return palette[idx % palette.length];
  };

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
            disabled={metric === "altasBajas"}
          >
            <SelectTrigger><SelectValue placeholder={metric === "altasBajas" ? "No aplica" : undefined} /></SelectTrigger>
            <SelectContent>
              {(Object.entries(DESGLOSE_LABEL) as [Desglose, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k} disabled={!isValidCombo(metric, k, period)}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Periodo</Label>
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(PERIOD_LABEL) as [PeriodMode, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k} disabled={!isValidCombo(metric, desglose, k)}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        {period === "mesUnico" && (
          <MonthYearPicker label="Mes" value={monthA} onChange={setMonthA} years={availableYears} monthsForYear={monthsForYear} />
        )}
        {period === "dosMeses" && (
          <>
            <MonthYearPicker label="Mes A" value={monthA} onChange={setMonthA} years={availableYears} monthsForYear={monthsForYear} />
            <MonthYearPicker label="Mes B" value={monthB} onChange={setMonthB} years={availableYears} monthsForYear={monthsForYear} />
          </>
        )}
        {period === "anoVsAno" && (
          <>
            <div className="space-y-1.5">
              <Label>Mes</Label>
              <Select value={monthOfYear} onValueChange={setMonthOfYear}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MES_FULL.map((n, i) => <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <YearSelect label="Año A" value={yearA} onChange={setYearA} years={availableYears} />
            <YearSelect label="Año B" value={yearB} onChange={setYearB} years={availableYears} />
          </>
        )}
        {period === "mananaVsTarde" && (
          <MonthYearPicker label="Mes" value={monthA} onChange={setMonthA} years={availableYears} monthsForYear={monthsForYear} />
        )}
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="h-[420px]">
          {rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sin datos para esta combinación.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {isLineChart ? (
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <RLegend />
                  {seriesKeys.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={colorForSeries(k, i)} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <RLegend />
                  {seriesKeys.map((k, i) => (
                    <Bar key={k} dataKey={k} fill={colorForSeries(k, i)} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
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

// Añade líneas de tendencia (regresión lineal simple) a cada serie
// cuando el eje horizontal representa una progresión temporal con 3+ puntos.
function addTrendLines(
  rows: SeriesRow[],
  seriesKeys: string[],
  isTimeAxis: boolean,
): string[] {
  if (!isTimeAxis || rows.length < 3 || seriesKeys.length === 0) return [];
  const trendKeys: string[] = [];
  const single = seriesKeys.length === 1;
  for (const k of seriesKeys) {
    const n = rows.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const y = Number(rows[i][k]) || 0;
      sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) continue;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const tk = single ? "Tendencia" : `Tendencia · ${k}`;
    trendKeys.push(tk);
    for (let i = 0; i < n; i++) {
      rows[i][tk] = Math.round((slope * i + intercept) * 100) / 100;
    }
  }
  return trendKeys;
}

function buildSeries(args: {
  sessions: Session[]; events: ClientEvent[]; metric: Metric; desglose: Desglose; period: PeriodMode;
  monthA: string; monthB: string; yearA: string; yearB: string; monthOfYear: string;
  trainerMap: Map<string, Trainer>;
  horario: HorarioBase; specialsMap: Map<string, SpecialDay>;
  clientTipoMap: Map<string, BonoTipo>;
}): { rows: SeriesRow[]; seriesKeys: string[]; trendKeys: string[]; isLineChart: boolean } {
  const { sessions, events, metric, desglose, period, monthA, monthB, yearA, yearB, monthOfYear, trainerMap, horario, specialsMap, clientTipoMap } = args;
  const tipoOf = (s: Session): Session["tipo"] => {
    if (s.client_id) {
      const t = clientTipoMap.get(s.client_id);
      if (t) return t as Session["tipo"];
    }
    return s.tipo;
  };

  // -------- Altas / Bajas metric (bucketed by month, independent of desglose) --------
  if (metric === "altasBajas") {
    const parseYm = (ym: string) => { const [y, m] = ym.split("-").map(Number); return { y, m: m - 1 }; };
    const monthLbl = (y: number, m: number) => `${MES_LABEL[m]} ${y}`;
    const buckets: { key: string; y: number; m: number }[] = [];
    if (period === "mesUnico") {
      const { y, m } = parseYm(monthA);
      buckets.push({ key: monthLbl(y, m), y, m });
    } else if (period === "dosMeses") {
      const a = parseYm(monthA); const b = parseYm(monthB);
      buckets.push({ key: monthLbl(a.y, a.m), y: a.y, m: a.m });
      buckets.push({ key: monthLbl(b.y, b.m), y: b.y, m: b.m });
    } else if (period === "anoVsAno") {
      const m = Number(monthOfYear) - 1;
      const yA = Number(yearA); const yB = Number(yearB);
      buckets.push({ key: monthLbl(yA, m), y: yA, m });
      buckets.push({ key: monthLbl(yB, m), y: yB, m });
    } else if (period === "historico") {
      const all = events.map((e) => e.fecha).sort();
      if (all.length === 0) {
        const now = new Date();
        buckets.push({ key: monthLbl(now.getFullYear(), now.getMonth()), y: now.getFullYear(), m: now.getMonth() });
      } else {
        const first = new Date(all[0] + "T00:00:00");
        const now = new Date();
        const cur = new Date(first.getFullYear(), first.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 1);
        while (cur.getTime() <= end.getTime()) {
          buckets.push({ key: monthLbl(cur.getFullYear(), cur.getMonth()), y: cur.getFullYear(), m: cur.getMonth() });
          cur.setMonth(cur.getMonth() + 1);
        }
      }
    } else {
      const { y, m } = parseYm(monthA);
      buckets.push({ key: monthLbl(y, m), y, m });
    }
    const rows: SeriesRow[] = buckets.map(({ key, y, m }) => {
      const s = ymd(monthStart(y, m));
      const e = ymd(monthEnd(y, m));
      const altas = events.filter((ev) => ev.tipo === "alta" && ev.fecha >= s && ev.fecha <= e).length;
      const bajas = events.filter((ev) => ev.tipo === "baja" && ev.fecha >= s && ev.fecha <= e).length;
      return { bucket: key, Altas: altas, Bajas: bajas };
    });
    const seriesKeys = ["Altas", "Bajas"];
    const isTimeAxis = period === "historico" && rows.length >= 3;
    const trendKeys = addTrendLines(rows, seriesKeys, isTimeAxis);
    return { rows, seriesKeys, trendKeys, isLineChart: false };
  }

  // -------- Facturación estimada (por turno y total, precios fijos) --------
  if (metric === "facturacion") {
    const PRECIO = { individual: 36, pareja: 49, grupal: 17 } as const;
    const parseYm = (ym: string) => { const [y, m] = ym.split("-").map(Number); return { y, m: m - 1 }; };
    const monthLbl = (y: number, m: number) => `${MES_LABEL[m]} ${y}`;
    const periodsFact: { key: string; filter: (s: Session) => boolean }[] = [];
    const inRange = (s: Session, y: number, m: number) =>
      s.fecha >= ymd(monthStart(y, m)) && s.fecha <= ymd(monthEnd(y, m));
    if (period === "mesUnico") {
      const { y, m } = parseYm(monthA);
      periodsFact.push({ key: monthLbl(y, m), filter: (s) => inRange(s, y, m) });
    } else if (period === "dosMeses") {
      const a = parseYm(monthA); const b = parseYm(monthB);
      periodsFact.push({ key: monthLbl(a.y, a.m), filter: (s) => inRange(s, a.y, a.m) });
      periodsFact.push({ key: monthLbl(b.y, b.m), filter: (s) => inRange(s, b.y, b.m) });
    } else if (period === "anoVsAno") {
      const m = Number(monthOfYear) - 1;
      const yA = Number(yearA); const yB = Number(yearB);
      periodsFact.push({ key: monthLbl(yA, m), filter: (s) => inRange(s, yA, m) });
      periodsFact.push({ key: monthLbl(yB, m), filter: (s) => inRange(s, yB, m) });
    } else if (period === "mananaVsTarde") {
      const { y, m } = parseYm(monthA);
      periodsFact.push({ key: monthLbl(y, m), filter: (s) => inRange(s, y, m) });
    } else if (period === "historico") {
      periodsFact.push({ key: "Histórico", filter: () => true });
    }
    const amountOf = (s: Session): number => {
      if (s.estado !== "realizada") return 0;
      const t = tipoOf(s);
      if (t === "individual") return PRECIO.individual;
      if (t === "pareja") return PRECIO.pareja;
      if (t === "grupal") return PRECIO.grupal;
      return 0;
    };
    // Desglose "Total del periodo": una única barra por periodo con la suma total.
    if (desglose === "total") {
      const rows: SeriesRow[] = [{ bucket: "Total" }];
      for (const p of periodsFact) {
        let sum = 0;
        for (const s of sessions.filter(p.filter)) sum += amountOf(s);
        rows[0][p.key] = Math.round(sum);
      }
      return { rows, seriesKeys: periodsFact.map((p) => p.key), trendKeys: [], isLineChart: false };
    }
    const buckets = ["Mañana", "Tarde", "Total"];
    const rows: SeriesRow[] = buckets.map((b) => ({ bucket: b }));
    for (const p of periodsFact) {
      let mAm = 0, mPm = 0;
      for (const s of sessions.filter(p.filter)) {
        const amt = amountOf(s);
        if (amt === 0) continue;
        if (hourOf(s.hora_inicio) < 14) mAm += amt; else mPm += amt;
      }
      rows[0][p.key] = Math.round(mAm);
      rows[1][p.key] = Math.round(mPm);
      rows[2][p.key] = Math.round(mAm + mPm);
    }
    return { rows, seriesKeys: periodsFact.map((p) => p.key), trendKeys: [], isLineChart: false };
  }

  // Determine periods (label + filter fn)
  const periods: { key: string; filter: (s: Session) => boolean; days: number }[] = [];
  const parseYm = (ym: string) => { const [y, m] = ym.split("-").map(Number); return { y, m: m - 1 }; };
  const inMonth = (s: Session, y: number, m: number) => {
    const start = ymd(monthStart(y, m));
    const end = ymd(monthEnd(y, m));
    return s.fecha >= start && s.fecha <= end;
  };
  const monthLabel = (y: number, m: number) => `${MES_LABEL[m]} ${y}`;

  if (period === "mesUnico") {
    const { y, m } = parseYm(monthA);
    periods.push({ key: monthLabel(y, m), filter: (s) => inMonth(s, y, m), days: daysInMonth(y, m) });
  } else if (period === "dosMeses") {
    const a = parseYm(monthA); const b = parseYm(monthB);
    periods.push({ key: monthLabel(a.y, a.m), filter: (s) => inMonth(s, a.y, a.m), days: daysInMonth(a.y, a.m) });
    periods.push({ key: monthLabel(b.y, b.m), filter: (s) => inMonth(s, b.y, b.m), days: daysInMonth(b.y, b.m) });
  } else if (period === "anoVsAno") {
    const m = Number(monthOfYear) - 1;
    const yA = Number(yearA); const yB = Number(yearB);
    periods.push({ key: monthLabel(yA, m), filter: (s) => inMonth(s, yA, m), days: daysInMonth(yA, m) });
    periods.push({ key: monthLabel(yB, m), filter: (s) => inMonth(s, yB, m), days: daysInMonth(yB, m) });
  } else if (period === "mananaVsTarde") {
    const { y, m } = parseYm(monthA);
    const base = (s: Session) => inMonth(s, y, m);
    periods.push({ key: `Mañana · ${monthLabel(y, m)}`, filter: (s) => base(s) && hourOf(s.hora_inicio) < 14, days: daysInMonth(y, m) });
    periods.push({ key: `Tarde · ${monthLabel(y, m)}`, filter: (s) => base(s) && hourOf(s.hora_inicio) >= 14, days: daysInMonth(y, m) });
  } else if (period === "historico") {
    // Histórico: un único "periodo" que incluye todas las sesiones.
    periods.push({ key: "Histórico", filter: () => true, days: 0 });
  }

  // Buckets
  const bucketKeys: string[] = (() => {
    if (desglose === "franja") return HOURS.map((h) => `${String(h).padStart(2, "0")}:00`);
    if (desglose === "turno") return ["Mañana", "Tarde"];
    if (desglose === "dow") return ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    if (desglose === "total") return ["Total"];
    return ["Individual", "Pareja", "Grupal", "Prueba"];
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
    // tipoSesion
    switch (s.tipo) {
      case "individual": return "Individual";
      case "pareja": return "Pareja";
      case "grupal": return "Grupal";
      case "prueba": return "Prueba";
      default: return null;
    }
  };

  // For metric = porTipo / porEntrenador we produce multiple series per period.
  // For simplicity when comparing periods too, we combine: seriesKey = `${periodKey} · ${breakdownKey}` if periods > 1.
  const isMultiSeries = metric === "porTipo" || metric === "porEntrenador";

  const seriesKeysSet = new Set<string>();
  const acc = new Map<string, Map<string, number>>(); // bucket -> series -> value
  const capacityByBucketPeriod = new Map<string, number>(); // for ocupacion: bucket|period -> capacity

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
      const [py, pm] = periodMonthOfPeriod(p, monthA, monthB, monthOfYear, yearA, yearB);
      const isMananaTurno = p.key.startsWith("Mañana ·");
      const isTardeTurno = p.key.startsWith("Tarde ·");
      const capByBucket = new Map<string, number>();
      const addCap = (b: string, min: number) => capByBucket.set(b, (capByBucket.get(b) ?? 0) + min * SLOTS);
      for (const d of eachDate(monthStart(py, pm), monthEnd(py, pm))) {
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
      if (!b) continue;

      if (metric === "sesiones") {
        if (s.estado !== "realizada") continue;
        addTo(b, p.key, 1);
      } else if (metric === "cancelaciones") {
        if (s.estado !== "cancelada") continue;
        const key = s.no_contabilizar ? `${p.key} · NC` : `${p.key} · Cancelada`;
        addTo(b, key, 1);
      } else if (metric === "ocupacion") {
        if (s.estado !== "realizada") continue;
        addTo(b, p.key, durMin(s.hora_inicio, s.hora_fin) * spacesFor(s.tipo));
      } else if (metric === "porTipo") {
        if (s.estado !== "realizada") continue;
        const t = s.tipo ?? "otro";
        const label = t.charAt(0).toUpperCase() + t.slice(1);
        const series = periods.length > 1 ? `${p.key} · ${label}` : label;
        addTo(b, series, 1);
      } else if (metric === "porEntrenador") {
        if (s.estado !== "realizada") continue;
        const tname = s.trainer_id ? (trainerMap.get(s.trainer_id)?.iniciales ?? "—") : "—";
        const series = periods.length > 1 ? `${p.key} · ${tname}` : tname;
        addTo(b, series, 1);
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
    for (const k of seriesKeys) row[k] = acc.get(b)?.get(k) ?? 0;
    return row;
  });

  // filter rows with all zero (for tipoSesion when nothing exists)
  const nonZero = rows.filter((r) => seriesKeys.some((k) => Number(r[k]) !== 0));

  const isLineChart = desglose === "franja"; // evolución horaria
  return { rows: nonZero.length ? nonZero : rows, seriesKeys: seriesKeys.length ? seriesKeys : ["value"], isLineChart };

  // suppress unused
  void isMultiSeries;
}

function periodMonthOfPeriod(_p: { key: string }, monthA: string, monthB: string, monthOfYear: string, yearA: string, yearB: string): [number, number] {
  // Parse from period key: "MMM YYYY"
  const parts = _p.key.split(" ");
  const lastPart = parts[parts.length - 1];
  const monthPart = parts[parts.length - 2];
  const y = Number(lastPart);
  const m = MES_LABEL.indexOf(monthPart);
  if (!isNaN(y) && m >= 0) return [y, m];
  // fallback
  const [ya, ma] = monthA.split("-").map(Number);
  void monthB; void monthOfYear; void yearA; void yearB;
  return [ya, ma - 1];
}

