import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de Wellhub (Gympass).
 * Preparado: hoy responde 200 OK sin ejecutar ninguna acción.
 * Cuando existan credenciales reales (WELLHUB_WEBHOOK_SECRET) se validará la
 * firma y se añadirá el asistente a la sesión grupal correspondiente.
 */
export const Route = createFileRoute("/api/public/webhooks/wellhub")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WELLHUB_WEBHOOK_SECRET"];
        if (!secret) {
          // Integración aún no activada: aceptamos y no hacemos nada.
          return Response.json({ ok: true, processed: false, provider: "wellhub" });
        }
        const { handleProviderBooking } = await import("@/lib/provider-webhooks.server");
        return handleProviderBooking({ request, provider: "wellhub", secret });
      },
      GET: async () => Response.json({ ok: true, provider: "wellhub" }),
    },
  },
});