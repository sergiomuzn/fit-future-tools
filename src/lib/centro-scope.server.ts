/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Admin = typeof supabaseAdmin;

/**
 * Cliente de servidor acotado a un centro: añade automáticamente el filtro
 * `centro_id` a cualquier lectura, escritura o borrado. Es la única forma
 * permitida de usar la clave de servicio desde funciones de servidor, para
 * que nunca pueda cruzarse información entre centros.
 */
export function centroDb(centroId: string): Admin {
  const scoped = {
    from(table: string) {
      const q = (supabaseAdmin as any).from(table);
      const withCentro = (v: any) =>
        Array.isArray(v)
          ? v.map((row) => ({ centro_id: centroId, ...row }))
          : { centro_id: centroId, ...v };
      return {
        select: (...args: any[]) => q.select(...args).eq("centro_id", centroId),
        insert: (values: any, ...rest: any[]) => q.insert(withCentro(values), ...rest),
        upsert: (values: any, ...rest: any[]) => q.upsert(withCentro(values), ...rest),
        update: (values: any, ...rest: any[]) => q.update(values, ...rest).eq("centro_id", centroId),
        delete: (...args: any[]) => q.delete(...args).eq("centro_id", centroId),
      };
    },
  };
  return scoped as unknown as Admin;
}

/** Centro al que pertenece un usuario autenticado (staff o cliente). */
export async function getCentroIdForUser(userId: string): Promise<string> {
  const { data: role } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("centro_id")
    .eq("user_id", userId)
    .not("centro_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (role?.centro_id) return role.centro_id as string;

  const { data: prof } = await (supabaseAdmin as any)
    .from("client_profiles")
    .select("centro_id")
    .eq("id", userId)
    .maybeSingle();
  if (prof?.centro_id) return prof.centro_id as string;

  throw new Error("Tu cuenta no está asignada a ningún centro");
}

/** Centro de una fila concreta (por ejemplo, un grupo o una sesión). */
export async function getCentroIdOfRow(table: string, id: string): Promise<string> {
  const { data } = await (supabaseAdmin as any)
    .from(table)
    .select("centro_id")
    .eq("id", id)
    .maybeSingle();
  if (!data?.centro_id) throw new Error("Registro no encontrado");
  return data.centro_id as string;
}
