// «Sin especificar» is not a statistics category: a client whose file has no sex
// is not counted in any bar. They are reported apart so the centre can still see
// who is missing, exactly like clients without a birth date in «Clientes por edad».

export type SexoCuenta = {
  hombres: number;
  mujeres: number;
  /** ids of clients with no sex on file — never counted in a bar */
  sinSexo: string[];
};

export function contarPorSexo(
  ids: Iterable<string>,
  sexoDe: (id: string) => string | null | undefined,
): SexoCuenta {
  let hombres = 0;
  let mujeres = 0;
  const sinSexo: string[] = [];
  for (const id of ids) {
    const sexo = sexoDe(id) ?? "";
    if (sexo === "hombre") hombres += 1;
    else if (sexo === "mujer") mujeres += 1;
    else sinSexo.push(id);
  }
  return { hombres, mujeres, sinSexo };
}
