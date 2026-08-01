import { createHmac, timingSafeEqual } from "crypto";
import { addAttendeeToBlock } from "./client-portal.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { BonoTipoCliente } from "./client-portal-types";

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Procesa una reserva entrante de Wellhub / Claspass.
 * Payload esperado: { fecha: "YYYY-MM-DD", hora: "HH:MM", nombre: string, group_id?: string }
 */
export async function handleProviderBooking(params: {
  request: Request;
  provider: "wellhub" | "claspass";
  secret: string;
}): Promise<Response> {
  const body = await params.request.text();
  const signature =
    params.request.headers.get("x-webhook-signature") ?? params.request.headers.get("x-signature");
  if (!verifySignature(body, signature, params.secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: { fecha?: string; hora?: string; nombre?: string; group_id?: string };
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const { fecha, hora, nombre, group_id } = payload;
  if (!fecha || !hora || !nombre) return new Response("Missing fields", { status: 400 });

  const horaInicio = hora.length === 5 ? `${hora}:00` : hora;

  let groupId = group_id ?? null;
  if (!groupId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select("group_id")
      .eq("fecha", fecha)
      .eq("hora_inicio", horaInicio)
      .eq("ocupacion", 2)
      .not("group_id", "is", null)
      .limit(1)
      .maybeSingle();
    groupId = data?.group_id ?? null;
  }
  if (!groupId) return new Response("Class not found", { status: 404 });

  // Ficha de cliente: reutiliza por nombre o crea una nueva.
  const { data: existing } = await supabaseAdmin
    .from("clients")
    .select("id")
    .ilike("nombre", nombre)
    .limit(1)
    .maybeSingle();
  let clientId = existing?.id ?? null;
  if (!clientId) {
    const { data: created, error } = await supabaseAdmin
      .from("clients")
      .insert([{ nombre, activo: true }])
      .select("id")
      .single();
    if (error || !created) return new Response("Client error", { status: 500 });
    clientId = created.id;
  }

  try {
    await addAttendeeToBlock({
      groupId,
      fecha,
      horaInicio,
      clientId,
      bookedByUserId: null,
      bookingTipo: params.provider as BonoTipoCliente,
    });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 409 });
  }
  return Response.json({ ok: true, processed: true, provider: params.provider });
}