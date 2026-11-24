import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { colorCercaDeRojo, parseColorRgb } from "./color-contrast";

test("parseColorRgb interpreta hex de 3 y 6 cifras", () => {
  deepStrictEqual(parseColorRgb("#fff"), [255, 255, 255]);
  deepStrictEqual(parseColorRgb("#3CC0F3"), [60, 192, 243]);
});

test("parseColorRgb interpreta rgb() y devuelve null si no lo reconoce", () => {
  deepStrictEqual(parseColorRgb("rgb(220, 38, 38)"), [220, 38, 38]);
  strictEqual(parseColorRgb("oklch(0.6 0.21 25)"), null);
});

test("los rojos piden contorno, porque taparían el indicador", () => {
  strictEqual(colorCercaDeRojo("#E5484D"), true); // rojo de canceladas por defecto
  strictEqual(colorCercaDeRojo("#F43F5E"), true); // rosa fuerte
  strictEqual(colorCercaDeRojo("#7F1D1D"), true); // granate
  strictEqual(colorCercaDeRojo("#FCA5A5"), true); // rojo claro
  strictEqual(colorCercaDeRojo("rgb(220, 38, 38)"), true);
});

test("el resto de colores de servicio van sin contorno", () => {
  strictEqual(colorCercaDeRojo("#3CC0F3"), false); // azul
  strictEqual(colorCercaDeRojo("#00ADE2"), false); // azul clara
  strictEqual(colorCercaDeRojo("#F59E0B"), false); // ámbar
  strictEqual(colorCercaDeRojo("#E959DE"), false); // magenta de grupo
  strictEqual(colorCercaDeRojo("#EC4899"), false); // rosa
  strictEqual(colorCercaDeRojo("#22C55E"), false); // verde
  strictEqual(colorCercaDeRojo("#7C6CF6"), false); // violeta
  strictEqual(colorCercaDeRojo("#888888"), false); // gris
  strictEqual(colorCercaDeRojo("#FEE2E2"), false); // casi blanco
  strictEqual(colorCercaDeRojo("#3F0D0D"), false); // casi negro
});

test("sin color no se añade contorno, y uno ilegible lo conserva", () => {
  strictEqual(colorCercaDeRojo(null), false);
  strictEqual(colorCercaDeRojo(undefined), false);
  strictEqual(colorCercaDeRojo("   "), false);
  strictEqual(colorCercaDeRojo("oklch(0.6 0.21 25)"), true);
});
