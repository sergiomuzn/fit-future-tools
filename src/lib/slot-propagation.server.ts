import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseBookingMode } from "./booking-mode";
import {
  buildPropagationPlan,
  instanceKey,
  mondayOf,
  parsePropagacionSemanas,
  weekDates,
  type PlantillaSlot,
} from "./slot-propagation-core";

/**
 * Propagación automática: genera los huecos de la semana tipo para las
 * próximas `semanas` semanas (por defecto 2), respetando el modo de reservas.
 */
export async function propagarSemanasAuto(semanasArg?: number): Promise<{
  ok: boolean;
  creados: number;
  motivo?: string;
}> {
  const { data: config } = await supabaseAdmin
    .from("center_config")
    .select("avisos")
    .eq("id", true)
    .maybeSingle();
  const avisos = (config?.avisos ?? {}) as {
    propagacion_auto?: unknown;
    propagacion_semanas?: unknown;
    modo_reservas?: unknown;
  };
  if (avisos.propagacion_auto !== true) {
    return { ok: true, creados: 0, motivo: "Propagación automática desactivada" };
  }
  const modo = parseBookingMode(avisos.modo_reservas);
  const semanas = semanasArg ?? parsePropagacionSemanas(avisos.propagacion_semanas);


  const base = mondayOf(new Date());
  const fechas = Array.from({ length: semanas }, (_, i) => {
    const m = new Date(base);
    m.setDate(m.getDate() + i * 7);
    return weekDates(m);
  })
    .flat()
    .sort();
  const from = fechas[0]!;
  const to = fechas[fechas.length - 1]!;

  const [{ data: slots }, { data: sesiones }, { data: instancias }] = await Promise.all([
    supabaseAdmin
      .from("service_slots")
      .select("id,servicio_slug,dia_semana,hora_inicio,hora_fin,capacidad,trainer_id")
      .eq("activo", true),
    supabaseAdmin
      .from("sessions")
      .select("fecha,hora_inicio,hora_fin")
      .gte("fecha", from)
      .lte("fecha", to)
      .neq("estado", "cancelada"),
    supabaseAdmin
      .from("service_slot_instances")
      .select("servicio_slug,fecha,hora_inicio,hora_fin")
      .gte("fecha", from)
      .lte("fecha", to),
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

  const plan = buildPropagationPlan({
    plantilla: (slots ?? []) as PlantillaSlot[],
    fechas,
    sesionesPorFecha,
    existentes,
    modo,
    origen: "auto",
  });

  if (!plan.rows.length) return { ok: true, creados: 0, motivo: "Nada nuevo que propagar" };

  for (let i = 0; i < plan.rows.length; i += 200) {
    const { error } = await supabaseAdmin
      .from("service_slot_instances")
      .upsert(plan.rows.slice(i, i + 200), {
        onConflict: "servicio_slug,fecha,hora_inicio,hora_fin",
        ignoreDuplicates: true,
      });
    if (error) return { ok: false, creados: 0, motivo: error.message };
  }
  return { ok: true, creados: plan.rows.length };
}
