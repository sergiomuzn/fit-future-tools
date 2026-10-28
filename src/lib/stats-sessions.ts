/** Accounting is independent of Agenda visibility and attendance preferences. */
export type CountableSession = {
  fecha: string;
  hora_fin: string;
  estado: string;
  no_contabilizar?: boolean | null;
  por_confirmar?: boolean | null;
};

export function countsInSessionTotal(session: CountableSession, now = new Date()): boolean {
  if (session.por_confirmar || session.no_contabilizar) return false;
  if (session.estado === "realizada" || session.estado === "cancelada") return true;
  // Legacy trial/renewal states do not identify completion: only count after end.
  if (session.estado === "prueba" || session.estado === "renovacion") {
    return new Date(`${session.fecha}T${session.hora_fin}`).getTime() <= now.getTime();
  }
  return false;
}

export function sessionsInMonthTotal<T extends CountableSession>(sessions: T[], month: string, now = new Date()): T[] {
  return sessions.filter((session) => session.fecha.slice(0, 7) === month && countsInSessionTotal(session, now));
}

/** Fetch every page rather than silently accepting the API's row limit. */
export async function fetchAllSessionPages<T>(readPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await readPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}