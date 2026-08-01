import type { AppRole } from "./roles";

export const DEV_ROLE_STORAGE_KEY = "dev-role-preview";

function hostIsPreview(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.includes("id-preview--") ||
    h.endsWith(".lovableproject.com") ||
    h.includes("-dev.lovable.app")
  );
}

/** true solo en local o en el preview de Lovable; nunca en el dominio publicado. */
export const isDevPreview: boolean = import.meta.env.DEV || hostIsPreview();

/** Rol simulado en modo desarrollo (null = rol real del usuario). */
export function getDevRoleOverride(): AppRole | null {
  if (!isDevPreview || typeof window === "undefined") return null;
  const v = window.localStorage.getItem(DEV_ROLE_STORAGE_KEY);
  return v === "admin" || v === "cliente" ? v : null;
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
