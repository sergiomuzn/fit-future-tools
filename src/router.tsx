import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Al volver a un apartado se muestran los datos ya cargados al instante
        // y se refrescan en segundo plano.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Precarga el apartado al pasar el ratón/enfocar el enlace: al hacer clic ya está listo
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    // Evita parpadeos de "cargando" en transiciones cortas
    defaultPendingMs: 400,
    defaultPendingMinMs: 0,
  });

  return router;
};
