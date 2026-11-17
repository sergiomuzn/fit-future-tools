import { test } from "node:test";
import { ok, strictEqual } from "node:assert";
import {
  DEFAULT_COMPAT,
  STATS_DESGLOSES,
  STATS_DESGLOSE_LABEL,
  STATS_METRICS,
} from "./stats-config";

// El desglose "Modalidad" se quita del selector: las modalidades solo se
// consultan con la casilla "Desglosar en modalidades" sobre el desglose Servicio.
test("modalidad is not offered as a breakdown", () => {
  ok(!(STATS_DESGLOSES as string[]).includes("modalidad"));
  ok(!("modalidad" in STATS_DESGLOSE_LABEL));
});

test("modalidad is absent from every metric compatibility row", () => {
  for (const m of STATS_METRICS) {
    ok(!("modalidad" in DEFAULT_COMPAT[m]));
  }
});

test("Servicio stays available for Nº sesiones so the modality split remains reachable", () => {
  ok((STATS_DESGLOSES as string[]).includes("tipoSesion"));
  strictEqual(DEFAULT_COMPAT.sesiones.tipoSesion, true);
});
