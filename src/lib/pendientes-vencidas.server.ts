/* eslint-disable @typescript-eslint/no-explicit-any */
import { centroDb } from "./centro-scope.server";
import { crearNotificaciones, describeSesion } from "./notificaciones.server";

/** Fecha y hora actuales en Madrid ("YYYY-MM-DD", "HH:MM:SS"). */
function ahoraMadrid(): { fecha: string; hora: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { fecha: `${g("year")}-${g("month")}-${g("day")}`, hora: `${g("hour")}:${g("minute")}:${g("second")}` };
}

/**
 * Deniega automáticamente las reservas de clientes pendientes de confirmar
 * cuya hora de inicio ya ha llegado. Avisa al cliente y convierte el aviso
 * de confirmación del centro en un aviso de denegación automática.
 */
export async function denegarPendientesVencidas(centroId: string): Promise<number> {
  const db = centroDb(centroId) as any;
  const { fecha, hora } = ahoraMadrid();
  const { data: rows } = await db
    .from("sessions")
    .select("id,group_id,client_id,fecha,hora_inicio,titulo,servicio_slug,booked_by_user_id")
    .eq("por_confirmar", true)
    .not("booked_by_user_id", "is", null)
    .lte("fecha", fecha)
    .limit(500);
  const vencidas = ((rows ?? []) as any[]).filter(
    (r) => r.fecha < fecha || String(r.hora_inicio) <= hora,
  );
  if (!vencidas.length) return 0;

  const { data: cfg } = await db.from("center_config").select("nombre").eq("id", true).maybeSingle();
  const centro = cfg?.nombre || "El centro";
  const slugs = [...new Set(vencidas.map((r) => r.servicio_slug).filter(Boolean))];
  const { data: servicios } = slugs.length
    ? await db.from("servicios").select("slug,nombre").in("slug", slugs)
    : { data: [] };
  const nombreServicio = new Map(((servicios ?? []) as any[]).map((s) => [s.slug, s.nombre]));
  const clientIds = [...new Set(vencidas.map((r) => r.client_id).filter(Boolean))];
  const { data: clientes } = clientIds.length
    ? await db.from("clients").select("id,nombre").in("id", clientIds)
    : { data: [] };
  const nombreCliente = new Map(((clientes ?? []) as any[]).map((c) => [c.id, c.nombre]));

  const avisos: Parameters<typeof crearNotificaciones>[0] = [];
  for (const r of vencidas) {
    // Liberar la plaza (igual que al denegar manualmente).
    let hecho = false;
    if (r.group_id) {
      const { count } = await db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("group_id", r.group_id)
        .eq("fecha", r.fecha)
        .eq("hora_inicio", r.hora_inicio);
      if ((count ?? 0) <= 1) {
        const { error } = await db
          .from("sessions")
          .update({ client_id: null, booked_by_user_id: null, booking_tipo: null, por_confirmar: false })
          .eq("id", r.id)
          .eq("por_confirmar", true);
        hecho = !error;
      }
    }
    if (!hecho) {
      const { error } = await db.from("sessions").delete().eq("id", r.id).eq("por_confirmar", true);
      if (error) continue;
    }

    const donde = (r.servicio_slug && nombreServicio.get(r.servicio_slug)) || r.titulo || "tu sesión";
    const cuando = describeSesion(r.fecha, r.hora_inicio).replace(" · ", " a las ");
    const cliente = (r.client_id && nombreCliente.get(r.client_id)) || "el cliente";

    // El aviso de confirmar/denegar del centro pasa a ser informativo.
    await db
      .from("notificaciones")
      .update({
        tipo: "reserva_denegada_auto",
        titulo: "Reserva denegada automáticamente",
        mensaje: `La reserva de ${cliente} en ${donde} el ${cuando} se ha denegado automáticamente al no confirmarse antes del inicio`,
        session_id: null,
        leida: false,
      })
      .eq("session_id", r.id)
      .is("user_id", null);

    avisos.push({
      userId: r.booked_by_user_id,
      tipo: "reserva_denegada",
      titulo: "Reserva no confirmada",
      mensaje: `${centro} no ha podido confirmar tu reserva de ${donde} el ${cuando}`,
    });
  }
  await crearNotificaciones(avisos, centroId);
  return avisos.length;
}

export async function denegarPendientesVencidasTodosLosCentros(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("centros").select("id").eq("estado", "activo");
  let total = 0;
  for (const c of (data ?? []) as { id: string }[]) {
    try {
      total += await denegarPendientesVencidas(c.id);
    } catch {
      /* continúa con el resto */
    }
  }
  return total;
}
