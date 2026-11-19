import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { bonoSesionesContratadas } from "./bono-closed-sessions";
import type { BonoCatalogo } from "@/lib/db";

const cat = (id: string, sesiones_incluidas: number) =>
  ({ id, sesiones_incluidas }) as BonoCatalogo;

const catalogo = new Map<string, BonoCatalogo>([
  ["pack-10", cat("pack-10", 10)],
  ["pack-cero", cat("pack-cero", 0)],
]);

describe("bonoSesionesContratadas", () => {
  test("usa las sesiones del catálogo cuando el bono viene del catálogo", () => {
    strictEqual(
      bonoSesionesContratadas(
        { bono_catalogo_id: "pack-10", sesiones_realizadas: 3, sesiones_disponibles: 2 },
        catalogo,
      ),
      10,
    );
  });

  test("si no hay catálogo, suma las realizadas y las que quedaban", () => {
    strictEqual(
      bonoSesionesContratadas(
        { bono_catalogo_id: null, sesiones_realizadas: 4, sesiones_disponibles: 3 },
        catalogo,
      ),
      7,
    );
  });

  test("un saldo negativo no resta: el bono se sobrepasó", () => {
    strictEqual(
      bonoSesionesContratadas(
        { bono_catalogo_id: null, sesiones_realizadas: 2, sesiones_disponibles: -1 },
        catalogo,
      ),
      2,
    );
  });

  test("un catálogo con 0 sesiones (Gympass) no cuenta: se usan las hechas y las que quedaban", () => {
    strictEqual(
      bonoSesionesContratadas(
        { bono_catalogo_id: "pack-cero", sesiones_realizadas: 1, sesiones_disponibles: -2 },
        catalogo,
      ),
      1,
    );
  });

  test("sin catálogo y sin sesiones, no se muestra nada", () => {
    strictEqual(
      bonoSesionesContratadas(
        { bono_catalogo_id: null, sesiones_realizadas: 0, sesiones_disponibles: 0 },
        catalogo,
      ),
      null,
    );
  });
});
