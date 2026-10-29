import { describe, expect, it } from "vitest";
import { matchScore, rankByMatch } from "./utils";

describe("matchScore", () => {
  it("prioriza la coincidencia exacta de la palabra sobre una mención entre paréntesis", () => {
    // «Pilar» como nombre propio debe ganar a «Manuela (Pilar)».
    const scorePilar = matchScore("Pilar García", "pilar");
    const scoreMencion = matchScore("Manuela (Pilar)", "pilar");
    expect(scorePilar).not.toBeNull();
    expect(scoreMencion).not.toBeNull();
    expect(scorePilar).toBeLessThan(scoreMencion);
  });

  it("ordena por parecido: palabra que empieza por el texto antes que aparición a media palabra", () => {
    const scoreEmpieza = matchScore("Pilar Sánchez", "pilar");
    const scoreContiene = matchScore("Manuela Pilarides", "pilar");
    expect(scoreEmpieza).toBeLessThan(scoreContiene);
  });

  it("da la mejor puntuación a la coincidencia exacta del nombre", () => {
    const scoreExacto = matchScore("Pilar", "pilar");
    const scorePrefijo = matchScore("Pilar Ruiz", "pilar");
    expect(scoreExacto).toBe(0);
    expect(scoreExacto).toBeLessThan(scorePrefijo);
  });

  it("devuelve null cuando no hay ninguna coincidencia", () => {
    expect(matchScore("Ana López", "pilar")).toBeNull();
  });

  it("encuentra coincidencias aproximadas con erratas por detrás de las exactas", () => {
    const scoreErrata = matchScore("Pilra Gómez", "pilar");
    expect(scoreErrata).not.toBeNull();
    const scoreExacta = matchScore("Pilar Gómez", "pilar");
    expect(scoreExacta).toBeLessThan(scoreErrata);
  });
});

describe("rankByMatch", () => {
  const clientes = [
    { id: "1", nombre: "Manuela (Pilar)" },
    { id: "2", nombre: "Pilar García" },
    { id: "3", nombre: "Ana López" },
  ];

  it("pone primero el cliente cuyo nombre más se parece y sugiere el resto detrás", () => {
    const orden = rankByMatch(clientes, (c) => c.nombre, "pilar");
    expect(orden[0].id).toBe("2");
    expect(orden.map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("devuelve la lista sin cambios si la búsqueda está vacía", () => {
    expect(rankByMatch(clientes, (c) => c.nombre, "   ")).toBe(clientes);
  });
});
