/** A manual session keeps an empty row; propagated slots already exist separately. */
export function clientRemovalAction(propagated: boolean, otherActiveClients: number): "delete" | "clear" {
  return propagated || otherActiveClients > 0 ? "delete" : "clear";
}

/** Removing an assignment does not change estado or any session configuration. */
export const EMPTY_SESSION_CLIENT = {
  client_id: null,
  booked_by_user_id: null,
  booking_tipo: null,
  por_confirmar: false,
};