import { createContext, useContext, useState, type ReactNode } from "react";

interface Ctx {
  date: Date;
  setDate: (d: Date) => void;
}
const AgendaCtx = createContext<Ctx | null>(null);

export function AgendaDateProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  return <AgendaCtx.Provider value={{ date, setDate }}>{children}</AgendaCtx.Provider>;
}

export function useAgendaDate() {
  const ctx = useContext(AgendaCtx);
  if (!ctx) throw new Error("useAgendaDate must be inside AgendaDateProvider");
  return ctx;
}