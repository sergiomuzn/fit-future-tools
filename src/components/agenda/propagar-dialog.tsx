import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useConfirm } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bookingModeInfo, useBookingMode, DEFAULT_BOOKING_MODE } from "@/lib/booking-mode";
import { useCenterConfig, getDayScheduleFor } from "@/lib/center-schedule";
import { useServiceSlots } from "@/lib/service-slots";
import {
  buildPropagationPlan,
  instanceKey,
  mondayOf,
  usePropagacionAuto,
  usePropagacionSemanas,
  weekDates,
  ymdLocal,
  type PlantillaSlot,
} from "@/lib/slot-propagation";
import { cn } from "@/lib/utils";

const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Servicio activo, o "" para todos. */
  servicioSlug: string;
}

/** Modal "Propagar a la agenda": calendario de semanas + propagación automática. */
export function PropagarDialog({ open, onOpenChange, servicioSlug }: Props) {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: modo = DEFAULT_BOOKING_MODE } = useBookingMode();
  const modoInfo = bookingModeInfo(modo);
  const { data: slots = [] } = useServiceSlots();
  const { data: autoActivo = false } = usePropagacionAuto();
  const { data: autoSemanas = 2 } = usePropagacionSemanas();
  const { horario, specialsMap } = useCenterConfig();

  const hoyMonday = useMemo(() => mondayOf(new Date()), []);
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [semanasSel, setSemanasSel] = useState<string[]>([ymdLocal(hoyMonday)]);
  const [semanasInput, setSemanasInput] = useState(String(autoSemanas));
  /** Valor optimista del interruptor para que responda al instante. */
  const [autoOpt, setAutoOpt] = useState<boolean | null>(null);
  const autoChecked = autoOpt ?? autoActivo;

  /** Días cerrados (festivos/cierres o día no laborable del horario base). */
  function diaCerrado(fecha: string): boolean {
    return !getDayScheduleFor(new Date(`${fecha}T00:00:00`), horario, specialsMap);
  }

  /** Semanas (lunes) que tocan el mes visible. */
  const semanasMes = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    const out: { monday: string; fechas: string[] }[] = [];
    const cur = mondayOf(primero);
    while (cur <= ultimo) {
      out.push({ monday: ymdLocal(cur), fechas: weekDates(cur) });
      cur.setDate(cur.getDate() + 7);
    }
    return out;
  }, [mes]);

  const fechas = useMemo(
    () =>
      semanasSel
        .slice()
        .sort()
        .flatMap((m) => weekDates(new Date(`${m}T00:00:00`))),
    [semanasSel],
  );

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

  /** Rango que cubre el mes visible + las semanas seleccionadas. */
  const rango = useMemo(() => {
    const todas = [...semanasMes.flatMap((s) => s.fechas), ...fechas].sort();
    return todas.length ? { from: todas[0], to: todas[todas.length - 1] } : null;
  }, [semanasMes, fechas]);

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
      const filas = (instancias ?? []) as {
        servicio_slug: string;
        fecha: string;
        hora_inicio: string;
        hora_fin: string;
      }[];
      const existentes = new Set(
        filas.map((i) => instanceKey(i.servicio_slug, i.fecha, i.hora_inicio, i.hora_fin)),
      );
      const propagadosPorFecha = new Map<string, number>();
      for (const i of filas) {
        propagadosPorFecha.set(i.fecha, (propagadosPorFecha.get(i.fecha) ?? 0) + 1);
      }
      return { sesionesPorFecha, existentes, propagadosPorFecha };
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

  const total = plan?.rows.length ?? 0;

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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async () => {
      if (!fechas.length) throw new Error("Selecciona al menos una semana");
      let q = supabase
        .from("service_slot_instances")
        .delete()
        .gte("fecha", fechas[0])
        .lte("fecha", fechas[fechas.length - 1])
        .in("fecha", fechas);
      if (servicioSlug) q = q.eq("servicio_slug", servicioSlug);
      const { error } = await q;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_slot_instances"] });
      qc.invalidateQueries({ queryKey: ["propagacion-preview"] });
      toast.success("Propagación eliminada en las semanas seleccionadas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarAuto = useMutation({
    mutationFn: async (patch: { propagacion_auto?: boolean; propagacion_semanas?: number }) => {
      const { data } = await supabase
        .from("center_config")
        .select("avisos")
        .eq("id", true)
        .maybeSingle();
      const avisos = { ...((data?.avisos ?? {}) as Record<string, unknown>), ...patch };
      const { error } = await supabase
        .from("center_config")
        .update({ avisos: avisos as never })
        .eq("id", true);
      if (error) throw new Error(error.message);
      return patch;
    },
    onSuccess: (patch) => {
      qc.invalidateQueries({ queryKey: ["propagacion-auto"] });
      qc.invalidateQueries({ queryKey: ["propagacion-semanas"] });
      if (patch.propagacion_auto !== undefined) {
        toast.success(
          patch.propagacion_auto ? "Propagación automática activada" : "Propagación automática desactivada",
        );
      } else {
        toast.success("Semanas de propagación automática actualizadas");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleSemana(monday: string) {
    setSemanasSel((prev) =>
      prev.includes(monday) ? prev.filter((m) => m !== monday) : [...prev, monday],
    );
  }

  function contarPropagados(fechasSemana: string[]): number {
    if (!contexto) return 0;
    return fechasSemana.reduce((a, f) => a + (contexto.propagadosPorFecha.get(f) ?? 0), 0);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Propagar a la agenda</DialogTitle>
          <DialogDescription>
            Haz clic sobre una semana del calendario para seleccionarla (puedes alternar semana sí,
            semana no). Se aplica el modo activo{" "}
            <span className="font-medium">{modoInfo.label}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Calendario por semanas */}
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 text-sm font-medium capitalize">
                {MESES_LARGOS[mes.getMonth()]} {mes.getFullYear()}
                {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-1 grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1 text-[10px] text-muted-foreground">
              <div className="w-10" />
              {DOW.map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>

            <div className="space-y-1">
              {semanasMes.map((s) => {
                const sel = semanasSel.includes(s.monday);
                const propagados = contarPropagados(s.fechas);
                const pasada = s.monday < ymdLocal(hoyMonday);
                return (
                  <button
                    key={s.monday}
                    onClick={() => toggleSemana(s.monday)}
                    className={cn(
                      "grid w-full grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-1 rounded-md border px-1 py-1 text-xs transition-colors",
                      sel ? "border-primary bg-primary/10" : "border-transparent hover:bg-accent",
                      pasada && "opacity-50",
                    )}
                  >
                    <span className="w-10 text-left text-[10px] text-muted-foreground">
                      {propagados > 0 ? `${propagados}✓` : ""}
                    </span>
                    {s.fechas.map((f) => {
                      const d = new Date(`${f}T00:00:00`);
                      const fuera = d.getMonth() !== mes.getMonth();
                      return (
                        <span
                          key={f}
                          className={cn(
                            "flex h-7 items-center justify-center rounded",
                            sel && "font-semibold text-primary",
                            fuera && "text-muted-foreground/40",
                          )}
                        >
                          {d.getDate()}
                        </span>
                      );
                    })}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {semanasSel.length} semana(s) seleccionada(s) · {plantilla.length} huecos/semana en
                plantilla
              </span>
              {semanasSel.length > 0 && (
                <button className="underline" onClick={() => setSemanasSel([])}>
                  Limpiar
                </button>
              )}
            </div>
          </div>

          <Separator />

          {/* Propagación automática */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium">Propagación automática</div>
                <p className="text-xs text-muted-foreground">
                  Cada lunes se generan automáticamente los huecos de la semana tipo para las
                  próximas semanas que definas, respetando el modo de reservas activo.
                </p>
              </div>
              <Switch
                checked={autoActivo}
                disabled={guardarAuto.isPending}
                onCheckedChange={(v) => guardarAuto.mutate({ propagacion_auto: v })}
              />
            </div>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs">Semanas por delante</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={semanasInput}
                  onChange={(e) => setSemanasInput(e.target.value)}
                  className="h-8 w-[90px]"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={guardarAuto.isPending}
                onClick={() => {
                  const n = Math.min(12, Math.max(1, Number(semanasInput) || 1));
                  setSemanasInput(String(n));
                  guardarAuto.mutate({ propagacion_semanas: n });
                }}
              >
                Guardar
              </Button>
              <span className="pb-2 text-[11px] text-muted-foreground">
                Actual: {autoSemanas} semana(s)
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            className="text-destructive"
            disabled={!semanasSel.length || eliminar.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Eliminar propagación",
                description:
                  "Se eliminarán los huecos propagados de las semanas seleccionadas. Las reservas ya existentes en la agenda no se eliminan.",
                confirmText: "Eliminar",
              });
              if (ok) eliminar.mutate();
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Eliminar propagación
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button onClick={() => propagar.mutate()} disabled={total === 0 || propagar.isPending}>
              {propagar.isPending ? "Propagando…" : `Propagar ${total || ""}`.trim()}
            </Button>
          </div>
        </DialogFooter>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
