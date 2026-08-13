import { formatNameTitle } from "@/lib/utils";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AccesoCliente, BonoTipoCliente } from "./client-portal-types";

export interface InvitationCheck {
  ok: boolean;
  reason?: "not_found" | "expired" | "used" | "revoked";
  nombre?: string | null;
  email?: string | null;
  acceso?: AccesoCliente;
  existente?: boolean;
  telefono?: string | null;
}

export async function checkInvitation(code: string): Promise<InvitationCheck> {
  const { data } = await supabaseAdmin
    .from("client_invitations")
    .select("id,nombre,email,expires_at,used_at,revoked_at,acceso,client_id")
    .eq("code", code)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  if (data.revoked_at) return { ok: false, reason: "revoked" };
  if (data.used_at) return { ok: false, reason: "used" };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  const clientId = (data as { client_id?: string | null }).client_id ?? null;
  let telefono: string | null = null;
  if (clientId) {
    const { data: c } = await supabaseAdmin
      .from("clients")
      .select("telefono,email,nombre")
      .eq("id", clientId)
      .maybeSingle();
    telefono = c?.telefono ?? null;
  }
  return {
    ok: true,
    nombre: data.nombre,
    email: data.email,
    acceso: ((data as { acceso?: string }).acceso ?? "grupos") as AccesoCliente,
    existente: Boolean(clientId),
    telefono,
  };
}

export async function acceptInvitation(input: {
  code: string;
  nombre: string;
  apellido: string;
  telefono?: string;
  email: string;
  password: string;
  bonoTipo?: BonoTipoCliente;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = await checkInvitation(input.code);
  if (!check.ok) return { ok: false, error: "El enlace de invitación no es válido o ha caducado" };

  const fullName = formatNameTitle(`${input.nombre} ${input.apellido}`.trim());

  const { data: invitation } = await supabaseAdmin
    .from("client_invitations")
    .select("id,acceso,client_id")
    .eq("code", input.code)
    .single();
  const existingClientId = (invitation as { client_id?: string | null } | null)?.client_id ?? null;

  const emailNorm = input.email.trim().toLowerCase();

  // El correo no puede pertenecer a otra ficha de cliente distinta a la invitada
  const { data: otherClients } = await supabaseAdmin
    .from("clients")
    .select("id")
    .ilike("email", emailNorm);
  const conflicting = (otherClients ?? []).filter((c) => c.id !== existingClientId);
  if (conflicting.length > 0) {
    return { ok: false, error: "Ese correo ya está registrado en otro cliente" };
  }

  let userId: string | null = null;
  let createdNewUser = false;
  const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: emailNorm,
    password: input.password,
    email_confirm: false,
    user_metadata: { nombre: fullName, telefono: input.telefono },
  });
  if (created?.user) {
    userId = created.user.id;
    createdNewUser = true;
  } else {
    // Puede existir una cuenta huérfana con ese correo (intento anterior sin acceso activo)
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = list?.users?.find((u) => (u.email ?? "").toLowerCase() === emailNorm);
    if (!existingUser) {
      return { ok: false, error: authError?.message ?? "No se pudo crear la cuenta" };
    }
    const { data: existingProfile } = await supabaseAdmin
      .from("client_profiles")
      .select("id")
      .eq("id", existingUser.id)
      .maybeSingle();
    if (existingProfile) {
      return { ok: false, error: "Ese correo ya tiene un acceso activo" };
    }
    const { error: updUserError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password: input.password,
      user_metadata: { nombre: fullName, telefono: input.telefono },
    });
    if (updUserError) return { ok: false, error: updUserError.message };
    userId = existingUser.id;
  }

  const cleanupUser = async () => {
    if (createdNewUser && userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  };

  let clientId = existingClientId;
  if (clientId) {
    const { error: updError } = await supabaseAdmin
      .from("clients")
      .update({
        ...(input.telefono?.trim() ? { telefono: input.telefono.trim() } : {}),
        email: input.email,
        activo: true,
      })
      .eq("id", clientId);
    if (updError) {
      await cleanupUser();
      return { ok: false, error: updError.message };
    }
  } else {
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert([{ nombre: fullName, telefono: input.telefono?.trim() || null, email: input.email, activo: true }])
      .select("id")
      .single();
    if (clientError || !client) {
      await cleanupUser();
      return { ok: false, error: clientError?.message ?? "No se pudo crear la ficha de cliente" };
    }
    clientId = client.id;
  }

  const { error: profileError } = await supabaseAdmin.from("client_profiles").insert([
    {
      id: userId,
      nombre: fullName,
      email: input.email,
      bono_tipo: input.bonoTipo ?? "grupal_directo",
      client_id: clientId,
      invitation_id: invitation?.id ?? null,
      acceso: (invitation as { acceso?: string } | null)?.acceso ?? "grupos",
    },
  ]);
  if (profileError) {
    await cleanupUser();
    return { ok: false, error: profileError.message };
  }

  const { data: existingRole } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "cliente")
    .maybeSingle();
  if (!existingRole) {
    await supabaseAdmin.from("user_roles").insert([{ user_id: userId, role: "cliente" }]);
  }
  await supabaseAdmin
    .from("client_invitations")
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq("code", input.code);

  return { ok: true };
}