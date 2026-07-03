import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Session } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend as RLegend,
} from "recharts";
import {
  useCenterConfig, getPeriodCapacity, openMinutesInHour, eachDate, getDayScheduleFor, ymd,
  type HorarioBase, type Precios,
} from "@/lib/center-schedule";

export const Route = createFileRoute("/_shell/estadisticas")({ component: StatsPage });

type Preset = "hoy" | "semana" | "mes" | "anio" | "custom";

function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // lunes = 0
  const r = new Date(d); r.setDate(d.getDate() - day); r.setHours(0,0,0,0); return r;
}
function endOfWeek(d: Date): Date {
  const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); return e;
}

function hourOf(hhmm: string): number { return Number(hhmm.split(":")[0]); }
function minsOf(hhmm: string): number { const [h,m] = hhmm.split(":").map(Number); return h*60 + m; }
function isCounted(s: Session): boolean {
  return s.estado === "realizada" || (s.estado === "cancelada" && !s.no_contabilizar);
}
function isBillable(s: Session): boolean {
  return s.estado === "realizada";
}
function spacesFor(tipo: Session["tipo"]): number { return tipo === "grupal" ? 2 : 1; }
function peopleFor(s: Session): number {
  if (s.tipo === "individual") return 1;
  if (s.tipo === "pareja") return 2;
  if (s.tipo === "grupal") return s.ocupacion;
  return 1;
}
function priceOf(s: Session, precios: Precios): number {
  if (s.tipo === "individual") return precios.individual;
  if (s.tipo === "pareja") return precios.pareja;
  if (s.tipo === "grupal") return precios.grupal * s.ocupacion;
  return 0;
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => {
    const s = String(v);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function StatsPage() {
  const [preset, setPreset] = useState<Preset>("mes");
  const today = new Date(); today.setHours(0,0,0,0);
  const [from, setFrom] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [to, setTo] = useState<Date>(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  function applyPreset(p: Preset) {
    setPreset(p);
    const now = new Date(); now.setHours(0,0,0,0);
    if (p === "hoy") { setFrom(now); setTo(now); }
    else if (p === "semana") { setFrom(startOfWeek(now)); setTo(endOfWeek(now)); }
    else if (p === "mes") {
      setFrom(new Date(now.getFullYear(), now.getMonth(), 1));
      setTo(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (p === "anio") {
      setFrom(new Date(now.getFullYear(), 0, 1));
      setTo(new Date(now.getFullYear(), 11, 31));
    }
  }

  const { horario, precios, specialsMap } = useCenterConfig();

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-range", ymd(from), ymd(to)],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*")
        .gte("fecha", ymd(from)).lte("fecha", ymd(to));
      return (data ?? []) as Session[];
    },
  });

  return (
    <div className="p-6 space-y-6 overflow-auto h-screen">
      <div>
        <h1 className="text-2xl font-display font-semibold">Estadísticas</h1>
        <p className="text-sm text-muted-foreground">Entrenamientos por franja, ocupación y facturación estimada.</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {(["hoy","semana","mes","anio","custom"] as Preset[]).map((p) => (
              <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => applyPreset(p)}>
                {p === "hoy" ? "Hoy" : p === "semana" ? "Semana" : p === "mes" ? "Mes" : p === "anio" ? "Año" : "Personalizado"}
              </Button>
            ))}
          </div>
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={ymd(from)} onChange={(e) => { setPreset("custom"); setFrom(new Date(e.target.value)); }} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={ymd(to)} onChange={(e) => { setPreset("custom"); setTo(new Date(e.target.value)); }} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="franjas">
        <TabsList>
          <TabsTrigger value="franjas">Entrenamientos por franja</TabsTrigger>
          <TabsTrigger value="ocupacion">Ocupación %</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
        </TabsList>

        <TabsContent value="franjas" className="pt-4">
          <FranjasTab sessions={sessions} from={from} to={to} horario={horario} specialsMap={specialsMap} />
        </TabsContent>
        <TabsContent value="ocupacion" className="pt-4">
          <OcupacionTab sessions={sessions} from={from} to={to} horario={horario} specialsMap={specialsMap} />
        </TabsContent>
        <TabsContent value="facturacion" className="pt-4">
          <FacturacionTab sessions={sessions} precios={precios} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------ helpers to derive open hours range for the period
function periodHourRange(from: Date, to: Date, horario: HorarioBase, specialsMap: Map<string, any>): number[] {
  let minH = 24, maxH = 0;
  for (const d of eachDate(from, to)) {
    const s = getDayScheduleFor(d, horario, specialsMap);
    if (!s) continue;
    minH = Math.min(minH, Math.floor(s.openMin / 60));
    maxH = Math.max(maxH, Math.ceil(s.closeMin / 60));
  }
  if (minH > maxH) return [];
  const out: number[] = [];
  for (let h = minH; h < maxH; h++) out.push(h);
  return out;
}

// ============================================================
// Tab 1 — Entrenamientos por franja
// ============================================================
function FranjasTab({ sessions, from, to, horario, specialsMap }: {
  sessions: Session[]; from: Date; to: Date;
  horario: HorarioBase; specialsMap: Map<string, any>;
}) {
  const hours = periodHourRange(from, to, horario, specialsMap);
  const data = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of sessions) {
      if (!isCounted(s)) continue;
      const h = hourOf(s.hora_inicio);
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    return hours.map((h) => ({ franja: `${String(h).padStart(2,"0")}:00`, sesiones: counts.get(h) ?? 0 }));
  }, [sessions, hours]);

  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center">
        <CardTitle>Sesiones iniciadas por franja horaria</CardTitle>
        <Button size="sm" variant="outline" onClick={() => downloadCSV(
          `franjas_${ymd(from)}_${ymd(to)}.csv`,
          [["Franja","Sesiones"], ...data.map((d) => [d.franja, d.sesiones])],
        )}><Download className="h-4 w-4 mr-1" />CSV</Button>
      </CardHeader>
      <CardContent style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="franja" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="sesiones" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab 2 — Ocupación %
// ============================================================
function OcupacionTab({ sessions, from, to, horario, specialsMap }: {
  sessions: Session[]; from: Date; to: Date;
  horario: HorarioBase; specialsMap: Map<string, any>;
}) {
  const hours = periodHourRange(from, to, horario, specialsMap);

  const { rows, kpiTotal, kpiManana, kpiTarde } = useMemo(() => {
    // capacity per hour (across period, ×3 spaces)
    const capHour = new Map<number, number>();
    for (const h of hours) {
      let cap = 0;
      for (const d of eachDate(from, to)) cap += openMinutesInHour(d, h, horario, specialsMap);
      capHour.set(h, cap * 3);
    }
    // occupied per hour
    const occHour = new Map<number, number>();
    let occManana = 0, occTarde = 0;
    for (const s of sessions) {
      if (!isCounted(s)) continue;
      const h = hourOf(s.hora_inicio);
      const dur = minsOf(s.hora_fin) - minsOf(s.hora_inicio);
      const occ = dur * spacesFor(s.tipo);
      occHour.set(h, (occHour.get(h) ?? 0) + occ);
      if (h < 14) occManana += occ; else occTarde += occ;
    }
    const rows = hours.map((h) => {
      const cap = capHour.get(h) ?? 0;
      const occ = occHour.get(h) ?? 0;
      return { franja: `${String(h).padStart(2,"0")}:00`, pct: cap > 0 ? +(occ / cap * 100).toFixed(1) : 0, cap, occ };
    });
    // shift capacity
    let capManana = 0, capTarde = 0;
    for (const [h, c] of capHour) {
      if (h < 14) capManana += c; else capTarde += c;
    }
    const capTotal = capManana + capTarde;
    const occTotal = occManana + occTarde;
    return {
      rows,
      kpiTotal: capTotal > 0 ? (occTotal / capTotal * 100) : 0,
      kpiManana: capManana > 0 ? (occManana / capManana * 100) : 0,
      kpiTarde: capTarde > 0 ? (occTarde / capTarde * 100) : 0,
    };
  }, [sessions, from, to, horario, specialsMap, hours]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Ocupación total" value={`${kpiTotal.toFixed(1)}%`} />
        <Kpi label="Mañana (<14:00)" value={`${kpiManana.toFixed(1)}%`} />
        <Kpi label="Tarde (≥14:00)" value={`${kpiTarde.toFixed(1)}%`} />
      </div>
      <Card>
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle>Ocupación por franja horaria</CardTitle>
          <Button size="sm" variant="outline" onClick={() => downloadCSV(
            `ocupacion_${ymd(from)}_${ymd(to)}.csv`,
            [["Franja","% Ocupación","Min ocupados","Capacidad (min×3)"], ...rows.map((r) => [r.franja, r.pct, r.occ, r.cap])],
          )}><Download className="h-4 w-4 mr-1" />CSV</Button>
        </CardHeader>
        <CardContent style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="franja" />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab 3 — Facturación estimada
// ============================================================
function FacturacionTab({ sessions, precios }: { sessions: Session[]; precios: Precios }) {
  const { total, manana, tarde, rows } = useMemo(() => {
    let manana = 0, tarde = 0;
    const byDay = new Map<string, { manana: number; tarde: number }>();
    for (const s of sessions) {
      if (!isBillable(s)) continue;
      const price = priceOf(s, precios);
      const isMan = hourOf(s.hora_inicio) < 14;
      if (isMan) manana += price; else tarde += price;
      const cur = byDay.get(s.fecha) ?? { manana: 0, tarde: 0 };
      if (isMan) cur.manana += price; else cur.tarde += price;
      byDay.set(s.fecha, cur);
    }
    const rows = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, v]) => ({ fecha, manana: v.manana, tarde: v.tarde, total: v.manana + v.tarde }));
    return { total: manana + tarde, manana, tarde, rows };
  }, [sessions, precios]);

  const chartData = [
    { turno: "Mañana", euros: Math.round(manana) },
    { turno: "Tarde", euros: Math.round(tarde) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Facturación total" value={`${total.toFixed(0)} €`} />
        <Kpi label="Mañana" value={`${manana.toFixed(0)} €`} />
        <Kpi label="Tarde" value={`${tarde.toFixed(0)} €`} />
      </div>
      <Card>
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle>Facturación estimada por turno</CardTitle>
          <Button size="sm" variant="outline" onClick={() => downloadCSV(
            `facturacion.csv`,
            [["Fecha","Mañana","Tarde","Total"], ...rows.map((r) => [r.fecha, r.manana, r.tarde, r.total])],
          )}><Download className="h-4 w-4 mr-1" />CSV</Button>
        </CardHeader>
        <CardContent style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="turno" />
              <YAxis tickFormatter={(v) => `${v}€`} />
              <Tooltip formatter={(v: number) => `${v} €`} />
              <RLegend />
              <Bar dataKey="euros" name="€" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Precios usados — Individual: {precios.individual} €, Pareja: {precios.pareja} €, Grupal: {precios.grupal} €/persona. Editables en Configuración.
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold font-display mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}