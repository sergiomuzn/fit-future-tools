import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Session, type Trainer, type Client } from "@/lib/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Download, ArrowUpDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend as RLegend, LineChart, Line,
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

  return (
    <div className="p-6 space-y-6 overflow-auto h-screen">
      <div>
        <h1 className="text-2xl font-display font-semibold">Estadísticas</h1>
        <p className="text-sm text-muted-foreground">KPIs del mes en curso y comparaciones flexibles.</p>
      </div>

      <KpiPanel sessions={sessions} clients={clients} events={events} horario={horario} specialsMap={specialsMap} />

      <Tabs defaultValue="comparacion">
        <TabsList>
          <TabsTrigger value="comparacion">Comparación</TabsTrigger>
          <TabsTrigger value="cancelaciones">Cancelaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="comparacion" className="pt-4">
          <ComparisonModule sessions={sessions} trainers={trainers} events={events} horario={horario} specialsMap={specialsMap} />
        </TabsContent>
        <TabsContent value="cancelaciones" className="pt-4">
          <CancellationsPanel sessions={sessions} clients={clients} />
        </TabsContent>
      </Tabs>
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
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = ymd(monthStart(y, m));
  const end = ymd(monthEnd(y, m));

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

  const activos = clients.filter((c) => c.activo).length;
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
    { label: "Clientes activos", value: String(activos), hint: `Total en ${MES_LABEL[m]} ${y}` },
    { label: "Altas este mes", value: String(altasMes), hint: `Nuevos clientes en ${MES_LABEL[m]}` },
    { label: "Bajas este mes", value: String(bajasMes), hint: `Clientes que pasaron a inactivo` },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
  );
}

// ============================================================
// Comparison Module
// ============================================================
type Metric = "ocupacion" | "sesiones" | "cancelaciones" | "porTipo" | "porEntrenador";
type Desglose = "franja" | "turno" | "dow" | "tipoSesion";
type PeriodMode = "mesUnico" | "dosMeses" | "anoVsAno" | "mananaVsTarde";

const METRIC_LABEL: Record<Metric, string> = {
  ocupacion: "Ocupación del centro (%)",
  sesiones: "Nº sesiones",
  cancelaciones: "Cancelaciones (incl. NC)",
  porTipo: "Sesiones por tipo",
  porEntrenador: "Sesiones por entrenador",
};
const DESGLOSE_LABEL: Record<Desglose, string> = {
  franja: "Franja horaria (7:00–22:00)",
  turno: "Turno (mañana / tarde)",
  dow: "Día de la semana",
  tipoSesion: "Tipo de sesión",
};
const PERIOD_LABEL: Record<PeriodMode, string> = {
  mesUnico: "Un mes concreto",
  dosMeses: "Comparar dos meses",
  anoVsAno: "Mismo mes en años distintos",
  mananaVsTarde: "Mañanas vs Tardes (mismo periodo)",
};

function ComparisonModule({ sessions, trainers, horario, specialsMap }: {
  sessions: Session[]; trainers: Trainer[];
  horario: HorarioBase; specialsMap: Map<string, SpecialDay>;
}) {
  const [metric, setMetric] = useState<Metric>("sesiones");
  const [desglose, setDesglose] = useState<Desglose>("franja");
  const [period, setPeriod] = useState<PeriodMode>("mesUnico");

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

  // Build series: [{ bucket, seriesA, seriesB?, ... }]
  const { rows, seriesKeys, isLineChart } = useMemo(
    () => buildSeries({ sessions, metric, desglose, period, monthA, monthB, yearA, yearB, monthOfYear, trainerMap, horario, specialsMap }),
    [sessions, metric, desglose, period, monthA, monthB, yearA, yearB, monthOfYear, trainerMap, horario, specialsMap],
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
          <Select value={desglose} onValueChange={(v) => setDesglose(v as Desglose)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(DESGLOSE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Periodo</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        {period === "mesUnico" && (
          <FieldMonth label="Mes" value={monthA} onChange={setMonthA} />
        )}
        {period === "dosMeses" && (
          <>
            <FieldMonth label="Mes A" value={monthA} onChange={setMonthA} />
            <FieldMonth label="Mes B" value={monthB} onChange={setMonthB} />
          </>
        )}
        {period === "anoVsAno" && (
          <>
            <div className="space-y-1.5">
              <Label>Mes</Label>
              <Select value={monthOfYear} onValueChange={setMonthOfYear}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MES_LABEL.map((n, i) => <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <FieldNumber label="Año A" value={yearA} onChange={setYearA} />
            <FieldNumber label="Año B" value={yearB} onChange={setYearB} />
          </>
        )}
        {period === "mananaVsTarde" && (
          <FieldMonth label="Mes" value={monthA} onChange={setMonthA} />
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
                    <Line key={k} type="monotone" dataKey={k} stroke={palette[i % palette.length]} strokeWidth={2} dot={{ r: 3 }} />
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
                    <Bar key={k} dataKey={k} fill={palette[i % palette.length]} radius={[4, 4, 0, 0]} />
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

function FieldMonth({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="month" value={value} onChange={(e) => onChange(e.target.value)} className="w-40" />
    </div>
  );
}
function FieldNumber({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="w-24" />
    </div>
  );
}

// ============================================================
// Series builder
// ============================================================
type SeriesRow = { bucket: string; [key: string]: string | number };

function buildSeries(args: {
  sessions: Session[]; metric: Metric; desglose: Desglose; period: PeriodMode;
  monthA: string; monthB: string; yearA: string; yearB: string; monthOfYear: string;
  trainerMap: Map<string, Trainer>;
  horario: HorarioBase; specialsMap: Map<string, SpecialDay>;
}): { rows: SeriesRow[]; seriesKeys: string[]; isLineChart: boolean } {
  const { sessions, metric, desglose, period, monthA, monthB, yearA, yearB, monthOfYear, trainerMap, horario, specialsMap } = args;

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
  }

  // Buckets
  const bucketKeys: string[] = (() => {
    if (desglose === "franja") return HOURS.map((h) => `${String(h).padStart(2, "0")}:00`);
    if (desglose === "turno") return ["Mañana", "Tarde"];
    if (desglose === "dow") return ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    return ["Individual", "Pareja", "Grupal", "Prueba"];
  })();

  const bucketOf = (s: Session): string | null => {
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

// ============================================================
// Cancellations Panel
// ============================================================
function CancellationsPanel({ sessions, clients }: { sessions: Session[]; clients: Client[] }) {
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const [to, setTo] = useState(ymd(monthEnd(now.getFullYear(), now.getMonth())));
  const [sortDesc, setSortDesc] = useState(true);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const rows = useMemo(() => {
    const byClient = new Map<string, { name: string; normales: number; nc: number }>();
    for (const s of sessions) {
      if (s.estado !== "cancelada") continue;
      if (s.fecha < from || s.fecha > to) continue;
      const cid = s.client_id ?? "__sin__";
      const name = cid === "__sin__" ? "— sin cliente —" : clientMap.get(cid)?.nombre ?? "—";
      const rec = byClient.get(cid) ?? { name, normales: 0, nc: 0 };
      if (s.no_contabilizar) rec.nc++;
      else rec.normales++;
      byClient.set(cid, rec);
    }
    const arr = Array.from(byClient.entries()).map(([cid, r]) => ({ cid, ...r, total: r.normales + r.nc }));
    arr.sort((a, b) => sortDesc ? b.total - a.total : a.total - b.total);
    return arr;
  }, [sessions, clientMap, from, to, sortDesc]);

  function exportCsv() {
    const lines = ["cliente,canceladas,nc,total"];
    for (const r of rows) lines.push(`"${r.name.replace(/"/g, '""')}",${r.normales},${r.nc},${r.total}`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cancelaciones-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1.5">
          <Label>Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label>Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Canceladas</TableHead>
              <TableHead className="text-right">NC</TableHead>
              <TableHead className="text-right">
                <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSortDesc((v) => !v)}>
                  Total <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin cancelaciones en el periodo.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.cid}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{r.normales}</TableCell>
                <TableCell className="text-right tabular-nums">{r.nc}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{r.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}