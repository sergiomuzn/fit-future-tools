import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase, type Trainer, type Session } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_shell/entrenadores")({
  component: EntrenadoresPage,
});

const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function EntrenadoresPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Trainer> | null>(null);

  const { data: trainers = [] } = useQuery({
    queryKey: ["trainers", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("*").order("nombre");
      return (data ?? []) as Trainer[];
    },
  });

  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = new Date(year, month + 1, 0);
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-month", start, end],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*").gte("fecha", start).lte("fecha", end).eq("estado", "realizada");
      return (data ?? []) as Session[];
    },
  });

  const countByTrainer = sessions.reduce<Record<string, number>>((acc, s) => {
    if (s.trainer_id) acc[s.trainer_id] = (acc[s.trainer_id] ?? 0) + 1;
    return acc;
  }, {});

  async function save() {
    if (!editing?.nombre || !editing.iniciales) { toast.error("Nombre e iniciales requeridos"); return; }
    const payload = { nombre: editing.nombre, iniciales: editing.iniciales, activo: editing.activo ?? true };
    const { error } = editing.id
      ? await supabase.from("trainers").update(payload).eq("id", editing.id)
      : await supabase.from("trainers").insert(payload);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["trainers"] }); setOpen(false); toast.success("Guardado"); }
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar entrenador?")) return;
    const { error } = await supabase.from("trainers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["trainers"] });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold">Entrenadores</h1>
        <Button onClick={() => { setEditing({ activo: true }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo
        </Button>
      </div>
      <div className="flex gap-2">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[year-2, year-1, year, year+1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Iniciales</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Entrenamientos {MONTHS[month]} {year}</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainers.map((t) => (
              <TableRow key={t.id}>
                <TableCell><span className="rounded bg-muted px-2 py-0.5 font-semibold text-xs">{t.iniciales}</span></TableCell>
                <TableCell className="font-medium">{t.nombre}</TableCell>
                <TableCell>{countByTrainer[t.id] ?? 0}</TableCell>
                <TableCell>
                  <Badge className={t.activo ? "bg-state-prueba/30 text-foreground border-state-prueba/30" : "bg-destructive/15 text-destructive border-destructive/20"}>
                    {t.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Nuevo"} entrenador</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={editing?.nombre ?? ""} onChange={(e) => {
              const nombre = e.target.value;
              const iniciales = nombre.split(/\s+/).filter(Boolean).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 3);
              setEditing({ ...editing, nombre, iniciales: iniciales || editing?.iniciales || "" });
            }} /></div>
            <div className="space-y-1.5"><Label>Iniciales</Label><Input maxLength={3} value={editing?.iniciales ?? ""} onChange={(e) => setEditing({ ...editing, iniciales: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={(editing?.activo ?? true) ? "activo" : "inactivo"} onValueChange={(v) => setEditing({ ...editing, activo: v === "activo" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}