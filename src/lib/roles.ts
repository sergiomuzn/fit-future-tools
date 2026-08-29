import { supabase } from "@/integrations/supabase/client";
import { getDevRoleOverride } from "@/lib/dev-role-preview";
import { getMyRole } from "@/lib/roles.functions";

export type AppRole = "admin" | "entrenador" | "cliente";

/**
 * Devuelve los roles del usuario autenticado, verificados en el servidor
 * (vacío si no hay sesión). La simulación de rol en preview nunca puede
 * conceder permisos que el usuario no tenga realmente.
 */
export async function fetchMyRoles(): Promise<AppRole[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return [];

  let real: AppRole[] = [];
  try {
    const { role } = await getMyRole();
    if (role) real = [role];
  } catch {
    real = [];
  }
  if (real.length === 0) {
    // Fallback de solo lectura sobre las propias filas (RLS lo restringe al usuario)
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    real = ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
  }

  const override = getDevRoleOverride();
  // La simulación solo puede reducir permisos, nunca elevarlos
  if (override && real.includes(override)) return [override];
  return real;
}

/** Ruta inicial según el rol: administrador → gestión, cliente → portal. */
export async function homePathForCurrentUser(): Promise<string> {
  const roles = await fetchMyRoles();
  if (roles.includes("admin")) return "/";
  if (roles.includes("cliente")) return "/cliente";
  return "/cliente";
}

/** true si el usuario autenticado tiene rol de administración. */
export async function isAdminUser(): Promise<boolean> {
  return (await fetchMyRoles()).includes("admin");
}
