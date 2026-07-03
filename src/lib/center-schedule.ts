import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SpecialDay = Database["public"]["Tables"]["special_days"]["Row"];
export type CenterConfig = Database["public"]["Tables"]["center_config"]["Row"];

export type DaySlot = { open: string; close: string } | null;
export type HorarioBase = Record<string, DaySlot>; // key 0..6 (0=domingo)
export type Precios = { individual: number; pareja: number; grupal: number };
export type Precios = {
  individual: number;
  pareja: number;
  grupal: number;
  gympass_ep: number;
  gympass_gr: number;
  classpass: number;
};

export const DEFAULT_HORARIO: HorarioBase = {
  "0": null,
  "1": { open: "06:45", close: "22:00" },
  "2": { open: "06:45", close: "22:00" },
  "3": { open: "06:45", close: "22:00" },
  "4": { open: "06:45", close: "22:00" },
  "5": { open: "06:45", close: "22:00" },
  "6": { open: "09:00", close: "14:00" },
};
export const DEFAULT_PRECIOS: Precios = {
  individual: 36,
  pareja: 49,
  grupal: 17,
  gympass_ep: 20,
  gympass_gr: 14,
  classpass: 12,
};

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Devuelve { openMin, closeMin } o null si el día está cerrado. */
export function getDayScheduleFor(
  date: Date,
  horario: HorarioBase,
  specials: Map<string, SpecialDay>,
): { openMin: number; closeMin: number; special?: SpecialDay } | null {
  const key = ymd(date);
  const sp = specials.get(key);
  if (sp) {
    if (sp.tipo === "cerrado") return null;
    if (sp.hora_apertura && sp.hora_cierre) {
      return {
        openMin: hmToMin(sp.hora_apertura.slice(0, 5)),
        closeMin: hmToMin(sp.hora_cierre.slice(0, 5)),
        special: sp,
      };
    }
  }
  const base = horario[String(date.getDay())];
  if (!base) return null;
  return { openMin: hmToMin(base.open), closeMin: hmToMin(base.close) };
}

/** Minutos abiertos del día (0 si cerrado). */
export function openMinutesOfDay(
  date: Date,
  horario: HorarioBase,
  specials: Map<string, SpecialDay>,
): number {
  const s = getDayScheduleFor(date, horario, specials);
  if (!s) return 0;
  return Math.max(0, s.closeMin - s.openMin);
}

/** Minutos abiertos dentro de la franja [hour, hour+1) en el día dado. */
export function openMinutesInHour(
  date: Date,
  hour: number,
  horario: HorarioBase,
  specials: Map<string, SpecialDay>,
): number {
  const s = getDayScheduleFor(date, horario, specials);
  if (!s) return 0;
  const slotStart = hour * 60;
  const slotEnd = slotStart + 60;
  const overlap = Math.min(s.closeMin, slotEnd) - Math.max(s.openMin, slotStart);
  return Math.max(0, overlap);
}

export function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (d.getTime() <= end.getTime()) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Días laborables, minutos totales y capacidad (×3 espacios) para el periodo [from,to]. */
export function getPeriodCapacity(
  from: Date,
  to: Date,
  horario: HorarioBase,
  specials: Map<string, SpecialDay>,
): { workingDays: number; totalOpenMinutes: number; capacityMinutes: number } {
  let workingDays = 0;
  let totalOpenMinutes = 0;
  for (const d of eachDate(from, to)) {
    const m = openMinutesOfDay(d, horario, specials);
    if (m > 0) {
      workingDays++;
      totalOpenMinutes += m;
    }
  }
  return { workingDays, totalOpenMinutes, capacityMinutes: totalOpenMinutes * 3 };
}

export function useCenterConfig() {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["center_config"],
    queryFn: async () => {
      const { data } = await supabase.from("center_config").select("*").eq("id", true).maybeSingle();
      return (data ?? null) as CenterConfig | null;
    },
  });
  const special = useQuery({
    queryKey: ["special_days"],
    queryFn: async () => {
      const { data } = await supabase.from("special_days").select("*");
      return (data ?? []) as SpecialDay[];
    },
  });

  const horario: HorarioBase = (cfg.data?.horario_base as unknown as HorarioBase) ?? DEFAULT_HORARIO;
  const precios: Precios = (cfg.data?.precios as unknown as Precios) ?? DEFAULT_PRECIOS;
  const specialsMap = new Map<string, SpecialDay>();
  for (const s of special.data ?? []) specialsMap.set(s.fecha, s);

  return {
    horario,
    precios,
    specials: special.data ?? [],
    specialsMap,
    isLoading: cfg.isLoading || special.isLoading,
    invalidate: () => {
      qc.invalidateQueries({ queryKey: ["center_config"] });
      qc.invalidateQueries({ queryKey: ["special_days"] });
    },
  };
}