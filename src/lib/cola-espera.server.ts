/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lógica de servidor de la cola de espera.
 *
 * Una entrada de cola identifica al cliente y la "clave" de la sesión
 * (`hueco|<id>` o `<grupo>|<fecha>|<hora>`), la misma que usa el portal.
 */
import { centroDb, getCentroIdForUser } from "./centro-scope.server";
import {
  parseColaConfig,
  colaTiempoParaServicio,
  colaTiempoLabel,
  type ColaConfig,
} from "./cola-espera";

export interface ColaEntry {
  id: string;
  user_id: string;
  client_id: string;
  clave: string;
  servicio_slug: string | null;
  group_id: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  ofrecida_at: string | null;
  expira_at: string | null;
  created_at: string;
}

export interface ColaInfo {
  total: number;
  posicion: number | null;
  estado: "en_cola" | "ofrecida" | null;
  colaId: string | null;
  expiraAt: string | null;
}

export async function getColaConfig(centroId: string): Promise<ColaConfig> {
  const db = centroDb(centroId);
  const { data } = await db.from("center_config").select("avisos").eq("id", true).maybeSingle();
  return parseColaConfig((data as { avisos?: unknown } | null)?.avisos);
}

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function activasDelCentro(centroId: string): Promise<ColaEntry[]> {
  const db = centroDb(centroId);
  const { data } = await (db as any)
    .from("reserva_cola")
    .select("*")
    .in("estado", ["en_cola", "ofrecida"])
    .gte("fecha", hoyIso())
    .order("created_at", { ascending: true });
  return (data ?? []) as ColaEntry[];
}

/** Datos de la sesión referenciada por una clave del portal. */
async function slotInfo(
  centroId: string,
  clave: string,
): Promise<{
  servicioSlug: string | null;
  groupId: string | null;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  capacidad: number;
  ocupadas: number;
  userIds: (string | null)[];
  clientIds: (string | null)[];
} | null> {
  const db = centroDb(centroId);

  if (clave.startsWith("hueco|")) {
    const { data: hueco } = await db
      .from("service_slot_instances")
      .select("id,servicio_slug,fecha,hora_inicio,hora_fin,capacidad,activo")
      .eq("id", clave.slice("hueco|".length))
      .maybeSingle();
    if (!hueco || hueco.activo === false) return null;
    const { data: rows } = await db
      .from("sessions")
      .select("id,client_id,booked_by_user_id")
      .is("group_id", null)
      .eq("fecha", hueco.fecha)
      .eq("hora_inicio", hueco.hora_inicio)
      .eq("servicio_slug", hueco.servicio_slug)
      .neq("estado", "cancelada");
    const list = (rows ?? []) as { client_id: string | null; booked_by_user_id: string | null }[];
    return {
      servicioSlug: hueco.servicio_slug,
      groupId: null,
      fecha: hueco.fecha,
      horaInicio: hueco.hora_inicio,
      horaFin: hueco.hora_fin,
      capacidad: Math.max(1, hueco.capacidad ?? 1),
      ocupadas: list.filter((r) => !!r.client_id).length,
      userIds: list.map((r) => r.booked_by_user_id),
      clientIds: list.map((r) => r.client_id),
    };
  }

  const [groupId, fecha, horaInicio] = clave.split("|");
  if (!groupId || !fecha || !horaInicio) return null;
  const [{ data: rows }, { data: group }] = await Promise.all([
    db
      .from("sessions")
      .select("id,client_id,booked_by_user_id,hora_fin,servicio_slug,estado")
      .eq("group_id", groupId)
      .eq("fecha", fecha)
      .eq("hora_inicio", horaInicio),
    db.from("groups").select("capacidad").eq("id", groupId).maybeSingle(),
  ]);
  const list = ((rows ?? []) as {
    client_id: string | null;
    booked_by_user_id: string | null;
    hora_fin: string;
    servicio_slug: string | null;
    estado: string;
  }[]).filter((r) => r.estado !== "cancelada");
  if (!list.length) return null;
  return {
    servicioSlug: list.find((r) => r.servicio_slug)?.servicio_slug ?? null,
    groupId,
    fecha,
    horaInicio,
    horaFin: list[0]!.hora_fin,
    capacidad: Math.max(1, group?.capacidad ?? 1),
    ocupadas: list.filter((r) => !!r.client_id).length,
    userIds: list.map((r) => r.booked_by_user_id),
    clientIds: list.map((r) => r.client_id),
  };
}

/** Clave de portal correspondiente a una sesión concreta. */
export async function claveDeSesion(
  centroId: string,
  row: { group_id: string | null; fecha: string; hora_inicio: string; servicio_slug: string | null },
): Promise<string | null> {
  if (row.group_id) return `${row.group_id}|${row.fecha}|${row.hora_inicio}`;
  if (!row.servicio_slug) return null;
  const db = centroDb(centroId);
  const { data } = await db
    .from("service_slot_instances")
    .select("id")
    .eq("fecha", row.fecha)
    .eq("hora_inicio", row.hora_inicio)
    .eq("servicio_slug", row.servicio_slug)
    .limit(1)
    .maybeSingle();
  return data?.id ? `hueco|${data.id}` : null;
}

function describe(fecha: string, hora: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d!);
  const dia = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${dia} a las ${hora.slice(0, 5)}`;
}

async function notificar(
  centroId: string,
  items: {
    userId: string;
    tipo: string;
    titulo: string;
    mensaje: string;
    sessionId?: string | null;
  }[],
): Promise<void> {
  if (!items.length) return;
  const { crearNotificaciones } = await import("./notificaciones.server");
  await crearNotificaciones(items, centroId);
}

/**
 * Ofrece la plaza libre al primero de la cola. No hace nada si ya hay una
 * oferta viva o si la cola está vacía.
 */
export async function ofrecerPlazaSiguiente(centroId: string, clave: string): Promise<void> {
  const db = centroDb(centroId);
  const cfg = await getColaConfig(centroId);
  if (!cfg.activa) return;

  const { data } = await (db as any)
    .from("reserva_cola")
    .select("*")
    .eq("clave", clave)
    .in("estado", ["en_cola", "ofrecida"])
    .order("created_at", { ascending: true });
  const entries = (data ?? []) as ColaEntry[];
  if (!entries.length) return;
  if (entries.some((e) => e.estado === "ofrecida")) return;

  const primero = entries[0]!;
  const hayMasDetras = entries.length > 1;
  const minutos = colaTiempoParaServicio(cfg, primero.servicio_slug);
  const expira =
    cfg.caducidadActiva && hayMasDetras && minutos > 0
      ? new Date(Date.now() + minutos * 60_000).toISOString()
      : null;

  await (db as any)
    .from("reserva_cola")
    .update({ estado: "ofrecida", ofrecida_at: new Date().toISOString(), expira_at: expira })
    .eq("id", primero.id);

  await notificar(centroId, [
    {
      userId: primero.user_id,
      tipo: "cola_plaza_libre",
      titulo: "Ha quedado una plaza libre",
      mensaje: `Puedes confirmar tu plaza del ${describe(primero.fecha, primero.hora_inicio)}${
        expira ? ` · tienes ${colaTiempoLabel(minutos)} para confirmarla` : ""
      }`,
      sessionId: primero.id,
    },
  ]);
}

/** Caduca las ofertas vencidas y pasa el turno al siguiente de la cola. */
export async function procesarCaducidades(centroId: string): Promise<void> {
  const db = centroDb(centroId);
  const { data } = await (db as any)
    .from("reserva_cola")
    .select("*")
    .eq("estado", "ofrecida")
    .not("expira_at", "is", null)
    .lt("expira_at", new Date().toISOString());
  const vencidas = (data ?? []) as ColaEntry[];
  for (const e of vencidas) {
    await (db as any).from("reserva_cola").update({ estado: "caducada" }).eq("id", e.id);
    await (db as any).from("notificaciones").delete().eq("session_id", e.id);
    await notificar(centroId, [
      {
        userId: e.user_id,
        tipo: "cola_caducada",
        titulo: "Plaza no confirmada a tiempo",
        mensaje: `Se ha ofrecido a la siguiente persona de la cola la plaza del ${describe(e.fecha, e.hora_inicio)}`,
      },
    ]);
    await ofrecerPlazaSiguiente(centroId, e.clave);
  }
}

/** Estado de la cola para cada clave, desde el punto de vista de un cliente. */
export async function colaInfoParaUsuario(
  centroId: string,
  userId: string,
): Promise<Map<string, ColaInfo>> {
  const entries = await activasDelCentro(centroId);
  const porClave = new Map<string, ColaEntry[]>();
  for (const e of entries) {
    const arr = porClave.get(e.clave) ?? [];
    arr.push(e);
    porClave.set(e.clave, arr);
  }
  const out = new Map<string, ColaInfo>();
  for (const [clave, list] of porClave) {
    const idx = list.findIndex((e) => e.user_id === userId);
    const mine = idx >= 0 ? list[idx]! : null;
    out.set(clave, {
      total: list.length,
      posicion: mine ? idx + 1 : null,
      estado: mine ? (mine.estado as "en_cola" | "ofrecida") : null,
      colaId: mine?.id ?? null,
      expiraAt: mine?.expira_at ?? null,
    });
  }
  return out;
}

/** El cliente entra en la cola de una sesión completa. */
export async function apuntarseEnCola(
  userId: string,
  clave: string,
): Promise<{ posicion: number; avisoMin: number | null }> {
  const centroId = await getCentroIdForUser(userId);
  const db = centroDb(centroId);
  const cfg = await getColaConfig(centroId);
  if (!cfg.activa) throw new Error("La cola de espera no está disponible");

  await procesarCaducidades(centroId);

  const info = await slotInfo(centroId, clave);
  if (!info) throw new Error("Esta sesión ya no está disponible");

  const { data: perfil } = await db
    .from("client_profiles")
    .select("client_id,activo")
    .eq("id", userId)
    .maybeSingle();
  const clientId = (perfil as { client_id: string | null; activo: boolean } | null)?.client_id;
  if (!clientId || !perfil?.activo) throw new Error("Cuenta de cliente no activa");

  if (info.userIds.includes(userId) || info.clientIds.includes(clientId)) {
    throw new Error("Ya tienes una reserva en esta sesión");
  }
  if (info.ocupadas < info.capacidad) throw new Error("Todavía quedan plazas libres");

  const { data: existentes } = await (db as any)
    .from("reserva_cola")
    .select("id")
    .eq("clave", clave)
    .in("estado", ["en_cola", "ofrecida"])
    .eq("user_id", userId);
  if ((existentes ?? []).length) throw new Error("Ya estás en la cola de esta sesión");

  const { error } = await (db as any).from("reserva_cola").insert({
    client_id: clientId,
    user_id: userId,
    clave,
    servicio_slug: info.servicioSlug,
    group_id: info.groupId,
    fecha: info.fecha,
    hora_inicio: info.horaInicio,
    hora_fin: info.horaFin,
    estado: "en_cola",
  });
  if (error) throw new Error(error.message);

  const { data: cola } = await (db as any)
    .from("reserva_cola")
    .select("id,user_id,estado,expira_at,servicio_slug,fecha,hora_inicio")
    .eq("clave", clave)
    .in("estado", ["en_cola", "ofrecida"])
    .order("created_at", { ascending: true });
  const lista = (cola ?? []) as ColaEntry[];
  const posicion = lista.findIndex((e) => e.user_id === userId) + 1;

  // Si delante hay una oferta viva sin contador (no tenía a nadie detrás),
  // el plazo de confirmación arranca ahora que existe alguien esperando.
  const oferta = lista.find((e) => e.estado === "ofrecida" && !e.expira_at);
  if (oferta && cfg.caducidadActiva) {
    const minutos = colaTiempoParaServicio(cfg, oferta.servicio_slug ?? info.servicioSlug);
    if (minutos > 0) {
      const expira = new Date(Date.now() + minutos * 60_000).toISOString();
      await (db as any).from("reserva_cola").update({ expira_at: expira }).eq("id", oferta.id);
      await notificar(centroId, [
        {
          userId: oferta.user_id,
          tipo: "cola_plaza_libre",
          titulo: "Alguien más se ha apuntado a la cola",
          mensaje: `Ahora tienes ${colaTiempoLabel(minutos)} para confirmar tu plaza del ${describe(
            oferta.fecha,
            oferta.hora_inicio,
          )}`,
          sessionId: oferta.id,
        },
      ]);
    }
  }

  return {
    posicion: posicion || lista.length,
    avisoMin: cfg.caducidadActiva ? colaTiempoParaServicio(cfg, info.servicioSlug) : null,
  };
}

/** El cliente abandona la cola. Si tenía la plaza ofrecida, pasa al siguiente. */
export async function salirDeCola(userId: string, clave: string): Promise<void> {
  const centroId = await getCentroIdForUser(userId);
  const db = centroDb(centroId);
  const { data } = await (db as any)
    .from("reserva_cola")
    .select("id,estado")
    .eq("clave", clave)
    .eq("user_id", userId)
    .in("estado", ["en_cola", "ofrecida"]);
  const entries = (data ?? []) as { id: string; estado: string }[];
  if (!entries.length) return;
  const teniaOferta = entries.some((e) => e.estado === "ofrecida");
  for (const e of entries) {
    await (db as any).from("reserva_cola").delete().eq("id", e.id);
    await (db as any).from("notificaciones").delete().eq("session_id", e.id);
  }
  if (teniaOferta) await ofrecerPlazaSiguiente(centroId, clave);
}

/** Ofertas de plaza vivas del cliente (para mostrar botones en el buzón). */
export async function misOfertasCola(userId: string): Promise<
  { id: string; clave: string; fecha: string; horaInicio: string; expiraAt: string | null }[]
> {
  let centroId: string;
  try {
    centroId = await getCentroIdForUser(userId);
  } catch {
    return [];
  }
  await procesarCaducidades(centroId);
  const db = centroDb(centroId);
  const { data } = await (db as any)
    .from("reserva_cola")
    .select("id,clave,fecha,hora_inicio,expira_at")
    .eq("user_id", userId)
    .eq("estado", "ofrecida");
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id as string,
    clave: r.clave as string,
    fecha: r.fecha as string,
    horaInicio: r.hora_inicio as string,
    expiraAt: r.expira_at as string | null,
  }));
}

/** El cliente acepta o rechaza la plaza que se le ha ofrecido. */
export async function responderOferta(
  userId: string,
  colaId: string,
  accion: "aceptar" | "rechazar",
): Promise<{ ok: boolean; mensaje?: string }> {
  const centroId = await getCentroIdForUser(userId);
  const db = centroDb(centroId);
  await procesarCaducidades(centroId);

  const { data } = await (db as any)
    .from("reserva_cola")
    .select("*")
    .eq("id", colaId)
    .maybeSingle();
  const entry = data as ColaEntry | null;
  if (!entry || entry.user_id !== userId) throw new Error("Oferta no encontrada");
  if (entry.estado !== "ofrecida") throw new Error("Esta oferta ya no está disponible");

  if (accion === "aceptar") {
    const { bookClassForUser } = await import("./client-portal.server");
    try {
      await bookClassForUser(userId, entry.clave);
    } catch (e) {
      // La plaza se ha perdido (ya completa, fuera de plazo...): cerramos la oferta
      // y se la pasamos al siguiente en vez de romper la pantalla del cliente.
      await (db as any).from("reserva_cola").update({ estado: "caducada" }).eq("id", entry.id);
      await (db as any).from("notificaciones").delete().eq("session_id", entry.id);
      await ofrecerPlazaSiguiente(centroId, entry.clave);
      return {
        ok: false,
        mensaje: e instanceof Error ? e.message : "Ya no hay plaza disponible",
      };
    }
    await (db as any).from("reserva_cola").update({ estado: "aceptada" }).eq("id", entry.id);
    await (db as any).from("notificaciones").delete().eq("session_id", entry.id);
    return { ok: true };
  }

  await (db as any).from("reserva_cola").update({ estado: "rechazada" }).eq("id", entry.id);
  await (db as any).from("notificaciones").delete().eq("session_id", entry.id);
  await ofrecerPlazaSiguiente(centroId, entry.clave);
  return { ok: true };
}

/** Barrido global de caducidades (cron). */
export async function procesarCaducidadesTodosLosCentros(): Promise<{ centros: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("centros").select("id").eq("estado", "activo");
  const centros = (data ?? []) as { id: string }[];
  for (const c of centros) await procesarCaducidades(c.id);
  return { centros: centros.length };
}
