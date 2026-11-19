import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { clientsWithServiceBono, partitionPreferred } from "./session-client-preference";
import { rankByMatchWithPreference } from "./utils";

const HOY = "2026-11-19";

const bono = {
  client_id: "c-activo",
  activo: true,
  bono_catalogo_id: "pack-personal",
  sesiones_disponibles: 5,
  servicio_slug: "personal",
  tipo: "individual",
  fecha_caducidad: null,
};

const catalogo = [
  { id: "pack-personal", tipo: "individual", servicio_slug: "personal" },
  { id: "pack-grupo", tipo: "grupal", servicio_slug: "grupos" },
  { id: "pack-gympass", tipo: "gympass", servicio_slug: "personal" },
];

describe("clientsWithServiceBono", () => {
  test("solo cuenta el bono activo con sesiones restantes del servicio de la sesión", () => {
    deepStrictEqual(
      [...clientsWithServiceBono([bono], catalogo, "personal", HOY)],
      ["c-activo"],
    );
  });

  test("un bono agotado, caducado, inactivo o de otro servicio no cuenta", () => {
    const bonos = [
      bono,
      { ...bono, client_id: "c-agotado", sesiones_disponibles: 0 },
      { ...bono, client_id: "c-caducado", fecha_caducidad: "2026-11-18" },
      { ...bono, client_id: "c-inactivo", activo: false },
      { ...bono, client_id: "c-otro", bono_catalogo_id: "pack-grupo" },
    ];
    deepStrictEqual(
      [...clientsWithServiceBono(bonos, catalogo, "personal", HOY)].sort(),
      ["c-activo"],
    );
  });

  test("el servicio del catálogo manda sobre el guardado en el bono", () => {
    const bonos = [{ ...bono, client_id: "c-catalogo", bono_catalogo_id: "pack-grupo" }];
    deepStrictEqual(
      [...clientsWithServiceBono(bonos, catalogo, "grupos", HOY)],
      ["c-catalogo"],
    );
    deepStrictEqual(
      [...clientsWithServiceBono(bonos, catalogo, "personal", HOY)],
      [],
    );
  });

  test("los pases de gimnasio cuentan aunque no sumen sesiones", () => {
    const bonos = [{ ...bono, client_id: "c-gympass", bono_catalogo_id: "pack-gympass", sesiones_disponibles: 0 }];
    deepStrictEqual(
      [...clientsWithServiceBono(bonos, catalogo, "personal", HOY)],
      ["c-gympass"],
    );
  });

  test("sin servicio de sesión no se prefiere a nadie", () => {
    strictEqual(clientsWithServiceBono([bono], catalogo, "", HOY).size, 0);
    strictEqual(clientsWithServiceBono([bono], catalogo, null, HOY).size, 0);
  });
});

describe("rankByMatchWithPreference", () => {
  const clientes = [
    { id: "carlos", nombre: "Carlos Ruiz" },
    { id: "carmen", nombre: "Carmen Díaz" },
    { id: "carmelo", nombre: "Carmelo Vidal" },
  ];
  const nombre = (c: { nombre: string }) => c.nombre;

  test("sin preferir a nadie, «car» sale por parecido y orden alfabético", () => {
    deepStrictEqual(
      rankByMatchWithPreference(clientes, nombre, "car", () => false).map((c) => c.id),
      ["carlos", "carmelo", "carmen"],
    );
  });

  test("dentro del mismo parecido el preferido sube al primer puesto", () => {
    deepStrictEqual(
      rankByMatchWithPreference(clientes, nombre, "car", (c) => c.id === "carmelo").map((c) => c.id),
      ["carmelo", "carlos", "carmen"],
    );
  });

  test("un parecido mejor gana aunque el otro cliente tenga el servicio contratado", () => {
    const conMencion = [
      ...clientes,
      { id: "carmenides", nombre: "Carmenides Ruiz" },
    ];
    // «Carmen» coincide de palabra; «Carmenides» solo la contiene y «Carmelo»
    // aparece por errata. Ninguna preferencia sube por encima de un mejor parecido.
    deepStrictEqual(
      rankByMatchWithPreference(conMencion, nombre, "carmen", (c) => c.id === "carmenides").map((c) => c.id),
      ["carmen", "carmenides", "carmelo"],
    );
  });

  test("la coincidencia aproximada sigue quedando detrás de las literales", () => {
    const conErrata = [
      { id: "pilar", nombre: "Pilar Gómez" },
      { id: "pilra", nombre: "Pilra Sánchez" },
    ];
    deepStrictEqual(
      rankByMatchWithPreference(conErrata, nombre, "pilar", (c) => c.id === "pilra").map((c) => c.id),
      ["pilar", "pilra"],
    );
  });

  test("sin texto buscado la lista se queda tal cual", () => {
    deepStrictEqual(
      rankByMatchWithPreference(clientes, nombre, "", () => true),
      clientes,
    );
  });
});

describe("partitionPreferred", () => {
  test("pone los preferidos delante conservando el orden de cada grupo", () => {
    deepStrictEqual(
      partitionPreferred([1, 2, 3, 4], (n) => n % 2 === 0),
      [2, 4, 1, 3],
    );
  });

  test("sin preferidos el orden no cambia", () => {
    deepStrictEqual(partitionPreferred([1, 2, 3], () => false), [1, 2, 3]);
  });
});
