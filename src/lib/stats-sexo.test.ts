import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { contarPorSexo } from "./stats-sexo";

const sexo = new Map<string, string | null | undefined>([
  ["h1", "hombre"],
  ["h2", "hombre"],
  ["m1", "mujer"],
  ["x1", null],
  ["x2", undefined],
]);
const sexoDe = (id: string) => sexo.get(id) ?? null;

test("clients with a sex on file are counted in their own bar", () => {
  const r = contarPorSexo(["h1", "h2", "m1"], sexoDe);
  strictEqual(r.hombres, 2);
  strictEqual(r.mujeres, 1);
  strictEqual(r.sinSexo.length, 0);
});

test("clients without a sex are counted in no bar and reported apart", () => {
  const r = contarPorSexo(["h1", "m1", "x1", "x2"], sexoDe);
  strictEqual(r.hombres, 1);
  strictEqual(r.mujeres, 1);
  deepStrictEqual(r.sinSexo, ["x1", "x2"]);
});

test("a client with no file at all is not counted either", () => {
  const r = contarPorSexo(["h1", "desconocido"], sexoDe);
  strictEqual(r.hombres, 1);
  strictEqual(r.mujeres, 0);
  deepStrictEqual(r.sinSexo, ["desconocido"]);
});
