import { test } from "node:test";
import { strictEqual } from "node:assert";
import { formatNameTitle } from "./utils";

// Regla del bocadillo de sesión: nombres con la primera letra de nombre y
// apellidos en mayúscula y el resto en minúscula.
test("a fully uppercase client name shows only initials capitalised", () => {
  strictEqual(formatNameTitle("MACARENA ZAVALLA"), "Macarena Zavalla");
});
test("an uppercase name with a trailing label keeps one capital per word", () => {
  strictEqual(formatNameTitle("ANA HORMAECHEA GYMPASS"), "Ana Hormaechea Gympass");
});
test("a lowercase stored name is capitalised the same way", () => {
  strictEqual(formatNameTitle("carmen garcía campayo"), "Carmen García Campayo");
});
test("Spanish particles stay lowercase, as in the rest of the app", () => {
  strictEqual(formatNameTitle("Ana De Campos"), "Ana de Campos");
  strictEqual(formatNameTitle("Maria Luisa de la Escalada"), "Maria Luisa de la Escalada");
});
