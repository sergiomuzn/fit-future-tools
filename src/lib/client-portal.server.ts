import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  AccesoCliente,
  BonoResumen,
  BonoTipoCliente,
  ClaseGrupal,
  PortalProfile,
  ResumenCliente,
  SesionPersonal,
} from "./client-portal-types";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

/** Rango: hoy → domingo de la semana actual + 2 semanas. */
export function portalRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = from.getDay(); // 0 = domingo
  const daysToSunday = dow === 0 ? 0 : 7 - dow;
  const to = new Date(from);
  to.setDate(to.getDate() + daysToSunday + 14);
  return { from: iso(from), to: iso(to) };
}

export async function getPortalProfile(userId: string): Promise<PortalProfile | null> {
  const { data } = await supabaseAdmin
    .from("client_profiles")
    .select("id,nombre,email,bono_tipo,activo,acceso")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.activo) return null;
  return {
    id: data.id,
    nombre: data.nombre,
    email: data.email,
    bonoTipo: data.bono_tipo as BonoTipoCliente,
    activo: data.activo,
    acceso: ((data as { acceso?: string }).acceso ?? "grupos") as AccesoCliente,
  };
}

async function requireClientRow(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("client_profiles")
    .select("client_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.client_id) throw new Error("Tu cuenta no tiene ficha de cliente asociada");
  return data.client_id;
}

type Row = {
  id: string;
  group_id: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  client_id: string | null;
  trainer_id: string | null;
  titulo: string | null;
  booked_by_user_id: string | null;
  booking_tipo: string | null;
  recurrencia_id: string | null;
  no_contabilizar: boolean;
  por_confirmar: boolean;
  servicio_slug: string | null;
};

const FALLBACK_SERVICIO_PALETTE = [
  "#3CC0F3", "#7C6CF6", "#F59E0B", "#E959DE", "#14B8A6", "#F43F5E", "#22C55E", "#0EA5E9",
];

function defaultServicioColor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return FALLBACK_SERVICIO_PALETTE[h % FALLBACK_SERVICIO_PALETTE.length];
}

async function loadBlocks(from: string, to: string) {
  const [{ data: sessions }, { data: groups }, { data: trainers }] = await Promise.all([
    supabaseAdmin
      .from("sessions")
      .select(
        "id,group_id,fecha,hora_inicio,hora_fin,estado,client_id,trainer_id,titulo,booked_by_user_id,booking_tipo,recurrencia_id,no_contabilizar,por_confirmar,servicio_slug",
      )
      .eq("ocupacion", 2)
      .not("group_id", "is", null)
      .gte("fecha", from)
      .lte("fecha", to),
    supabaseAdmin.from("groups").select("id,nombre,capacidad,activo,acceso_clientes"),
    supabaseAdmin.from("trainers").select("id,nombre"),
  ]);
  const [{ data: cfgColores }, { data: servicios }] = await Promise.all([
    supabaseAdmin.from("center_config").select("colores").eq("id", true).maybeSingle(),
    supabaseAdmin.from("servicios").select("slug"),
  ]);
  const colores = ((cfgColores as { colores?: Record<string, string> } | null)?.colores) ?? {};
  const slugs = (servicios ?? []).map((s) => s.slug as string);
  const defaultGroupSlug =
    slugs.find((s) => s.includes("grupo")) ?? slugs[0] ?? null;


  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const trainerById = new Map((trainers ?? []).map((t) => [t.id, t]));
  const blocks = new Map<string, Row[]>();
  for (const s of (sessions ?? []) as Row[]) {
    if (s.estado === "cancelada") continue;
    const key = `${s.group_id}|${s.fecha}|${s.hora_inicio}`;
    const arr = blocks.get(key);
    if (arr) arr.push(s);
    else blocks.set(key, [s]);
  }
  return { blocks, groupById, trainerById, colores, defaultGroupSlug };
}

export async function listUpcomingClasses(userId: string): Promise<ClaseGrupal[]> {
  const { from, to } = portalRange();
  const { blocks, groupById, trainerById, colores, defaultGroupSlug } = await loadBlocks(from, to);

  const out: ClaseGrupal[] = [];
  for (const [key, rows] of blocks) {
    const first = rows[0];
    const group = first.group_id ? groupById.get(first.group_id) : null;
    if (!group || group.activo === false || group.acceso_clientes === false) continue;
    const mine = rows.find((r) => r.booked_by_user_id === userId) ?? null;
    const trainerId = rows.find((r) => r.trainer_id)?.trainer_id ?? null;
    const slug =
      rows.find((r) => r.servicio_slug)?.servicio_slug ?? defaultGroupSlug ?? null;
    out.push({
      key,
      groupId: group.id,
      nombre: first.titulo || group.nombre,
      fecha: first.fecha,
      horaInicio: first.hora_inicio.slice(0, 5),
      horaFin: first.hora_fin.slice(0, 5),
      duracionMin: minutesBetween(first.hora_inicio, first.hora_fin),
      entrenador: trainerId ? (trainerById.get(trainerId)?.nombre ?? null) : null,
      capacidad: Math.max(1, group.capacidad ?? 1),
      ocupadas: rows.filter((r) => !!r.client_id).length,
      reservada: !!mine,
      porConfirmar: !!mine?.por_confirmar && mine?.estado === "reservada",
      asistida: mine?.estado === "realizada",
      miSesionId: mine?.id ?? null,
      servicioSlug: slug,
      color: slug ? (colores[`srv:${slug}`] ?? defaultServicioColor(slug)) : null,
    });
  }

  out.push(...(await listPropagatedHuecos(userId)));
  out.sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
  return out;
}

/**
 * Huecos de la semana tipo ya propagados a fechas concretas
 * (`service_slot_instances`): son las sesiones que el cliente puede reservar.
 */
export async function listPropagatedHuecos(userId: string): Promise<ClaseGrupal[]> {
  const { from, to } = portalRange();
  const [{ data: instancias }, { data: sesiones }, { data: trainers }, { data: cfgColores }, { data: servicios }] =
    await Promise.all([
      supabaseAdmin
        .from("service_slot_instances")
        .select("id,servicio_slug,fecha,hora_inicio,hora_fin,capacidad,trainer_id,activo")
        .eq("activo", true)
        .gte("fecha", from)
        .lte("fecha", to),
      supabaseAdmin
        .from("sessions")
        .select("id,fecha,hora_inicio,servicio_slug,client_id,estado,booked_by_user_id,por_confirmar")
        .is("group_id", null)
        .gte("fecha", from)
        .lte("fecha", to)
        .neq("estado", "cancelada"),
      supabaseAdmin.from("trainers").select("id,nombre"),
      supabaseAdmin.from("center_config").select("colores").eq("id", true).maybeSingle(),
      supabaseAdmin.from("servicios").select("slug,nombre"),
    ]);

  const trainerById = new Map((trainers ?? []).map((t) => [t.id, t.nombre as string]));
  const colores = ((cfgColores as { colores?: Record<string, string> } | null)?.colores) ?? {};
  const nombreServicio = new Map(
    (servicios ?? []).map((s) => [s.slug as string, s.nombre as string]),
  );

  type Sesion = {
    id: string;
    fecha: string;
    hora_inicio: string;
    servicio_slug: string | null;
    client_id: string | null;
    estado: string;
    booked_by_user_id: string | null;
    por_confirmar: boolean;
  };
  const sesionesPorHueco = new Map<string, Sesion[]>();
  for (const s of (sesiones ?? []) as Sesion[]) {
    const k = `${s.servicio_slug ?? ""}|${s.fecha}|${s.hora_inicio.slice(0, 5)}`;
    const arr = sesionesPorHueco.get(k) ?? [];
    arr.push(s);
    sesionesPorHueco.set(k, arr);
  }

  return ((instancias ?? []) as {
    id: string;
    servicio_slug: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    capacidad: number;
    trainer_id: string | null;
  }[]).map((h) => {
    const rows = sesionesPorHueco.get(`${h.servicio_slug}|${h.fecha}|${h.hora_inicio.slice(0, 5)}`) ?? [];
    const mine = rows.find((r) => r.booked_by_user_id === userId) ?? null;
    return {
      key: `hueco|${h.id}`,
      groupId: "",
      nombre: nombreServicio.get(h.servicio_slug) ?? h.servicio_slug,
      fecha: h.fecha,
      horaInicio: h.hora_inicio.slice(0, 5),
      horaFin: h.hora_fin.slice(0, 5),
      duracionMin: minutesBetween(h.hora_inicio, h.hora_fin),
      entrenador: h.trainer_id ? (trainerById.get(h.trainer_id) ?? null) : null,
      capacidad: Math.max(1, h.capacidad ?? 1),
      ocupadas: rows.filter((r) => !!r.client_id).length,
      reservada: !!mine,
      porConfirmar: !!mine?.por_confirmar && mine?.estado === "reservada",
      asistida: mine?.estado === "realizada",
      miSesionId: mine?.id ?? null,
      servicioSlug: h.servicio_slug,
      color: colores[`srv:${h.servicio_slug}`] ?? defaultServicioColor(h.servicio_slug),
    } satisfies ClaseGrupal;
  });
}

export async function listMyBookings(userId: string): Promise<ClaseGrupal[]> {
  return (await listUpcomingClasses(userId)).filter((c) => c.reservada);
}


/** Resumen del cliente: bono, último pago, próxima sesión y cancelaciones. */
const DEFAULT_TIPO_COLORES: Record<string, string> = {
  individual: "#3b82f6",
  pareja: "#a855f7",
  grupal: "#f59e0b",
  gympass: "#ec4899",
  prueba: "#1CDB14",
};

/** Todos los bonos activos del cliente, con servicio, tipo y color configurado. */
async function listActiveBonos(clientId: string): Promise<BonoResumen[]> {
  const [{ data: bonos }, { data: cfg }, { data: servicios }] = await Promise.all([
    supabaseAdmin
      .from("client_bonos")
      .select("id,fecha_inicio,sesiones_disponibles,sesiones_realizadas,ultimo_bono_nombre,bono_catalogo_id")
      .eq("client_id", clientId)
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("center_config").select("colores").eq("id", true).maybeSingle(),
    supabaseAdmin.from("servicios").select("slug,nombre"),
  ]);
  if (!bonos?.length) return [];

  const colores: Record<string, string> = {
    ...DEFAULT_TIPO_COLORES,
    ...(((cfg as { colores?: Record<string, string> } | null)?.colores) ?? {}),
  };
  const servicioBySlug = new Map((servicios ?? []).map((s) => [s.slug, s.nombre]));

  const catIds = bonos.map((b) => b.bono_catalogo_id).filter((v): v is string => !!v);
  const catById = new Map<string, { nombre: string; tipo: string; servicio_slug: string }>();
  if (catIds.length) {
    const { data: cats } = await supabaseAdmin
      .from("bonos_catalogo")
      .select("id,nombre,tipo,servicio_slug")
      .in("id", catIds);
    for (const c of cats ?? []) catById.set(c.id, c);
  }

  const out: BonoResumen[] = [];
  for (const b of bonos) {
    const cat = b.bono_catalogo_id ? catById.get(b.bono_catalogo_id) : null;
    const [{ count }, { count: countNC }] = await Promise.all([
      supabaseAdmin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("estado", "cancelada")
        .eq("no_contabilizar", false)
        .gte("fecha", b.fecha_inicio),
      supabaseAdmin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("estado", "cancelada")
        .eq("no_contabilizar", true)
        .gte("fecha", b.fecha_inicio),
    ]);
    out.push({
      id: b.id,
      servicio: cat ? (servicioBySlug.get(cat.servicio_slug) ?? cat.servicio_slug) : null,
      tipo: cat?.tipo ?? null,
      nombre: cat?.nombre ?? b.ultimo_bono_nombre ?? null,
      color: cat?.tipo ? (colores[cat.tipo] ?? null) : null,
      fechaInicio: b.fecha_inicio,
      sesionesRestantes: b.sesiones_disponibles,
      sesionesRealizadas: b.sesiones_realizadas,
      cancelaciones: count ?? 0,
      cancelacionesNC: countNC ?? 0,
    });
  }
  return out;
}

export async function getClientSummary(userId: string): Promise<ResumenCliente> {
  const { data: prof } = await supabaseAdmin
    .from("client_profiles")
    .select("nombre,email,client_id")
    .eq("id", userId)
    .maybeSingle();
  if (!prof) throw new Error("Cuenta de cliente no activa");

  const clientId = prof.client_id;
  const base: ResumenCliente = {
    nombre: prof.nombre,
    email: prof.email,
    telefono: null,
    bonoNombre: null,
    bonoTipo: null,
    ultimoPago: null,
    sesionesRestantes: null,
    sesionesRealizadas: null,
    proximaSesion: null,
    cancelaciones: 0,
    cancelacionesNC: 0,
    bonos: [],
  };
  if (!clientId) return base;

  const hoy = iso(new Date());
  const [{ data: cli }, { data: bono }, { data: invoice }, { data: proximas }, { data: groups }] =
    await Promise.all([
      supabaseAdmin.from("clients").select("telefono,email").eq("id", clientId).maybeSingle(),
      supabaseAdmin
        .from("client_bonos")
        .select("id,fecha_inicio,sesiones_disponibles,sesiones_realizadas,ultimo_bono_nombre,bono_catalogo_id")
        .eq("client_id", clientId)
        .eq("activo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("invoices")
        .select("fecha")
        .eq("client_id", clientId)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("sessions")
        .select("fecha,hora_inicio,titulo,group_id,estado")
        .eq("client_id", clientId)
        .gte("fecha", hoy)
        .neq("estado", "cancelada")
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true })
        .limit(5),
      supabaseAdmin.from("groups").select("id,nombre"),
    ]);

  base.telefono = cli?.telefono ?? null;
  if (cli?.email) base.email = cli.email;
  base.ultimoPago = invoice?.fecha ?? null;

  if (bono) {
    base.sesionesRestantes = bono.sesiones_disponibles;
    base.sesionesRealizadas = bono.sesiones_realizadas;
    base.bonoNombre = bono.ultimo_bono_nombre;
    if (bono.bono_catalogo_id) {
      const { data: cat } = await supabaseAdmin
        .from("bonos_catalogo")
        .select("nombre,tipo")
        .eq("id", bono.bono_catalogo_id)
        .maybeSingle();
      if (cat) {
        base.bonoNombre = cat.nombre;
        base.bonoTipo = cat.tipo;
      }
    }
    const [{ count }, { count: countNC }] = await Promise.all([
      supabaseAdmin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("estado", "cancelada")
        .eq("no_contabilizar", false)
        .gte("fecha", bono.fecha_inicio),
      supabaseAdmin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("estado", "cancelada")
        .eq("no_contabilizar", true)
        .gte("fecha", bono.fecha_inicio),
    ]);
    base.cancelaciones = count ?? 0;
    base.cancelacionesNC = countNC ?? 0;
  }

  base.bonos = await listActiveBonos(clientId);

  const groupById = new Map((groups ?? []).map((g) => [g.id, g.nombre]));
  const next = (proximas ?? [])[0];
  if (next) {
    base.proximaSesion = {
      fecha: next.fecha,
      horaInicio: next.hora_inicio.slice(0, 5),
      nombre:
        next.titulo ||
        (next.group_id ? (groupById.get(next.group_id) ?? "Clase grupal") : "Entrenamiento personal"),
    };
  }
  return base;
}

/** Sesiones de entrenamiento personal (no grupales) del cliente. */
export async function listMyPersonalSessions(userId: string): Promise<SesionPersonal[]> {
  const clientId = await requireClientRow(userId);
  const { from, to } = portalRange();
  const [{ data: sessions }, { data: trainers }] = await Promise.all([
    supabaseAdmin
      .from("sessions")
      .select("id,fecha,hora_inicio,hora_fin,estado,titulo,trainer_id,por_confirmar,group_id")
      .eq("client_id", clientId)
      .is("group_id", null)
      .gte("fecha", from)
      .lte("fecha", to),
    supabaseAdmin.from("trainers").select("id,nombre"),
  ]);
  const { data: cfgColores } = await supabaseAdmin
    .from("center_config")
    .select("colores")
    .eq("id", true)
    .maybeSingle();
  const colores = ((cfgColores as { colores?: Record<string, string> } | null)?.colores) ?? {};
  const trainerById = new Map((trainers ?? []).map((t) => [t.id, t.nombre]));
  return (sessions ?? [])
    .map((s) => ({
      id: s.id,
      fecha: s.fecha,
      horaInicio: s.hora_inicio.slice(0, 5),
      horaFin: s.hora_fin.slice(0, 5),
      duracionMin: minutesBetween(s.hora_inicio, s.hora_fin),
      titulo: s.titulo,
      entrenador: s.trainer_id ? (trainerById.get(s.trainer_id) ?? null) : null,
      estado: s.estado,
      porConfirmar: !!s.por_confirmar,
    }))
    .sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
}

/** Añade un asistente a un bloque de clase grupal. Devuelve el id de sesión creada. */
export async function addAttendeeToBlock(params: {
  groupId: string;
  fecha: string;
  horaInicio: string;
  clientId: string;
  bookedByUserId: string | null;
  bookingTipo: BonoTipoCliente;
  porConfirmar?: boolean;
}): Promise<string> {
  const { data: rows } = await supabaseAdmin
    .from("sessions")
    .select(
      "id,group_id,fecha,hora_inicio,hora_fin,estado,client_id,trainer_id,titulo,booked_by_user_id,booking_tipo,recurrencia_id,no_contabilizar,por_confirmar,servicio_slug",
    )
    .eq("group_id", params.groupId)
    .eq("fecha", params.fecha)
    .eq("hora_inicio", params.horaInicio);

  const block = ((rows ?? []) as Row[]).filter((r) => r.estado !== "cancelada");
  if (!block.length) throw new Error("La clase ya no existe");

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("capacidad")
    .eq("id", params.groupId)
    .maybeSingle();
  const capacidad = Math.max(1, group?.capacidad ?? 1);
  const ocupadas = block.filter((r) => !!r.client_id).length;
  if (ocupadas >= capacidad) throw new Error("La clase está completa");
  if (block.some((r) => r.client_id === params.clientId)) throw new Error("Ya estás en esta clase");

  const template = block[0];
  const placeholder = block.find((r) => !r.client_id);
  const payload = {
    client_id: params.clientId,
    booked_by_user_id: params.bookedByUserId,
    booking_tipo: params.bookingTipo,
    ...(params.porConfirmar ? { por_confirmar: true, estado: "reservada" as never } : {}),
  };

  if (placeholder) {
    const { error } = await supabaseAdmin.from("sessions").update(payload).eq("id", placeholder.id);
    if (error) throw new Error(error.message);
    return placeholder.id;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("sessions")
    .insert([
      {
        ...payload,
        group_id: params.groupId,
        fecha: params.fecha,
        hora_inicio: template.hora_inicio,
        hora_fin: template.hora_fin,
        estado: template.estado as never,
        ocupacion: 2,
        titulo: template.titulo,
        trainer_id: template.trainer_id,
        recurrencia_id: template.recurrencia_id,
        no_contabilizar: template.no_contabilizar,
        por_confirmar: params.porConfirmar ? true : template.por_confirmar,
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return inserted!.id;
}

/** ¿La reserva de este bloque necesita confirmación del admin? */
async function bookingNeedsConfirmation(
  groupId: string,
  fecha: string,
  horaInicio: string,
): Promise<boolean> {
  const { parseConfirmacionReservas, requiereConfirmacion } = await import("./booking-confirmation");
  const [{ data: cfg }, { data: rows }] = await Promise.all([
    supabaseAdmin.from("center_config").select("avisos").eq("id", true).maybeSingle(),
    supabaseAdmin
      .from("sessions")
      .select("servicio_slug")
      .eq("group_id", groupId)
      .eq("fecha", fecha)
      .eq("hora_inicio", horaInicio),
  ]);
  const conf = parseConfirmacionReservas(
    (((cfg as { avisos?: Record<string, unknown> } | null)?.avisos ?? {}) as {
      confirmacion_reservas?: unknown;
    }).confirmacion_reservas,
  );
  const slug =
    (rows ?? []).map((r) => (r as { servicio_slug: string | null }).servicio_slug).find(Boolean) ??
    null;
  return requiereConfirmacion(conf, slug);
}

/** Reserva de un hueco propagado (`service_slot_instances`). */
async function bookHuecoForUser(
  userId: string,
  clientId: string,
  profile: PortalProfile,
  instanceId: string,
): Promise<void> {
  const { data: hueco } = await supabaseAdmin
    .from("service_slot_instances")
    .select("id,servicio_slug,fecha,hora_inicio,hora_fin,capacidad,trainer_id,activo")
    .eq("id", instanceId)
    .maybeSingle();
  if (!hueco || hueco.activo === false) throw new Error("Este hueco ya no está disponible");

  const { data: existentes } = await supabaseAdmin
    .from("sessions")
    .select("id,client_id,booked_by_user_id")
    .is("group_id", null)
    .eq("fecha", hueco.fecha)
    .eq("hora_inicio", hueco.hora_inicio)
    .eq("servicio_slug", hueco.servicio_slug)
    .neq("estado", "cancelada");
  const rows = (existentes ?? []) as { id: string; client_id: string | null; booked_by_user_id: string | null }[];
  if (rows.some((r) => r.booked_by_user_id === userId)) throw new Error("Ya tienes esta reserva");
  if (rows.filter((r) => !!r.client_id).length >= Math.max(1, hueco.capacidad ?? 1)) {
    throw new Error("Este hueco está completo");
  }

  const { parseConfirmacionReservas, requiereConfirmacion } = await import("./booking-confirmation");
  const { data: cfg } = await supabaseAdmin
    .from("center_config")
    .select("avisos")
    .eq("id", true)
    .maybeSingle();
  const conf = parseConfirmacionReservas(
    (((cfg as { avisos?: Record<string, unknown> } | null)?.avisos ?? {}) as {
      confirmacion_reservas?: unknown;
    }).confirmacion_reservas,
  );
  const porConfirmar = requiereConfirmacion(conf, hueco.servicio_slug);


  const { error } = await supabaseAdmin.from("sessions").insert({
    client_id: clientId,
    trainer_id: hueco.trainer_id,
    fecha: hueco.fecha,
    hora_inicio: hueco.hora_inicio,
    hora_fin: hueco.hora_fin,
    estado: "reservada",
    ocupacion: 1,
    servicio_slug: hueco.servicio_slug,
    booked_by_user_id: userId,
    booking_tipo: profile.bonoTipo,
    por_confirmar: porConfirmar,
  });
  if (error) throw new Error(error.message);

  const { crearNotificaciones, describeSesion } = await import("./notificaciones.server");
  await crearNotificaciones([
    {
      targetRole: "admin",
      tipo: "reserva_creada",
      titulo: porConfirmar
        ? `Reserva pendiente de confirmar de ${profile.nombre}`
        : `Reserva creada por ${profile.nombre}`,
      mensaje: `en ${hueco.servicio_slug} (${describeSesion(hueco.fecha, hueco.hora_inicio)})`,
    },
  ]);
}

export async function bookClassForUser(userId: string, key: string): Promise<void> {

  const profile = await getPortalProfile(userId);
  if (!profile) throw new Error("Cuenta de cliente no activa");
  const clientId = await requireClientRow(userId);

  if (key.startsWith("hueco|")) {
    await bookHuecoForUser(userId, clientId, profile, key.slice("hueco|".length));
    return;
  }

  const [groupId, fecha, horaInicio] = key.split("|");
  const porConfirmar = await bookingNeedsConfirmation(groupId, fecha, horaInicio);

  await addAttendeeToBlock({
    groupId,
    fecha,
    horaInicio,
    clientId,
    bookedByUserId: userId,
    bookingTipo: profile.bonoTipo,
    porConfirmar,
  });

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("nombre")
    .eq("id", groupId)
    .maybeSingle();
  const { crearNotificaciones, describeSesion } = await import("./notificaciones.server");
  await crearNotificaciones([
    {
      targetRole: "admin",
      tipo: "reserva_creada",
      titulo: porConfirmar
        ? `Reserva pendiente de confirmar de ${profile.nombre}`
        : `Reserva creada por ${profile.nombre}`,
      mensaje: `en ${group?.nombre ?? "Clase grupal"} (${describeSesion(fecha, horaInicio)})`,
    },
  ]);
}

export async function cancelBookingForUser(userId: string, sessionId: string): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from("sessions")
    .select("id,group_id,fecha,hora_inicio,titulo,servicio_slug,booked_by_user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!row || row.booked_by_user_id !== userId) throw new Error("Reserva no encontrada");

  if (!row.group_id) {
    // Reserva de un hueco propagado: se elimina la sesión, el hueco vuelve a ofertarse.
    await supabaseAdmin.from("sessions").delete().eq("id", sessionId);
  } else {
    const { count } = await supabaseAdmin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("group_id", row.group_id)
      .eq("fecha", row.fecha)
      .eq("hora_inicio", row.hora_inicio);

    if ((count ?? 0) <= 1) {
      // Mantener el bloque en la agenda como plaza libre.
      await supabaseAdmin
        .from("sessions")
        .update({ client_id: null, booked_by_user_id: null, booking_tipo: null })
        .eq("id", sessionId);
    } else {
      await supabaseAdmin.from("sessions").delete().eq("id", sessionId);
    }
  }

  const [profile, { data: group }] = await Promise.all([
    getPortalProfile(userId),
    row.group_id
      ? supabaseAdmin.from("groups").select("nombre").eq("id", row.group_id).maybeSingle()
      : Promise.resolve({ data: null as { nombre: string } | null }),
  ]);

  const { crearNotificaciones, describeSesion } = await import("./notificaciones.server");
  await crearNotificaciones([
    {
      targetRole: "admin",
      tipo: "reserva_cancelada_cliente",
      titulo: `Reserva cancelada por ${profile?.nombre ?? "Cliente"}`,
      mensaje: `en ${row.titulo || group?.nombre || row.servicio_slug || "Sesión"} (${describeSesion(row.fecha, row.hora_inicio)})`,
    },
  ]);
}
/** Preferencias del centro que afectan a la vista del cliente. */
export async function getPortalPrefs(): Promise<{
  clienteVeCanceladas: boolean;
  canceladasNCSumanTotal: boolean;
}> {
  const { data } = await supabaseAdmin
    .from("center_config")
    .select("avisos")
    .eq("id", true)
    .maybeSingle();
  const avisos = ((data as { avisos?: Record<string, unknown> } | null)?.avisos ?? {}) as {
    cliente_ve_canceladas?: boolean;
    canceladas_nc_suman?: boolean;
  };
  return {
    clienteVeCanceladas: avisos.cliente_ve_canceladas ?? false,
    canceladasNCSumanTotal: avisos.canceladas_nc_suman ?? false,
  };
}

/* ------------------------------------------------------------------ */
/* Huecos de reserva según el modo configurado                         */
/* ------------------------------------------------------------------ */

export interface HuecoDisponible {
  id: string;
  servicio_slug: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  capacidad: number;
  activo: boolean;
  nota: string | null;
  trainer_id: string | null;
}

/**
 * Devuelve los huecos visibles para el cliente aplicando el modo de reservas.
 * Cada hueco se evalúa contra la próxima ocurrencia de su día dentro de 7 días.
 */
export async function listHuecosDisponibles(
  slugs: string[],
): Promise<{ modo: string; slots: HuecoDisponible[] }> {
  const { parseBookingMode, slotVisibleForMode } = await import("./booking-mode");

  const { data: cfg } = await supabaseAdmin
    .from("center_config")
    .select("avisos")
    .eq("id", true)
    .maybeSingle();
  const modo = parseBookingMode(
    (((cfg as { avisos?: Record<string, unknown> } | null)?.avisos ?? {}) as { modo_reservas?: string })
      .modo_reservas,
  );

  let q = supabaseAdmin
    .from("service_slots")
    .select("id,servicio_slug,dia_semana,hora_inicio,hora_fin,capacidad,activo,nota,trainer_id")
    .eq("activo", true)
    .order("dia_semana")
    .order("hora_inicio");
  if (slugs.length > 0) q = q.in("servicio_slug", slugs);
  const { data } = await q;
  const slots = (data ?? []) as HuecoDisponible[];

  if (modo === "independiente" || slots.length === 0) return { modo, slots };

  // Próxima ocurrencia (hoy incluido) de cada día de la semana
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateByDow = new Map<number, string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (!dateByDow.has(d.getDay())) dateByDow.set(d.getDay(), iso(d));
  }
  const fechas = Array.from(dateByDow.values());

  const { data: sesiones } = await supabaseAdmin
    .from("sessions")
    .select("fecha,hora_inicio,hora_fin,estado")
    .in("fecha", fechas)
    .neq("estado", "cancelada");

  const byFecha = new Map<string, { inicio: string; fin: string }[]>();
  for (const s of (sesiones ?? []) as { fecha: string; hora_inicio: string; hora_fin: string }[]) {
    const arr = byFecha.get(s.fecha) ?? [];
    arr.push({ inicio: s.hora_inicio, fin: s.hora_fin });
    byFecha.set(s.fecha, arr);
  }

  const visibles = slots.filter((s) => {
    const fecha = dateByDow.get(s.dia_semana);
    const sesionesDia = fecha ? (byFecha.get(fecha) ?? []) : [];
    return slotVisibleForMode({ inicio: s.hora_inicio, fin: s.hora_fin }, sesionesDia, modo);
  });

  return { modo, slots: visibles };
}
