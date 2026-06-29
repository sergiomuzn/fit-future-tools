import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Session, type Client, type Trainer, ESTADO_LABEL } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SesionEstado } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/_shell/sesiones")({ component: SesionesPage });

function SesionesPage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-past"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*").lte("fecha", today).order("fecha", { ascending: false }).order("hora_inicio", { ascending: false }).limit(500);
      return (data ?? []) as Session[];
    },
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: async () => (await supabase.from("clients").select("*")).data as Client[] ?? [] });
  const { data: trainers = [] } = useQuery({ queryKey: ["trainers"], queryFn: async () => (await supabase.from("trainers").select("*")).data as Trainer[] ?? [] });

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const trainerMap = new Map(trainers.map((t) => [t.id, t]));

  async function updateIncidencia(id: string, val: string) {
    const { error } = await supabase.from("sessions").update({ incidencia: val || null }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["sessions-past"] });
  }
  async function updateEstado(id: string, val: SesionEstado) {
    const { error } = await supabase.from("sessions").update({ estado: val }).eq("id", id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["sessions-past"] }); qc.invalidateQueries({ queryKey: ["client_bonos"] }); }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Sesiones realizadas</h1>
      <p className="text-sm text-muted-foreground">Histórico de sesiones pasadas. Edita la incidencia o el estado en línea.</p>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Entrenador</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Incidencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.fecha}</TableCell>
                <TableCell>{s.hora_inicio.slice(0,5)}–{s.hora_fin.slice(0,5)}</TableCell>
                <TableCell>{s.client_id ? clientMap.get(s.client_id)?.nombre : "—"}</TableCell>
                <TableCell>{s.trainer_id ? trainerMap.get(s.trainer_id)?.iniciales : "—"}</TableCell>
                <TableCell>
                  <Select value={s.estado} onValueChange={(v) => updateEstado(s.id, v as SesionEstado)}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ESTADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input defaultValue={s.incidencia ?? ""} onBlur={(e) => updateIncidencia(s.id, e.target.value)} placeholder="—" className="h-8" />
                </TableCell>
              </TableRow>
            ))}
            {sessions.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin sesiones aún</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}