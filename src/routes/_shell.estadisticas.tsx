import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Session, type Invoice, type Trainer, type BonoCatalogo } from "@/lib/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend as RLegend } from "recharts";
import {
  useCenterConfig, openMinutesOfDay, openMinutesInHour, eachDate,
  type HorarioBase, type SpecialDay,
} from "@/lib/center-schedule";

export const Route = createFileRoute("/_shell/estadisticas")({ component: StatsPage });

type Dim = "mes" | "ano" | "dow" | "franja" | "entrenador" | "tipoBono" | "turno";
type Metric = "sesiones" | "facturacion" | "ocupacion";

const DIM_LABEL: Record<Dim, string> = {
  mes: "Mes",
  ano: "Año",
  dow: "Día de la semana",
  franja: "Franja horaria",
  entrenador: "Entrenador",
  tipoBono: "Tipo de bono",
  turno: "Turno (mañana/tarde)",
};

const METRIC_LABEL: Record<Metric, string> = {
  sesiones: "Nº sesiones realizadas",
  facturacion: "Facturación (€)",
  ocupacion: "Ocupación (%)",
};

const DOW_LABEL = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const SPACES = 3;

function spacesFor(tipo: string | null | undefined): number {
  if (tipo === "pareja") return 2;
  if (tipo === "grupal") return 2;
  return 1;
}

function durMin(hi?: string | null, hf?: string | null): number {
  if (!hi || !hf) return 0;
  const [h1, m1] = hi.split(":").map(Number);
  const [h2, m2] = hf.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
}

function StatsPage() {
  const [dim, setDim] = useState<Dim>("mes");
  const [metric, setMetric] = useState<Metric>("sesiones");
  const { horario, specialsMap } = useCenterConfig();

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-all"],
    queryFn: async () => (await supabase.from("sessions").select("*").eq("estado", "realizada")).data as Session[] ?? [],
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices-all"],
    queryFn: async () => (await supabase.from("invoices").select("*")).data as Invoice[] ?? [],
  });
  const { data: trainers = [] } = useQuery({ queryKey: ["trainers"], queryFn: async () => (await supabase.from("trainers").select("*")).data as Trainer[] ?? [] });
  const { data: catalogo = [] } = useQuery({ queryKey: ["bonos_catalogo"], queryFn: async () => (await supabase.from("bonos_catalogo").select("*")).data as BonoCatalogo[] ?? [] });

  const trainerMap = new Map(trainers.map((t) => [t.id, t]));
  const catMap = new Map(catalogo.map((b) => [b.id, b]));

  const data = useMemo(() => {
    const buckets = new Map<string, number>();
    function add(key: string, value: number) {
      buckets.set(key, (buckets.get(key) ?? 0) + value);
    }

    if (metric === "facturacion") {
      for (const i of invoices) {
        const k = bucketKey(dim, { fecha: i.fecha, trainer_id: i.cobrador_trainer_id, bono: catMap.get(i.bono_catalogo_id)?.tipo });
        if (k) add(k, Number(i.precio_cobrado));
      }
      const arr = Array.from(buckets.entries()).map(([k, v]) => ({ key: k, value: v }));
      arr.sort((a, b) => sortKey(dim, a.key, b.key));
      return arr.map((d) => ({ ...d, label: labelFor(dim, d.key, trainerMap) }));
    }

    if (metric === "ocupacion") {
      // occupied minutes and capacity minutes per bucket
      const occupied = new Map<string, number>();
      const capacity = new Map<string, number>();
      // determine range from sessions
      const dates = sessions.map((s) => s.fecha).sort();
      if (dates.length === 0) return [];
      const from = new Date(dates[0]);
      const to = new Date(dates[dates.length - 1]);

      for (const s of sessions) {
        const k = bucketKey(dim, { fecha: s.fecha, hora: s.hora_inicio, trainer_id: s.trainer_id, bono: s.tipo });
        if (!k) continue;
        const minutes = durMin(s.hora_inicio, s.hora_fin) * spacesFor(s.tipo);
        occupied.set(k, (occupied.get(k) ?? 0) + minutes);
      }

      // capacity depends on dimension
      for (const d of eachDate(from, to)) {
        const openDay = openMinutesOfDay(d, horario, specialsMap);
        if (openDay === 0) continue;
        if (dim === "franja") {
          const sched = getDaySched(d, horario, specialsMap);
          if (!sched) continue;
          const startH = Math.floor(sched.openMin / 60);
          const endH = Math.ceil(sched.closeMin / 60);
          for (let h = startH; h < endH; h++) {
            const om = openMinutesInHour(d, h, horario, specialsMap);
            if (om > 0) {
              const k = `${String(h).padStart(2,"0")}h`;
              capacity.set(k, (capacity.get(k) ?? 0) + om * SPACES);
            }
          }
        } else if (dim === "turno") {
          let am = 0, pm = 0;
          const sched = getDaySched(d, horario, specialsMap);
          if (!sched) continue;
          for (let h = Math.floor(sched.openMin/60); h < Math.ceil(sched.closeMin/60); h++) {
            const om = openMinutesInHour(d, h, horario, specialsMap);
            if (h < 14) am += om; else pm += om;
          }
          if (am > 0) capacity.set("Mañana", (capacity.get("Mañana") ?? 0) + am * SPACES);
          if (pm > 0) capacity.set("Tarde", (capacity.get("Tarde") ?? 0) + pm * SPACES);
        } else if (dim === "mes") {
          const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          capacity.set(k, (capacity.get(k) ?? 0) + openDay * SPACES);
        } else if (dim === "ano") {
          const k = String(d.getFullYear());
          capacity.set(k, (capacity.get(k) ?? 0) + openDay * SPACES);
        } else if (dim === "dow") {
          const k = String(d.getDay());
          capacity.set(k, (capacity.get(k) ?? 0) + openDay * SPACES);
        }
      }

      // For entrenador and tipoBono, capacity is total across range per bucket
      if (dim === "entrenador" || dim === "tipoBono") {
        let totalCap = 0;
        for (const d of eachDate(from, to)) totalCap += openMinutesOfDay(d, horario, specialsMap) * SPACES;
        for (const k of occupied.keys()) capacity.set(k, totalCap);
      }

      const arr = Array.from(occupied.entries()).map(([k, occ]) => {
        const cap = capacity.get(k) ?? 0;
        const pct = cap > 0 ? Math.round((occ / cap) * 1000) / 10 : 0;
        return { key: k, value: pct };
      });
      arr.sort((a, b) => sortKey(dim, a.key, b.key));
      return arr.map((d) => ({ ...d, label: labelFor(dim, d.key, trainerMap) }));
    }

    // sesiones
    for (const s of sessions) {
      const k = bucketKey(dim, { fecha: s.fecha, hora: s.hora_inicio, trainer_id: s.trainer_id, bono: s.tipo });
      if (k) add(k, 1);
    }
    const arr = Array.from(buckets.entries()).map(([k, v]) => ({ key: k, value: v }));
    arr.sort((a, b) => sortKey(dim, a.key, b.key));
    return arr.map((d) => ({ ...d, label: labelFor(dim, d.key, trainerMap) }));
  }, [dim, metric, sessions, invoices, trainerMap, catMap, horario, specialsMap]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Estadísticas</h1>
      <p className="text-sm text-muted-foreground">Elige libremente las variables a comparar. La ocupación se calcula en minutos ocupados frente a la capacidad real del centro.</p>

      <div className="flex gap-4 flex-wrap">
        <div className="space-y-1.5">
          <Label>Eje X (agrupar por)</Label>
          <Select value={dim} onValueChange={(v) => setDim(v as Dim)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(DIM_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Métrica (eje Y)</Label>
          <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(METRIC_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} unit={metric === "ocupacion" ? "%" : undefined} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} formatter={(v: number) => metric === "ocupacion" ? `${v}%` : v} />
              <RLegend />
              <Bar dataKey="value" name={METRIC_LABEL[metric]} fill="var(--color-primary)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {data.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Sin datos para esta combinación.</p>}
      </div>
    </div>
  );
}

function getDaySched(d: Date, horario: HorarioBase, specials: Map<string, SpecialDay>) {
  // reuse helper by importing indirectly through openMinutesInHour signature is not enough;
  // small inline replica to fetch open/close minutes for the day.
  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const sp = specials.get(key);
  const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  if (sp) {
    if (sp.tipo === "cerrado") return null;
    if (sp.hora_apertura && sp.hora_cierre) {
      return { openMin: toMin(sp.hora_apertura.slice(0,5)), closeMin: toMin(sp.hora_cierre.slice(0,5)) };
    }
  }
  const base = horario[String(d.getDay())];
  if (!base) return null;
  return { openMin: toMin(base.open), closeMin: toMin(base.close) };
}

function bucketKey(dim: Dim, ctx: { fecha: string; hora?: string; trainer_id?: string | null; bono?: string | null }): string | null {
  const d = new Date(ctx.fecha);
  switch (dim) {
    case "mes": return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    case "ano": return String(d.getFullYear());
    case "dow": return String(d.getDay());
    case "franja": {
      if (!ctx.hora) return null;
      const h = Number(ctx.hora.split(":")[0]);
      return `${String(h).padStart(2,"0")}h`;
    }
    case "entrenador": return ctx.trainer_id ?? "—";
    case "tipoBono": return ctx.bono ?? "—";
    case "turno": {
      if (!ctx.hora) return null;
      const h = Number(ctx.hora.split(":")[0]);
      return h < 14 ? "Mañana" : "Tarde";
    }
  }
}
function sortKey(dim: Dim, a: string, b: string) {
  if (dim === "dow" || dim === "ano") return Number(a) - Number(b);
  return a.localeCompare(b);
}
function labelFor(dim: Dim, key: string, trainerMap: Map<string, Trainer>) {
  switch (dim) {
    case "mes": { const [y, m] = key.split("-"); return `${MES_LABEL[Number(m)-1]} ${y}`; }
    case "dow": return DOW_LABEL[Number(key)];
    case "entrenador": return trainerMap.get(key)?.iniciales ?? key;
    default: return key;
  }
}