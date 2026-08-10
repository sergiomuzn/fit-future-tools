import { createContext, useContext, useState, type ReactNode } from "react";

interface Ctx {
  date: Date;
  setDate: (d: Date) => void;
  agendaTabRequest: number;
  requestAgendaTab: () => void;
}
const AgendaCtx = createContext<Ctx | null>(null);

export function AgendaDateProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const [agendaTabRequest, setAgendaTabRequest] = useState(0);
  const requestAgendaTab = () => setAgendaTabRequest((n) => n + 1);
  return (
    <AgendaCtx.Provider value={{ date, setDate, agendaTabRequest, requestAgendaTab }}>
      {children}
    </AgendaCtx.Provider>
  );
}

export function useAgendaDate() {
  const ctx = useContext(AgendaCtx);
  if (!ctx) throw new Error("useAgendaDate must be inside AgendaDateProvider");
  return ctx;
}