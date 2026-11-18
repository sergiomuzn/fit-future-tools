/** Clients and their bonos share a search; access management stays independent. */
export function clientTabSearch(query: string, from: string, to: string) {
  return from !== "accesos" && to !== "accesos" ? query : "";
}