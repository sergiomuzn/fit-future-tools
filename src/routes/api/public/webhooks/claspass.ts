import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de Claspass.
 * Preparado: hoy responde 200 OK sin ejecutar ninguna acción.
 * Cuando existan credenciales reales (CLASPASS_WEBHOOK_SECRET) se validará la
 * firma y se añadirá el asistente a la sesión grupal correspondiente.
 */
export const Route = createFileRoute("/api/public/webhooks/claspass")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CLASPASS_WEBHOOK_SECRET"];
        if (!secret) {
          return Response.json({ ok: true, processed: false, provider: "claspass" });
        }
        const { handleProviderBooking } = await import("@/lib/provider-webhooks.server");
        return handleProviderBooking({ request, provider: "claspass", secret });
      },
      GET: async () => Response.json({ ok: true, provider: "claspass" }),
    },
  },
});