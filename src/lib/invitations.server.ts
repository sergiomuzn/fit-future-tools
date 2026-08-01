import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { BonoTipoCliente } from "./client-portal-types";

export interface InvitationCheck {
  ok: boolean;
  reason?: "not_found" | "expired" | "used" | "revoked";
  nombre?: string | null;
  email?: string | null;
}

export async function checkInvitation(code: string): Promise<InvitationCheck> {
  const { data } = await supabaseAdmin
    .from("client_invitations")
    .select("id,nombre,email,expires_at,used_at,revoked_at")
    .eq("code", code)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  if (data.revoked_at) return { ok: false, reason: "revoked" };
  if (data.used_at) return { ok: false, reason: "used" };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, nombre: data.nombre, email: data.email };
}

export async function acceptInvitation(input: {
  code: string;
  nombre: string;
  email: string;
  password: string;
  bonoTipo: BonoTipoCliente;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = await checkInvitation(input.code);
  if (!check.ok) return { ok: false, error: "El enlace de invitación no es válido o ha caducado" };

  const { data: invitation } = await supabaseAdmin
    .from("client_invitations")
    .select("id")
    .eq("code", input.code)
    .single();

  const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { nombre: input.nombre },
  });
  if (authError || !created?.user) {
    return { ok: false, error: authError?.message ?? "No se pudo crear la cuenta" };
  }
  const userId = created.user.id;

  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .insert([{ nombre: input.nombre, activo: true }])
    .select("id")
    .single();
  if (clientError || !client) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { ok: false, error: clientError?.message ?? "No se pudo crear la ficha de cliente" };
  }

  const { error: profileError } = await supabaseAdmin.from("client_profiles").insert([
    {
      id: userId,
      nombre: input.nombre,
      email: input.email,
      bono_tipo: input.bonoTipo,
      client_id: client.id,
      invitation_id: invitation?.id ?? null,
    },
  ]);
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return { ok: false, error: profileError.message };
  }

  await supabaseAdmin.from("user_roles").insert([{ user_id: userId, role: "cliente" }]);
  await supabaseAdmin
    .from("client_invitations")
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq("code", input.code);

  return { ok: true };
}