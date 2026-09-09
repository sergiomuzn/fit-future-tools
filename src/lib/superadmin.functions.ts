/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CentroOverview {
  id: string;
  nombre: string;
  estado: string;
  plan: string;
  fecha_creacion: string;
  usuarios: number;
  ultimo_acceso: string | null;
  sesiones_mes: number;
}

export interface CentroUsuario {
  user_id: string;
  email: string | null;
  role: string;
  ultimo_acceso: string | null;
  alta: string;
}

export interface GlobalStats {
  centros_total: number;
  centros_activos: number;
  usuarios_total: number;
  sesiones_mes: number;
  top_centros: { nombre: string; sesiones: number }[];
}

async function assertSuperadmin(supabase: any) {
  const { data } = await supabase.rpc("is_superadmin");
  if (!data) throw new Error("Solo el superadministrador puede acceder");
}

/** Listado de centros con usuarios, último acceso y sesiones del mes. */
export const listCentros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CentroOverview[]> => {
    await assertSuperadmin(context.supabase);
    const { data, error } = await (context.supabase as any).rpc("superadmin_centros_overview");
    if (error) throw new Error(error.message);
    return (data ?? []) as CentroOverview[];
  });

/** Estadísticas globales de la plataforma. */
export const getGlobalStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GlobalStats> => {
    await assertSuperadmin(context.supabase);
    const { data, error } = await (context.supabase as any).rpc("superadmin_global_stats");
    if (error) throw new Error(error.message);
    return (data ?? {
      centros_total: 0,
      centros_activos: 0,
      usuarios_total: 0,
      sesiones_mes: 0,
      top_centros: [],
    }) as GlobalStats;
  });

/** Detalle de un centro: usuarios y configuración. */
export const getCentroDetalle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ centroId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase);
    const sb = context.supabase as any;
    const [{ data: usuarios }, { data: centro }, { data: config }] = await Promise.all([
      sb.rpc("superadmin_centro_usuarios", { p_centro: data.centroId }),
      sb.from("centros").select("*").eq("id", data.centroId).maybeSingle(),
      sb.from("center_config").select("*").eq("centro_id", data.centroId).maybeSingle(),
    ]);
    if (!centro) throw new Error("Centro no encontrado");
    return {
      centro: centro as any,
      usuarios: (usuarios ?? []) as CentroUsuario[],
      config: (config ?? null) as any,
    };
  });

/** Activa o desactiva el acceso de un centro. */
export const setCentroEstado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ centroId: z.string().uuid(), estado: z.enum(["activo", "inactivo"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase);
    const { error } = await (context.supabase as any).rpc("superadmin_set_centro_estado", {
      p_centro: data.centroId,
      p_estado: data.estado,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Entra o sale del modo soporte (solo lectura) sobre un centro. */
export const setModoSoporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ centroId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase);
    const { error } = await (context.supabase as any).rpc("superadmin_set_soporte", {
      p_centro: data.centroId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Centro que el superadministrador está visitando en modo soporte. */
export const getModoSoporte = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ centroId: string | null; nombre: string | null }> => {
    const sb = context.supabase as any;
    const { data: isSa } = await sb.rpc("is_superadmin");
    if (!isSa) return { centroId: null, nombre: null };
    const { data } = await sb
      .from("superadmin_context")
      .select("centro_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const centroId = (data?.centro_id as string | undefined) ?? null;
    if (!centroId) return { centroId: null, nombre: null };
    const { data: centro } = await sb.from("centros").select("nombre").eq("id", centroId).maybeSingle();
    return { centroId, nombre: (centro?.nombre as string | undefined) ?? null };
  });

/** Crea un centro nuevo y su administrador principal (con email de bienvenida). */
export const crearCentro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        nombre: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(255),
        plan: z.string().trim().max(40).default("basico"),
        origin: z.string().trim().url().max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase);

    const { data: centroId, error } = await (context.supabase as any).rpc("create_centro", {
      p_nombre: data.nombre,
      p_plan: data.plan || "basico",
    });
    if (error || !centroId) throw new Error(error?.message ?? "No se pudo crear el centro");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const email = data.email.toLowerCase();
    const redirectTo = `${data.origin.replace(/\/$/, "")}/reset-password`;

    let userId: string | null = null;
    let aviso: string | null = null;

    const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (invited?.data?.user?.id) {
      userId = invited.data.user.id as string;
    } else {
      // La cuenta ya existía: le enviamos un enlace para restablecer contraseña
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = (list?.users ?? []).find(
        (u: any) => (u.email ?? "").toLowerCase() === email,
      );
      userId = found?.id ?? null;
      if (userId) {
        await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
      } else {
        aviso = invited?.error?.message ?? "No se pudo enviar el correo de bienvenida";
      }
    }

    if (userId) {
      const { error: roleErr } = await admin
        .from("user_roles")
        .insert([{ user_id: userId, role: "admin", centro_id: centroId }]);
      if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
        aviso = roleErr.message;
      }
    }

    return { centroId: centroId as string, aviso };
  });
