import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Slug virtual usado para mostrar el servicio "Prueba" (no existe en `servicios`). */
export const PRUEBA_SLUG = "prueba";
export const PRUEBA_LABEL = "Prueba";

/**
 * Clientes cuya última sesión realizada fue una sesión de prueba y que todavía
 * no han contratado ningún bono posterior. Mientras estén en esta lista su
 * servicio se muestra como "Prueba" en Clientes y Bonos.
 */
export function useClientesEnPrueba() {
  return useQuery({
    queryKey: ["clientes-en-prueba"],
    queryFn: async (): Promise<Set<string>> => {
      // 1. Sesiones de prueba (marcadas por tipo o por estado).
      const { data: pruebas } = await supabase
        .from("sessions")
        .select("client_id,fecha,hora_inicio")
        .or("tipo.eq.prueba,estado.eq.prueba")
        .not("client_id", "is", null);

      const ultimaPrueba = new Map<string, string>();
      for (const s of (pruebas ?? []) as Array<{ client_id: string | null; fecha: string; hora_inicio: string }>) {
        if (!s.client_id) continue;
        const key = `${s.fecha}T${s.hora_inicio}`;
        const prev = ultimaPrueba.get(s.client_id);
        if (!prev || key > prev) ultimaPrueba.set(s.client_id, key);
      }
      const candidatos = [...ultimaPrueba.keys()];
      if (candidatos.length === 0) return new Set();

      // 2. Sesiones realizadas posteriores (ya no sería la última) para esos clientes.
      const { data: realizadas } = await supabase
        .from("sessions")
        .select("client_id,fecha,hora_inicio,tipo,estado")
        .in("client_id", candidatos)
        .eq("estado", "realizada");

      const posterior = new Set<string>();
      for (const s of (realizadas ?? []) as Array<{
        client_id: string | null; fecha: string; hora_inicio: string; tipo: string | null;
      }>) {
        if (!s.client_id || s.tipo === "prueba") continue;
        const key = `${s.fecha}T${s.hora_inicio}`;
        if (key > (ultimaPrueba.get(s.client_id) ?? "")) posterior.add(s.client_id);
      }

      // 3. Bonos realmente contratados (los del catálogo) → dejan de estar en prueba.
      const { data: bonos } = await supabase
        .from("client_bonos")
        .select("client_id,bono_catalogo_id")
        .in("client_id", candidatos)
        .not("bono_catalogo_id", "is", null);
      const conBono = new Set(((bonos ?? []) as Array<{ client_id: string }>).map((b) => b.client_id));

      return new Set(candidatos.filter((id) => !posterior.has(id) && !conBono.has(id)));
    },
  });
}
