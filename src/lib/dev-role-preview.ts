import type { AppRole } from "./roles";

export const DEV_ROLE_STORAGE_KEY = "dev-role-preview";
export const isDevPreview = import.meta.env.DEV;

/** Rol simulado en modo desarrollo (null = rol real del usuario). */
export function getDevRoleOverride(): AppRole | null {
  if (!isDevPreview || typeof window === "undefined") return null;
  const v = window.localStorage.getItem(DEV_ROLE_STORAGE_KEY);
  return v === "admin" || v === "entrenador" || v === "cliente" ? v : null;
}

export function setDevRoleOverride(role: AppRole | null) {
  if (typeof window === "undefined") return;
  if (role) window.localStorage.setItem(DEV_ROLE_STORAGE_KEY, role);
  else window.localStorage.removeItem(DEV_ROLE_STORAGE_KEY);
}

export function homePathForRole(role: AppRole): string {
  if (role === "cliente") return "/cliente";
  return "/";
}
