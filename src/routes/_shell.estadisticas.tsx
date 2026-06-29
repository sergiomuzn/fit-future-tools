import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Session, type Invoice, type Trainer, type BonoCatalogo } from "@/lib/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend as RLegend } from "recharts";

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
  ocupacion: "Ocupación total",
};

const DOW_LABEL = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MES_LABEL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function StatsPage() {
  const [dim, setDim] = useState<Dim>("mes");
  const [metric, setMetric] = useState<Metric>("sesiones");

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
    } else {
      for (const s of sessions) {
        const k = bucketKey(dim, { fecha: s.fecha, hora: s.hora_inicio, trainer_id: s.trainer_id, bono: s.tipo });
        if (k) add(k, metric === "ocupacion" ? s.ocupacion : 1);
      }
    }
    const arr = Array.from(buckets.entries()).map(([k, v]) => ({ key: k, value: v }));
    arr.sort((a, b) => sortKey(dim, a.key, b.key));
    return arr.map((d) => ({ ...d, label: labelFor(dim, d.key, trainerMap) }));
  }, [dim, metric, sessions, invoices, trainerMap, catMap]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Estadísticas</h1>
      <p className="text-sm text-muted-foreground">Elige libremente las variables a comparar. Atajos: mañana vs tarde (turno), año vs año, bonos top.</p>

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
              <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
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