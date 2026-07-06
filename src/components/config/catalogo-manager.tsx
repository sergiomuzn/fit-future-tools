import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { supabase, prettyBonoNombre, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const TIPO_LABEL: Record<string, string> = { individual: "Individual", pareja: "Pareja", grupal: "Grupal", gympass: "Gympass" };

export function CatalogoManager() {
  const qc = useQueryClient();
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => {
      const { data } = await supabase.from("bonos_catalogo").select("*").order("orden");
      return (data ?? []) as BonoCatalogo[];
    },
  });

  const [drafts, setDrafts] = useState<Record<string, { precio: string; tipo: string; sesiones: string }>>({});
  const [adding, setAdding] = useState(false);
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: string; sesiones_incluidas: string; precio: string }>({
    nombre: "", tipo: "individual", sesiones_incluidas: "1", precio: "0",
  });

  function getVal(c: BonoCatalogo, field: "precio" | "tipo" | "sesiones") {
    const d = drafts[c.id];
    if (d) return d[field];
    if (field === "precio") return String(c.precio);
    if (field === "sesiones") return String(c.sesiones_incluidas);
    return c.tipo;
  }
  function setVal(c: BonoCatalogo, field: "precio" | "tipo" | "sesiones", v: string) {
    if (field !== "tipo") v = v.replace(/^0+(?=\d)/, "");
    setDrafts((prev) => ({
      ...prev,
      [c.id]: {
        precio: field === "precio" ? v : prev[c.id]?.precio ?? String(c.precio),
        tipo: field === "tipo" ? v : prev[c.id]?.tipo ?? c.tipo,
        sesiones: field === "sesiones" ? v : prev[c.id]?.sesiones ?? String(c.sesiones_incluidas),
      },
    }));
  }
  async function saveRow(c: BonoCatalogo) {
    const d = drafts[c.id];
    if (!d) return;
    const precio = Number(d.precio);
    const sesiones = Number(d.sesiones);
    if (Number.isNaN(precio) || Number.isNaN(sesiones)) { toast.error("Valores numéricos inválidos"); return; }
    const { error } = await supabase.from("bonos_catalogo").update({
      precio,
      tipo: d.tipo as BonoCatalogo["tipo"],
      sesiones_incluidas: sesiones,
    }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    setDrafts((prev) => { const { [c.id]: _, ...rest } = prev; return rest; });
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Bono actualizado");
  }
  async function removeRow(c: BonoCatalogo) {
    if (!confirm(`¿Eliminar "${prettyBonoNombre(c.nombre)}"?`)) return;
    const { error } = await supabase.from("bonos_catalogo").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Bono eliminado");
  }
  async function addRow() {
    if (!nuevo.nombre.trim()) { toast.error("Nombre requerido"); return; }
    const sesiones = Number(nuevo.sesiones_incluidas);
    const precio = Number(nuevo.precio);
    if (Number.isNaN(sesiones) || Number.isNaN(precio)) { toast.error("Valores numéricos inválidos"); return; }
    const maxOrden = catalogo.reduce((m, c) => Math.max(m, c.orden), 0);
    const { error } = await supabase.from("bonos_catalogo").insert({
      nombre: nuevo.nombre.trim(),
      tipo: nuevo.tipo as BonoCatalogo["tipo"],
      sesiones_incluidas: sesiones,
      precio,
      orden: maxOrden + 1,
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Bono añadido");
    setNuevo({ nombre: "", tipo: "individual", sesiones_incluidas: "1", precio: "0" });
    setAdding(false);
  }

  const sorted = [...catalogo].sort((a, b) => a.orden - b.orden);

  async function moveRow(c: BonoCatalogo, direction: -1 | 1) {
    const idx = sorted.findIndex((x) => x.id === c.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const other = sorted[targetIdx];
    const { error: e1 } = await supabase.from("bonos_catalogo").update({ orden: other.orden }).eq("id", c.id);
    const { error: e2 } = await supabase.from("bonos_catalogo").update({ orden: c.orden }).eq("id", other.id);
    if (e1 || e2) { toast.error("Error al reordenar"); return; }
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipos de bono y precios</CardTitle>
        <p className="text-xs text-muted-foreground">Los cambios afectan a Facturación y Bonos.</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">Orden</TableHead>
              <TableHead className="w-40">Tipo</TableHead>
              <TableHead>Bono</TableHead>
              <TableHead className="w-24">Sesiones</TableHead>
              <TableHead className="w-28">Precio (€)</TableHead>
              <TableHead className="w-40"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c, i) => {
              const dirty = !!drafts[c.id];
              return (
                <TableRow key={c.id}>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => moveRow(c, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === sorted.length - 1} onClick={() => moveRow(c, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={getVal(c, "tipo")} onValueChange={(v) => setVal(c, "tipo", v)}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="font-medium">{prettyBonoNombre(c.nombre)}</TableCell>
                  <TableCell>
                    <Input type="number" className="h-8" value={getVal(c, "sesiones")}
                      onChange={(e) => setVal(c, "sesiones", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="5" className="h-8" value={getVal(c, "precio")}
                      onChange={(e) => setVal(c, "precio", e.target.value)} />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" disabled={!dirty} onClick={() => saveRow(c)}>Guardar</Button>
                    <Button size="icon" variant="ghost" onClick={() => removeRow(c)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {adding && (
              <TableRow>
                <TableCell>
                  <Select value={nuevo.tipo} onValueChange={(v) => setNuevo({ ...nuevo, tipo: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input className="h-8" placeholder="Nombre (p. ej. 10 ses 45')" value={nuevo.nombre}
                    onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Input className="h-8" type="number" value={nuevo.sesiones_incluidas}
                    onChange={(e) => setNuevo({ ...nuevo, sesiones_incluidas: e.target.value.replace(/^0+(?=\d)/, "") })} />
                </TableCell>
                <TableCell>
                  <Input className="h-8" type="number" step="5" value={nuevo.precio}
                    onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value.replace(/^0+(?=\d)/, "") })} />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" onClick={addRow}>Añadir</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {!adding && (
          <div className="pt-3">
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo tipo de bono
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}