import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bookingModeInfo, useBookingMode, DEFAULT_BOOKING_MODE } from "@/lib/booking-mode";
import { useServiceSlots, hhmm } from "@/lib/service-slots";
import {
  buildPropagationPlan,
  instanceKey,
  mondayOf,
  usePropagacionAuto,
  weekDates,
  ymdLocal,
  type PlantillaSlot,
} from "@/lib/slot-propagation";
import { cn } from "@/lib/utils";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtCorto(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Servicio activo, o "" para todos. */
  servicioSlug: string;
}

/** Modal "Propagar a la agenda": semanas concretas o propagación automática. */
export function PropagarDialog({ open, onOpenChange, servicioSlug }: Props) {
  const qc = useQueryClient();
  const { data: modo = DEFAULT_BOOKING_MODE } = useBookingMode();
  const modoInfo = bookingModeInfo(modo);
  const { data: slots = [] } = useServiceSlots();
  const { data: autoActivo = false } = usePropagacionAuto();

  const semanas = useMemo(() => {
    const base = mondayOf(new Date());
    return Array.from({ length: 8 }, (_, i) => {
      const m = new Date(base);
      m.setDate(m.getDate() + i * 7);
      return { monday: ymdLocal(m), fechas: weekDates(m) };
    });
  }, []);

  const [modoSeleccion, setModoSeleccion] = useState<"semanas" | "rango">("semanas");
  const [semanasSel, setSemanasSel] = useState<string[]>([semanas[0]?.monday ?? ""]);
  const [desde, setDesde] = useState(() => ymdLocal(new Date()));
  const [hasta, setHasta] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 13);
    return ymdLocal(d);
  });

  const fechas = useMemo(() => {
    if (modoSeleccion === "semanas") {
      return semanas
        .filter((s) => semanasSel.includes(s.monday))
        .flatMap((s) => s.fechas)
        .sort();
    }
    if (!desde || !hasta || desde > hasta) return [];
    const out: string[] = [];
    const d = new Date(`${desde}T00:00:00`);
    const end = new Date(`${hasta}T00:00:00`);
    while (d <= end && out.length < 120) {
      out.push(ymdLocal(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [modoSeleccion, semanas, semanasSel, desde, hasta]);

  const plantilla: PlantillaSlot[] = useMemo(
    () =>
      slots
        .filter((s) => s.activo && (!servicioSlug || s.servicio_slug === servicioSlug))
        .map((s) => ({
          id: s.id,
          servicio_slug: s.servicio_slug,
          dia_semana: s.dia_semana,
          hora_inicio: s.hora_inicio,
          hora_fin: s.hora_fin,
          capacidad: s.capacidad,
          trainer_id: s.trainer_id,
        })),
    [slots, servicioSlug],
  );

  const rango = fechas.length ? { from: fechas[0], to: fechas[fechas.length - 1] } : null;

  const { data: contexto, isFetching } = useQuery({
    queryKey: ["propagacion-preview", rango?.from, rango?.to],
    enabled: open && !!rango,
    queryFn: async () => {
      const [{ data: sesiones }, { data: instancias }] = await Promise.all([
        supabase
          .from("sessions")
          .select("fecha,hora_inicio,hora_fin,estado")
          .gte("fecha", rango!.from)
          .lte("fecha", rango!.to)
          .neq("estado", "cancelada"),
        supabase
          .from("service_slot_instances")
          .select("servicio_slug,fecha,hora_inicio,hora_fin")
          .gte("fecha", rango!.from)
          .lte("fecha", rango!.to),
      ]);
      const sesionesPorFecha = new Map<string, { inicio: string; fin: string }[]>();
      for (const s of (sesiones ?? []) as { fecha: string; hora_inicio: string; hora_fin: string }[]) {
        const arr = sesionesPorFecha.get(s.fecha) ?? [];
        arr.push({ inicio: s.hora_inicio, fin: s.hora_fin });
        sesionesPorFecha.set(s.fecha, arr);
      }
      const existentes = new Set(
        (
          (instancias ?? []) as {
            servicio_slug: string;
            fecha: string;
            hora_inicio: string;
            hora_fin: string;
          }[]
        ).map((i) => instanceKey(i.servicio_slug, i.fecha, i.hora_inicio, i.hora_fin)),
      );
      return { sesionesPorFecha, existentes };
    },
  });

  const plan = useMemo(() => {
    if (!contexto || !fechas.length) return null;
    return buildPropagationPlan({
      plantilla,
      fechas,
      sesionesPorFecha: contexto.sesionesPorFecha,
      existentes: contexto.existentes,
      modo,
    });
  }, [contexto, fechas, plantilla, modo]);

  const propagar = useMutation({
    mutationFn: async () => {
      if (!plan?.rows.length) throw new Error("No hay huecos nuevos que propagar");
      for (let i = 0; i < plan.rows.length; i += 200) {
        const { error } = await supabase
          .from("service_slot_instances")
          .insert(plan.rows.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
      return plan.rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["service_slot_instances"] });
      qc.invalidateQueries({ queryKey: ["propagacion-preview"] });
      toast.success(`${n} huecos propagados a la agenda`);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAuto = useMutation({
    mutationFn: async (valor: boolean) => {
      const { data } = await supabase
        .from("center_config")
        .select("avisos")
        .eq("id", true)
        .maybeSingle();
      const avisos = { ...((data?.avisos ?? {}) as Record<string, unknown>), propagacion_auto: valor };
      const { error } = await supabase
        .from("center_config")
        .update({ avisos: avisos as never })
        .eq("id", true);
      if (error) throw new Error(error.message);
      return valor;
    },
    onSuccess: (valor) => {
      qc.invalidateQueries({ queryKey: ["propagacion-auto"] });
      toast.success(valor ? "Propagación automática activada" : "Propagación automática desactivada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fechasConHuecos = Object.entries(plan?.porFecha ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const total = plan?.rows.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Propagar a la agenda</DialogTitle>
          <DialogDescription>
            La semana tipo es una plantilla: los huecos solo se ofertan al cliente cuando se propagan.
            Se aplica el modo activo <span className="font-medium">{modoInfo.label}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <CalendarRange className="h-4 w-4" /> Propagar a semanas específicas
            </div>
            <div className="mb-2 flex gap-2">
              <Button
                size="sm"
                variant={modoSeleccion === "semanas" ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setModoSeleccion("semanas")}
              >
                Elegir semanas
              </Button>
              <Button
                size="sm"
                variant={modoSeleccion === "rango" ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setModoSeleccion("rango")}
              >
                Rango de fechas
              </Button>
            </div>

            {modoSeleccion === "semanas" ? (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {semanas.map((s, i) => {
                  const checked = semanasSel.includes(s.monday);
                  return (
                    <button
                      key={s.monday}
                      onClick={() =>
                        setSemanasSel((prev) =>
                          prev.includes(s.monday)
                            ? prev.filter((m) => m !== s.monday)
                            : [...prev, s.monday],
                        )
                      }
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                        checked ? "border-primary bg-primary/10" : "hover:bg-accent",
                      )}
                    >
                      <span className="block font-medium">
                        {i === 0 ? "Esta semana" : i === 1 ? "Próxima semana" : `Semana +${i}`}
                      </span>
                      <span className="block text-muted-foreground">
                        {fmtCorto(s.fechas[0])} – {fmtCorto(s.fechas[6])}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 w-[150px]" />
                </div>
                <div>
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 w-[150px]" />
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <div className="mb-1 flex items-center gap-2 font-medium">
              Resumen
              {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            {total === 0 ? (
              <p className="text-muted-foreground">
                No se crearán huecos nuevos con la selección actual.
                {plan?.yaExistentes ? ` ${plan.yaExistentes} ya estaban propagados.` : ""}
              </p>
            ) : (
              <>
                <p>
                  Se crearán <span className="font-semibold">{total}</span> huecos en{" "}
                  {fechasConHuecos.length} día(s).
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-muted-foreground">
                  {fechasConHuecos.map(([f, n]) => (
                    <span key={f} className="rounded bg-background px-1.5 py-0.5">
                      {fmtCorto(f)}: {n}
                    </span>
                  ))}
                </div>
              </>
            )}
            {(plan?.omitidosPorModo ?? 0) > 0 && (
              <p className="mt-1 text-muted-foreground">
                {plan!.omitidosPorModo} huecos omitidos por el modo {modoInfo.label.toLowerCase()}.
              </p>
            )}
            {plan?.yaExistentes ? (
              <p className="mt-1 text-muted-foreground">{plan.yaExistentes} ya estaban propagados.</p>
            ) : null}
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Propagación automática</div>
              <p className="text-xs text-muted-foreground">
                Cada lunes se generan automáticamente los huecos de la semana tipo para las próximas
                2 semanas, respetando el modo de reservas activo.
              </p>
            </div>
            <Switch
              checked={autoActivo}
              disabled={toggleAuto.isPending}
              onCheckedChange={(v) => toggleAuto.mutate(v)}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Plantilla activa: {plantilla.length} huecos por semana
            {servicioSlug ? " (servicio filtrado)" : ""} · huecos de{" "}
            {plantilla.length ? `${hhmm(plantilla[0].hora_inicio)}…` : "—"}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => propagar.mutate()}
            disabled={total === 0 || propagar.isPending}
          >
            {propagar.isPending ? "Propagando…" : `Propagar ${total || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
