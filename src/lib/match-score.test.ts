import { describe, test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { filterByMatch, matchScore, rankByMatch } from "./utils";

describe("matchScore", () => {
  test("prioriza la coincidencia exacta de la palabra sobre una mención entre paréntesis", () => {
    // «Pilar» como nombre propio debe ganar a «Manuela (Pilar)».
    const scorePilar = matchScore("Pilar García", "pilar");
    const scoreMencion = matchScore("Manuela (Pilar)", "pilar");
    strictEqual(scorePilar !== null, true);
    strictEqual(scoreMencion !== null, true);
    strictEqual((scorePilar as number) < (scoreMencion as number), true);
  });

  test("ordena por parecido: palabra que empieza por el texto antes que aparición a media palabra", () => {
    const scoreEmpieza = matchScore("Pilar Sánchez", "pilar");
    const scoreContiene = matchScore("Manuela Pilarides", "pilar");
    strictEqual((scoreEmpieza as number) < (scoreContiene as number), true);
  });

  test("da la mejor puntuación a la coincidencia exacta del nombre", () => {
    strictEqual(matchScore("Pilar", "pilar"), 0);
  });

  test("devuelve null cuando no hay ninguna coincidencia", () => {
    strictEqual(matchScore("Ana López", "pilar"), null);
  });

  test("encuentra coincidencias aproximadas con erratas por detrás de las exactas", () => {
    const scoreErrata = matchScore("Pilra Gómez", "pilar");
    const scoreExacta = matchScore("Pilar Gómez", "pilar");
    strictEqual(scoreErrata !== null, true);
    strictEqual((scoreExacta as number) < (scoreErrata as number), true);
  });

  test("ignora acentos y mayúsculas", () => {
    strictEqual(matchScore("PILAR GARCÍA", "Pílar") !== null, true);
  });
});

describe("rankByMatch", () => {
  const clientes = [
    { id: "1", nombre: "Manuela (Pilar)" },
    { id: "2", nombre: "Pilar García" },
    { id: "3", nombre: "Ana López" },
  ];

  test("pone primero el cliente cuyo nombre más se parece y sugiere el resto detrás", () => {
    const orden = rankByMatch(clientes, (c) => c.nombre, "pilar");
    deepStrictEqual(orden.map((c) => c.id), ["2", "1"]);
  });

  test("devuelve la lista sin cambios si la búsqueda está vacía", () => {
    strictEqual(rankByMatch(clientes, (c) => c.nombre, "   "), clientes);
  });
});

describe("filterByMatch table searches", () => {
  const invoices = [
    { nombre: "Ana López", precio_cobrado: 50 },
    { nombre: "Ana López", precio_cobrado: 75 },
    { nombre: "Andrea García", precio_cobrado: 200 },
    { nombre: "Anabel Ruiz", precio_cobrado: 25 },
  ];

  test("billing total excludes fuzzy-only names when literal matches exist", () => {
    const result = filterByMatch(invoices, (i) => i.nombre, "ana");
    deepStrictEqual(result.map((i) => i.nombre), ["Ana López", "Ana López", "Anabel Ruiz"]);
    strictEqual(result.reduce((sum, i) => sum + i.precio_cobrado, 0), 150);
  });

  test("full client name includes every invoice for that client only", () => {
    const result = filterByMatch(invoices, (i) => i.nombre, "ANA LÓPEZ");
    strictEqual(result.length, 2);
    strictEqual(result.reduce((sum, i) => sum + i.precio_cobrado, 0), 125);
  });

  test("literal results keep name priority ahead of parenthetical mentions", () => {
    const names = ["Manuela (Pilar)", "Pilra Gómez", "Pilar García"];
    deepStrictEqual(filterByMatch(names, (s) => s, "pilar"), ["Pilar García", "Manuela (Pilar)"]);
  });

  test("typos remain searchable when there are no literal matches", () => {
    deepStrictEqual(filterByMatch(["Pilar García", "Ana López"], (s) => s, "pilra"), ["Pilar García"]);
  });

  test("bonos fuzzy fallback checks client name, not combined service and date text", () => {
    const bonos = [
      { nombre: "Luis Pérez", text: "Luis Pérez Entrenamiento personal 03/11/26" },
      { nombre: "Andrea García", text: "Andrea García Entrenamiento personal 03/11/26" },
    ];
    deepStrictEqual(filterByMatch(bonos, (b) => b.text, "ana", (b) => b.nombre), [bonos[1]]);
    deepStrictEqual(filterByMatch(bonos, (b) => b.text, "personal", (b) => b.nombre), bonos);
  });

  test("bonos literal client matches exclude unrelated composite subsequences", () => {
    const bonos = [
      { nombre: "Ana López", text: "Ana López Entrenamiento personal 03/11/26" },
      { nombre: "Luis Pérez", text: "Luis Pérez Entrenamiento personal 03/11/26" },
    ];
    deepStrictEqual(filterByMatch(bonos, (b) => b.text, "ana", (b) => b.nombre), [bonos[0]]);
  });

  test("empty search preserves rows and existing order", () => {
    strictEqual(filterByMatch(invoices, (i) => i.nombre, "  "), invoices);
  });
});
