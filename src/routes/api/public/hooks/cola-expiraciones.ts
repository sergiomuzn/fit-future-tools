import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint periódico que caduca las ofertas de plaza de la cola de espera y
 * pasa el turno al siguiente cliente. Se autentica con la clave anon.
 */
export const Route = createFileRoute("/api/public/hooks/cola-expiraciones")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("apikey");
        const expected = process.env["SUPABASE_ANON_KEY"];
        if (!expected || key !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { procesarCaducidadesTodosLosCentros } = await import("@/lib/cola-espera.server");
        const result = await procesarCaducidadesTodosLosCentros();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
