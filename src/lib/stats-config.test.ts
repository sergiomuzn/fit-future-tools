import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPAT,
  STATS_DESGLOSES,
  STATS_DESGLOSE_LABEL,
  STATS_METRICS,
} from "./stats-config";

// El desglose "Modalidad" se quita del selector: las modalidades solo se
// consultan con la casilla "Desglosar en modalidades" sobre el desglose Servicio.
describe("stats-config desglose options", () => {
  it("does not offer modalidad as a breakdown", () => {
    expect(STATS_DESGLOSES).not.toContain("modalidad");
    expect(STATS_DESGLOSE_LABEL).not.toHaveProperty("modalidad");
  });

  it("keeps modalidad out of every metric compatibility row", () => {
    for (const m of STATS_METRICS) {
      expect(DEFAULT_COMPAT[m]).not.toHaveProperty("modalidad");
    }
  });

  it("keeps Servicio available for Nº sesiones so the modality split stays reachable", () => {
    expect(STATS_DESGLOSES).toContain("tipoSesion");
    expect(DEFAULT_COMPAT.sesiones.tipoSesion).toBe(true);
  });
});
