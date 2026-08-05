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
};

async function loadBlocks(from: string, to: string) {
  const [{ data: sessions }, { data: groups }, { data: trainers }] = await Promise.all([
    supabaseAdmin
      .from("sessions")
      .select(
        "id,group_id,fecha,hora_inicio,hora_fin,estado,client_id,trainer_id,titulo,booked_by_user_id,booking_tipo,recurrencia_id,no_contabilizar,por_confirmar",
      )
      .eq("ocupacion", 2)
      .not("group_id", "is", null)
      .gte("fecha", from)
      .lte("fecha", to),
    supabaseAdmin.from("groups").select("id,nombre,capacidad,activo,acceso_clientes"),
    supabaseAdmin.from("trainers").select("id,nombre"),
  ]);

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
  return { blocks, groupById, trainerById };
}

export async function listUpcomingClasses(userId: string): Promise<ClaseGrupal[]> {
  const { from, to } = portalRange();
  const { blocks, groupById, trainerById } = await loadBlocks(from, to);

  const out: ClaseGrupal[] = [];
  for (const [key, rows] of blocks) {
    const first = rows[0];
    const group = first.group_id ? groupById.get(first.group_id) : null;
    if (!group || group.activo === false || group.acceso_clientes === false) continue;
    const mine = rows.find((r) => r.booked_by_user_id === userId) ?? null;
    const trainerId = rows.find((r) => r.trainer_id)?.trainer_id ?? null;
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
      asistida: mine?.estado === "realizada",
      miSesionId: mine?.id ?? null,
    });
  }
  out.sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
  return out;
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
    const { count } = await supabaseAdmin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("estado", "cancelada")
      .gte("fecha", b.fecha_inicio);
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
    const { count } = await supabaseAdmin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("estado", "cancelada")
      .gte("fecha", bono.fecha_inicio);
    base.cancelaciones = count ?? 0;
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
  const trainerById = new Map((trainers ?? []).map((t) => [t.id, t.nombre]));
  return (sessions ?? [])
    .filter((s) => s.estado !== "cancelada")
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
}): Promise<string> {
  const { data: rows } = await supabaseAdmin
    .from("sessions")
    .select(
      "id,group_id,fecha,hora_inicio,hora_fin,estado,client_id,trainer_id,titulo,booked_by_user_id,booking_tipo,recurrencia_id,no_contabilizar,por_confirmar",
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
        por_confirmar: template.por_confirmar,
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return inserted!.id;
}

export async function bookClassForUser(userId: string, key: string): Promise<void> {
  const profile = await getPortalProfile(userId);
  if (!profile) throw new Error("Cuenta de cliente no activa");
  const clientId = await requireClientRow(userId);
  const [groupId, fecha, horaInicio] = key.split("|");
  await addAttendeeToBlock({
    groupId,
    fecha,
    horaInicio,
    clientId,
    bookedByUserId: userId,
    bookingTipo: profile.bonoTipo,
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
      titulo: `Reserva creada por ${profile.nombre}`,
      mensaje: `en ${group?.nombre ?? "Clase grupal"} (${describeSesion(fecha, horaInicio)})`,
    },
  ]);
}

export async function cancelBookingForUser(userId: string, sessionId: string): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from("sessions")
    .select("id,group_id,fecha,hora_inicio,titulo,booked_by_user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!row || row.booked_by_user_id !== userId) throw new Error("Reserva no encontrada");

  const { count } = await supabaseAdmin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("group_id", row.group_id!)
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

  const [profile, { data: group }] = await Promise.all([
    getPortalProfile(userId),
    supabaseAdmin.from("groups").select("nombre").eq("id", row.group_id!).maybeSingle(),
  ]);
  const { crearNotificaciones, describeSesion } = await import("./notificaciones.server");
  await crearNotificaciones([
    {
      targetRole: "admin",
      tipo: "reserva_cancelada_cliente",
      titulo: `Reserva cancelada por ${profile?.nombre ?? "Cliente"}`,
      mensaje: `en ${row.titulo || group?.nombre || "Clase grupal"} (${describeSesion(row.fecha, row.hora_inicio)})`,
    },
  ]);
}