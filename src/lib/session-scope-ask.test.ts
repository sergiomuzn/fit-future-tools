import { test } from "node:test";
import { strictEqual } from "node:assert";
import { isOnlyClientCancellation, isOnlyClientCancellationPanel, type OnlyClientCancellationArgs, type PanelOnlyCancellationArgs } from "./session-scope-ask";

const base: OnlyClientCancellationArgs = {
  hasCancellation: true,
  session: {
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    trainer_id: "t1",
    servicio_slug: "personal",
    esPrueba: false,
    por_confirmar: false,
    ocupacion: 1,
    client_id: "c1",
    titulo: null,
  },
  horaInicio: "10:00",
  horaFin: "11:00",
  trainerId: "t1",
  servicioSlug: "personal",
  esPrueba: false,
  porConfirmar: false,
  grupo: false,
  repeatWeeks: 0,
  incidencia: "Se lesionó",
  expectedIncidencia: "Se lesionó",
  clientId: null,
  nombreLibre: "",
  sessionCancelada: true,
  cancelledClientIds: ["c1"],
  groupClientIds: [],
  groupNameOnlyCount: 0,
  originalGroupClientIds: [],
};

test("cancelar al cliente de una sesión individual es el único cambio", () => {
  strictEqual(isOnlyClientCancellation(base), true);
});

test("sin cancelaciones no aplica", () => {
  strictEqual(isOnlyClientCancellation({ ...base, hasCancellation: false }), false);
});

test("cancelar y cambiar la hora ya no es solo cancelación", () => {
  strictEqual(isOnlyClientCancellation({ ...base, horaInicio: "12:00" }), false);
});

test("cancelar y poner otro cliente ya no es solo cancelación", () => {
  strictEqual(isOnlyClientCancellation({ ...base, clientId: "c2" }), false);
});

test("cancelar y editar la nota a mano ya no es solo cancelación", () => {
  strictEqual(isOnlyClientCancellation({ ...base, incidencia: "Nota distinta" }), false);
});

test("en un grupo, cancelar a uno de varios clientes es el único cambio", () => {
  strictEqual(
    isOnlyClientCancellation({
      ...base,
      session: { ...base.session, ocupacion: 2, client_id: null },
      grupo: true,
      sessionCancelada: false,
      originalGroupClientIds: ["c1", "c2"],
      groupClientIds: ["c2", null],
      cancelledClientIds: ["c1"],
    }),
    true,
  );
});

test("en un grupo, cancelar a uno y añadir a otro ya no es solo cancelación", () => {
  strictEqual(
    isOnlyClientCancellation({
      ...base,
      session: { ...base.session, ocupacion: 2, client_id: null },
      grupo: true,
      sessionCancelada: false,
      originalGroupClientIds: ["c1", "c2"],
      groupClientIds: ["c2", "c3"],
      cancelledClientIds: ["c1"],
    }),
    false,
  );
});

const panelBase: PanelOnlyCancellationArgs = {
  hasCancellation: true,
  removedCount: 0,
  repeatWeeks: 0,
  horaInicioOriginal: "10:00:00",
  horaFinOriginal: "11:00:00",
  horaInicio: "10:00",
  horaFin: "11:00",
  trainerOriginal: "t1",
  trainerId: "t1",
  servicioOriginal: "personal",
  servicioSlug: "personal",
  esPruebaOriginal: false,
  esPrueba: false,
  porConfirmarOriginal: false,
  porConfirmar: false,
  notasOriginal: "",
  notas: "",
  plazasOriginal: null,
  plazas: null,
  noContabilizarCount: 0,
  clientesOriginales: ["c1", "c2"],
  cancelledClientIds: ["c1"],
  clientIds: ["c2"],
  nombresEsperados: [],
  nombresActuales: [],
};

test("panel del día: cancelar a un cliente es el único cambio", () => {
  strictEqual(isOnlyClientCancellationPanel(panelBase), true);
});

test("panel del día: cancelar y quitar a otro cliente ya no es solo cancelación", () => {
  strictEqual(isOnlyClientCancellationPanel({ ...panelBase, removedCount: 1 }), false);
});

test("panel del día: cancelar y cambiar el entrenador ya no es solo cancelación", () => {
  strictEqual(isOnlyClientCancellationPanel({ ...panelBase, trainerId: "t2" }), false);
});

test("panel del día: cancelar y tocar las notas ya no es solo cancelación", () => {
  strictEqual(isOnlyClientCancellationPanel({ ...panelBase, notas: "Nota nueva" }), false);
});

test("panel del día: cancelar y cambiar las plazas ya no es solo cancelación", () => {
  strictEqual(isOnlyClientCancellationPanel({ ...panelBase, plazas: 4 }), false);
});

test("panel del día: marcar «No contabilizar» en una cancelación no pregunta por las futuras", () => {
  strictEqual(
    isOnlyClientCancellationPanel({ ...panelBase, noContabilizarCount: 1, cancelledClientIds: [], clientesOriginales: ["c2"] }),
    true,
  );
});
