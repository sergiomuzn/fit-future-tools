import { describe, test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { matchScore, rankByMatch } from "./utils";

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
