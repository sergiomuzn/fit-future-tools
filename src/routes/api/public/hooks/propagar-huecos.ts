import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint llamado por el cron semanal (lunes) para propagar la semana tipo.
 * Se autentica con la clave anon del proyecto en la cabecera `apikey`.
 */
export const Route = createFileRoute("/api/public/hooks/propagar-huecos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("apikey");
        const expected = process.env["SUPABASE_ANON_KEY"];
        if (!expected || key !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { propagarSemanasAuto } = await import("@/lib/slot-propagation.server");
        const result = await propagarSemanasAuto(2);
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
