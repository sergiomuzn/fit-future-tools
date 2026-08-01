import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "entrenador" | "cliente";

/** Devuelve los roles del usuario autenticado (vacío si no hay sesión). */
export async function fetchMyRoles(): Promise<AppRole[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return [];
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
}

/** Ruta inicial según el rol: administrador → gestión, cliente → clases. */
export async function homePathForCurrentUser(): Promise<string> {
  const roles = await fetchMyRoles();
  if (roles.includes("cliente") && !roles.includes("admin")) return "/cliente";
  return "/";
}