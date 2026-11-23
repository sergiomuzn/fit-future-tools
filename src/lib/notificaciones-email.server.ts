/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { debeEnviarEmail, NOTIF_PREFS_DEFAULT, type NotifPrefs } from "./notificaciones-tipos";

interface AvisoRow {
  id: string;
  user_id: string;
  centro_id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
}

function parsePrefs(row: { email_activo?: boolean; tipos?: unknown } | null): NotifPrefs {
  if (!row) return NOTIF_PREFS_DEFAULT;
  const tipos = (row.tipos && typeof row.tipos === "object" ? row.tipos : {}) as Record<
    string,
    boolean
  >;
  return { emailActivo: row.email_activo !== false, tipos };
}

/** Preferencias de avisos por correo de un cliente. */
export async function getNotifPrefsFor(userId: string): Promise<NotifPrefs> {
  const { data } = await (supabaseAdmin as any)
    .from("client_notif_prefs")
    .select("email_activo,tipos")
    .eq("user_id", userId)
    .maybeSingle();
  return parsePrefs(data);
}

/** Guarda las preferencias de avisos por correo de un cliente. */
export async function saveNotifPrefsFor(
  userId: string,
  centroId: string | null,
  prefs: NotifPrefs,
): Promise<void> {
  await (supabaseAdmin as any).from("client_notif_prefs").upsert(
    {
      user_id: userId,
      centro_id: centroId,
      email_activo: prefs.emailActivo,
      tipos: prefs.tipos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

/**
 * Envía por correo los avisos del buzón que aún no se han enviado, respetando
 * las preferencias de cada cliente. Marca todas las filas procesadas para que
 * nunca se envíen dos veces. Nunca lanza: un fallo de correo no debe romper la
 * acción que generó el aviso.
 */
export async function enviarEmailsPendientes(opts?: {
  ids?: string[];
  userId?: string;
  limite?: number;
}): Promise<{ enviados: number }> {
  try {
    let q = (supabaseAdmin as any)
      .from("notificaciones")
      .select("id,user_id,centro_id,tipo,titulo,mensaje")
      .eq("email_enviado", false)
      .not("user_id", "is", null)
      .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(opts?.limite ?? 100);
    if (opts?.ids?.length) q = q.in("id", opts.ids);
    if (opts?.userId) q = q.eq("user_id", opts.userId);

    const { data } = await q;
    const rows = (data ?? []) as AvisoRow[];
    if (!rows.length) return { enviados: 0 };

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const centroIds = [...new Set(rows.map((r) => r.centro_id).filter(Boolean))];

    const [{ data: perfiles }, { data: prefsRows }, { data: centros }] = await Promise.all([
      (supabaseAdmin as any).from("client_profiles").select("id,email,activo").in("id", userIds),
      (supabaseAdmin as any)
        .from("client_notif_prefs")
        .select("user_id,email_activo,tipos")
        .in("user_id", userIds),
      (supabaseAdmin as any).from("center_config").select("centro_id,nombre").in("centro_id", centroIds),
    ]);

    const emailByUser = new Map<string, string>(
      ((perfiles ?? []) as { id: string; email: string | null; activo: boolean }[])
        .filter((p) => p.activo && p.email)
        .map((p) => [p.id, p.email as string]),
    );
    const prefsByUser = new Map<string, NotifPrefs>(
      ((prefsRows ?? []) as any[]).map((r) => [r.user_id as string, parsePrefs(r)]),
    );
    const centroNombre = new Map<string, string>(
      ((centros ?? []) as { centro_id: string; nombre: string }[]).map((c) => [
        c.centro_id,
        c.nombre,
      ]),
    );

    const { sendTemplateEmail } = await import("./email-templates/send-email");
    let enviados = 0;
    const procesados: string[] = [];

    for (const row of rows) {
      procesados.push(row.id);
      const email = emailByUser.get(row.user_id);
      const prefs = prefsByUser.get(row.user_id) ?? NOTIF_PREFS_DEFAULT;
      if (!email || !debeEnviarEmail(prefs, row.tipo)) continue;
      try {
        const res = await sendTemplateEmail("aviso-cliente", email, {
          templateData: {
            centro: centroNombre.get(row.centro_id) ?? "Tu centro",
            titulo: row.titulo,
            mensaje: row.mensaje,
          },
          idempotencyKey: `aviso-${row.id}`,
        });
        if (res.sent) enviados += 1;
      } catch (e) {
        console.error("[avisos] no se pudo enviar el correo", row.id, e);
      }
    }

    if (procesados.length) {
      await (supabaseAdmin as any)
        .from("notificaciones")
        .update({ email_enviado: true })
        .in("id", procesados);
    }
    return { enviados };
  } catch (e) {
    console.error("[avisos] fallo al procesar correos pendientes", e);
    return { enviados: 0 };
  }
}

/**
 * Envía por correo al centro los avisos de administración, según su
 * configuración en Configuración › Notificaciones. Nunca lanza.
 */
export async function enviarEmailsCentro(
  rows: { id: string; centro_id: string | null; tipo: string; titulo: string; mensaje: string }[],
): Promise<void> {
  try {
    const { parseEmailCentro, debeEnviarEmailCentro } = await import("./email-centro");
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const porCentro = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.centro_id) continue;
      porCentro.set(r.centro_id, [...(porCentro.get(r.centro_id) ?? []), r]);
    }
    for (const [centroId, lista] of porCentro) {
      const { data: cfgRow } = await (supabaseAdmin as any)
        .from("center_config")
        .select("nombre,email_centro")
        .eq("centro_id", centroId)
        .maybeSingle();
      const cfg = parseEmailCentro(cfgRow?.email_centro);
      const enviar = lista.filter((r) => debeEnviarEmailCentro(cfg, r.tipo));
      if (!enviar.length) continue;
      let destinos: string[] = cfg.destino ? [cfg.destino] : [];
      if (!destinos.length) {
        const { data: admins } = await (supabaseAdmin as any)
          .from("user_roles")
          .select("user_id")
          .eq("centro_id", centroId)
          .eq("role", "admin");
        for (const a of (admins ?? []) as { user_id: string }[]) {
          const { data } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
          if (data?.user?.email) destinos.push(data.user.email);
        }
      }
      destinos = [...new Set(destinos)];
      for (const r of enviar) {
        for (const email of destinos) {
          try {
            await sendTemplateEmail("aviso-centro", email, {
              templateData: { centro: cfgRow?.nombre ?? "Tu centro", titulo: r.titulo, mensaje: r.mensaje },
              idempotencyKey: `aviso-centro-${r.id}-${email}`,
            });
          } catch (e) {
            console.error("[avisos centro] no se pudo enviar", r.id, e);
          }
        }
      }
    }
  } catch (e) {
    console.error("[avisos centro] fallo", e);
  }
}
