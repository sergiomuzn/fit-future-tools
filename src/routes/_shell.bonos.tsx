import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { supabase, type ClientBono, type Client, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_shell/bonos")({ component: BonosPage });

function BonosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientBono | null>(null);

  const { data: bonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => {
      const { data } = await supabase.from("client_bonos").select("*").order("updated_at", { ascending: false });
      return (data ?? []) as ClientBono[];
    },
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*");
      return (data ?? []) as Client[];
    },
  });
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  // Activos primero (cronológico), luego inactivos
  const sorted = [...bonos].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return (b.ultimo_bono_fecha ?? "").localeCompare(a.ultimo_bono_fecha ?? "");
  });

  async function save() {
    if (!editing) return;
    const { error } = await supabase.from("client_bonos").update({
      sesiones_disponibles: editing.sesiones_disponibles,
      sesiones_realizadas: editing.sesiones_realizadas,
      activo: editing.activo,
    }).eq("id", editing.id);
    if (error) toast.error(error.message);
    else { qc.invalidateQueries({ queryKey: ["client_bonos"] }); setOpen(false); toast.success("Bono actualizado"); }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Bonos</h1>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Disponibles</TableHead>
              <TableHead>Realizadas</TableHead>
              <TableHead>Restantes</TableHead>
              <TableHead>Último bono</TableHead>
              <TableHead>Última fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((b) => (
              <TableRow key={b.id} className={b.activo ? "" : "opacity-60"}>
                <TableCell className="font-medium">{clientMap.get(b.client_id)?.nombre ?? "?"}</TableCell>
                <TableCell>{b.sesiones_disponibles + b.sesiones_realizadas}</TableCell>
                <TableCell>{b.sesiones_realizadas}</TableCell>
                <TableCell className={b.sesiones_disponibles <= 1 ? "text-orange-500 font-semibold" : ""}>{b.sesiones_disponibles}</TableCell>
                <TableCell>{b.ultimo_bono_nombre ?? "—"}</TableCell>
                <TableCell>{b.ultimo_bono_fecha ?? "—"}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.activo ? "bg-state-prueba/30 text-state-prueba-fg" : "bg-muted text-muted-foreground"}`}>
                    {b.activo ? "Activo" : "Inactivo"}
                  </span>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(b); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin bonos aún · añade una factura para generar uno</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar bono</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="text-sm text-muted-foreground">{clientMap.get(editing.client_id)?.nombre}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Disponibles</Label><Input type="number" value={editing.sesiones_disponibles} onChange={(e) => setEditing({ ...editing, sesiones_disponibles: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Realizadas</Label><Input type="number" value={editing.sesiones_realizadas} onChange={(e) => setEditing({ ...editing, sesiones_realizadas: Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.activo} onCheckedChange={(c) => setEditing({ ...editing, activo: c })} /><Label>Activo</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}