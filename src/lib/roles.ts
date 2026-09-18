import { supabase } from "@/integrations/supabase/client";
import { getDevRoleOverride } from "@/lib/dev-role-preview";
import { getMyRole } from "@/lib/roles.functions";

export type AppRole = "superadmin" | "admin" | "entrenador" | "cliente";

/**
 * Caché en memoria de los roles del usuario. Evita una llamada al servidor en
 * cada cambio de apartado (la navegación entre pestañas debe ser inmediata).
 */
let rolesCache: { key: string; at: number; value: Promise<AppRole[]> } | null = null;
const ROLES_TTL_MS = 5 * 60 * 1000;

/** Olvida los roles cacheados (al iniciar/cerrar sesión o cambiar el rol simulado). */
export function clearRolesCache() {
  rolesCache = null;
}

/**
 * Devuelve los roles del usuario autenticado, verificados en el servidor
 * (vacío si no hay sesión). La simulación de rol en preview nunca puede
 * conceder permisos que el usuario no tenga realmente.
 */
export async function fetchMyRoles(): Promise<AppRole[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) {
    rolesCache = null;
    return [];
  }

  const key = `${user.id}|${getDevRoleOverride() ?? ""}`;
  const now = Date.now();
  if (rolesCache && rolesCache.key === key && now - rolesCache.at < ROLES_TTL_MS) {
    return rolesCache.value;
  }
  const value = loadRoles(user.id).catch((e) => {
    if (rolesCache?.key === key) rolesCache = null;
    throw e;
  });
  rolesCache = { key, at: now, value };
  return value;
}

async function loadRoles(userId: string): Promise<AppRole[]> {
  const user = { id: userId };


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

/** Ruta inicial según el rol: plataforma, gestión del centro o portal de cliente. */
export async function homePathForCurrentUser(): Promise<string> {
  const roles = await fetchMyRoles();
  if (roles.includes("superadmin")) return "/superadmin";
  if (roles.includes("admin")) return "/";
  if (roles.includes("cliente")) return "/cliente";
  return "/cliente";
}

/** true si el usuario autenticado tiene rol de administración. */
export async function isAdminUser(): Promise<boolean> {
  const roles = await fetchMyRoles();
  return roles.includes("admin") || roles.includes("superadmin");
}
