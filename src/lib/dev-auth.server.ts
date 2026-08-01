import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AppRole } from "./roles";

/** Usuarios de prueba fijos para la previsualización (nunca en producción). */
export const DEV_USERS: Record<"admin" | "cliente", { email: string; password: string; nombre: string }> = {
  admin: { email: "preview-admin@fitness360.dev", password: "Preview-Admin-2026!", nombre: "Admin Preview" },
  cliente: { email: "preview-cliente@fitness360.dev", password: "Preview-Cliente-2026!", nombre: "Cliente Preview" },
};

/** Solo local o previews de Lovable; en el dominio publicado devuelve false. */
export function isPreviewHost(): boolean {
  const req = getRequest();
  const host = (req?.headers.get("host") ?? "").toLowerCase();
  if (!host) return false;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;
  if (host.includes("id-preview--")) return true;
  if (host.endsWith(".lovableproject.com")) return true;
  if (host.includes("-dev.lovable.app")) return true;
  return false;
}

async function findUserByEmail(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return found?.id ?? null;
}

async function ensureClienteProfile(userId: string, email: string, nombre: string) {
  const { data: existing } = await supabaseAdmin
    .from("client_profiles")
    .select("id,client_id")
    .eq("id", userId)
    .maybeSingle();

  let clientId = existing?.client_id ?? null;
  if (!clientId) {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("nombre", nombre)
      .maybeSingle();
    clientId = client?.id ?? null;
    if (!clientId) {
      const { data: created } = await supabaseAdmin
        .from("clients")
        .insert({ nombre, activo: true })
        .select("id")
        .single();
      clientId = created?.id ?? null;
    }
  }

  await supabaseAdmin
    .from("client_profiles")
    .upsert({ id: userId, nombre, email, bono_tipo: "grupal_directo", client_id: clientId, activo: true });
}

/** Crea (si hace falta) el usuario de prueba, fija su rol e inicia sesión. */
export async function devSignIn(role: Exclude<AppRole, "entrenador">) {
  const cfg = DEV_USERS[role];
  let userId = await findUserByEmail(cfg.email);

  if (!userId) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: cfg.email,
      password: cfg.password,
      email_confirm: true,
      user_metadata: { nombre: cfg.nombre, preview: true },
    });
    if (error) throw new Error(error.message);
    userId = data.user!.id;
  } else {
    await supabaseAdmin.auth.admin.updateUserById(userId, { password: cfg.password, email_confirm: true });
  }

  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });

  if (role === "cliente") await ensureClienteProfile(userId, cfg.email, cfg.nombre);

  const anon = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email: cfg.email,
    password: cfg.password,
  });
  if (signInError || !signIn.session) throw new Error(signInError?.message ?? "No se pudo iniciar sesión de prueba");

  return {
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
  };
}
