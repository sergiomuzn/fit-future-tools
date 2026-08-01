import * as XLSX from "xlsx";

export async function readXlsxRows(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const [k, v] of Object.entries(row)) {
    if (keys.includes(norm(k))) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
  }
  return "";
}

function toDate(value: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  const serial = Number(value);
  if (Number.isFinite(serial) && serial > 0) {
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

export type ImportedClient = {
  nombre: string;
  telefono: string | null;
  email: string | null;
  fecha_inicio: string | null;
  cumpleanos: string | null;
  notas: string | null;
};

export function mapClientRows(rows: Record<string, unknown>[]): ImportedClient[] {
  const out: ImportedClient[] = [];
  for (const row of rows) {
    const nombre = [pick(row, ["nombre", "name", "cliente"]), pick(row, ["apellido", "apellidos", "surname"])]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!nombre) continue;
    out.push({
      nombre,
      telefono: pick(row, ["telefono", "tlf", "movil", "phone"]) || null,
      email: pick(row, ["email", "correo", "e-mail"]) || null,
      fecha_inicio: toDate(pick(row, ["fecha inicio", "fecha de inicio", "alta", "fecha_inicio"])),
      cumpleanos: toDate(pick(row, ["fecha de nacimiento", "fecha nacimiento", "nacimiento", "cumpleanos", "cumple"])),
      notas: pick(row, ["notas", "nota", "observaciones"]) || null,
    });
  }
  return out;
}