import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { supabase, prettyBonoNombre, formatTipoBono, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConfirm } from "@/components/confirm-dialog";
import { useServicios, slugifyServicio, type Servicio } from "@/lib/servicios";

const NEW_TIPO_SENTINEL = "__nuevo__";
const BUILTIN_TIPOS = ["individual", "pareja", "grupal", "gympass", "prueba"];

function ServicioSelect({
  value,
  onChange,
  servicios,
  onCreate,
}: {
  value: string;
  onChange: (slug: string) => void;
  servicios: Servicio[];
  onCreate: (nombre: string) => Promise<string | null>;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const known = servicios.some((s) => s.slug === value);

  async function commit() {
    const nombre = draft.trim();
    setCreating(false);
    setDraft("");
    if (!nombre) return;
    const slug = await onCreate(nombre);
    if (slug) onChange(slug);
  }

  if (creating) {
    return (
      <Input
        autoFocus
        className="h-8"
        placeholder="Nuevo servicio"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") { setCreating(false); setDraft(""); }
        }}
        onBlur={() => void commit()}
      />
    );
  }
  return (
    <Select
      value={known ? value : NEW_TIPO_SENTINEL}
      onValueChange={(v) => {
        if (v === NEW_TIPO_SENTINEL) { setCreating(true); return; }
        onChange(v);
      }}
    >
      <SelectTrigger className="h-8">
        <SelectValue>{servicios.find((s) => s.slug === value)?.nombre ?? "—"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {servicios.map((s) => <SelectItem key={s.id} value={s.slug}>{s.nombre}</SelectItem>)}
        <SelectItem value={NEW_TIPO_SENTINEL}>+ Nuevo servicio…</SelectItem>
      </SelectContent>
    </Select>
  );
}

function TipoSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const isKnown = options.includes(value);
  if (creating) {
    return (
      <div className="flex gap-1">
        <Input
          autoFocus
          className="h-8"
          placeholder="nuevo tipo"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) { onChange(draft.trim()); setCreating(false); setDraft(""); }
            if (e.key === "Escape") { setCreating(false); setDraft(""); }
          }}
          onBlur={() => { if (draft.trim()) { onChange(draft.trim()); } setCreating(false); setDraft(""); }}
        />
      </div>
    );
  }
  return (
    <Select
      value={isKnown ? value : NEW_TIPO_SENTINEL}
      onValueChange={(v) => {
        if (v === NEW_TIPO_SENTINEL) { setCreating(true); return; }
        onChange(v);
      }}
    >
      <SelectTrigger className="h-8"><SelectValue>{formatTipoBono(value) || "—"}</SelectValue></SelectTrigger>
      <SelectContent>
        {options.map((t) => <SelectItem key={t} value={t}>{formatTipoBono(t)}</SelectItem>)}
        <SelectItem value={NEW_TIPO_SENTINEL}>+ Nuevo tipo…</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SortableRow({
  c,
  i,
  sortedLength,
  drafts,
  tipoOptions,
  getVal,
  setVal,
  removeRow,
}: {
  c: BonoCatalogo;
  i: number;
  sortedLength: number;
  drafts: Record<string, { precio: string; tipo: string; sesiones: string }>;
  tipoOptions: string[];
  getVal: (c: BonoCatalogo, field: "precio" | "tipo" | "sesiones") => string;
  setVal: (c: BonoCatalogo, field: "precio" | "tipo" | "sesiones", v: string) => void;
  removeRow: (c: BonoCatalogo) => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: c.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-10 text-center">
        <div className="flex items-center justify-center">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted transition-colors"
            title="Arrastrar para reordenar"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </TableCell>
      <TableCell className="w-40">
        <TipoSelect
          value={getVal(c, "tipo")}
          onChange={(v) => setVal(c, "tipo", v)}
          options={tipoOptions}
        />
      </TableCell>
      <TableCell className="font-medium">{prettyBonoNombre(c.nombre)}</TableCell>
      <TableCell className="w-24">
        <Input type="number" className="h-8" value={getVal(c, "sesiones")}
          onChange={(e) => setVal(c, "sesiones", e.target.value)} />
      </TableCell>
      <TableCell className="w-28">
        <Input type="number" step="5" className="h-8" value={getVal(c, "precio")}
          onChange={(e) => setVal(c, "precio", e.target.value)} />
      </TableCell>
      <TableCell className="w-16 text-right">
        <Button size="icon" variant="ghost" onClick={() => removeRow(c)}><Trash2 className="h-4 w-4" /></Button>
      </TableCell>
    </TableRow>
  );
}

export function CatalogoManager() {
  const { confirm, dialog } = useConfirm();
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
  async function saveAll() {
    const entries = Object.entries(drafts);
    if (entries.length === 0) return;
    for (const [, d] of entries) {
      if (Number.isNaN(Number(d.precio)) || Number.isNaN(Number(d.sesiones))) {
        toast.error("Valores numéricos inválidos");
        return;
      }
    }
    const results = await Promise.all(
      entries.map(([id, d]) =>
        supabase.from("bonos_catalogo").update({
          precio: Number(d.precio),
          tipo: d.tipo as BonoCatalogo["tipo"],
          sesiones_incluidas: Number(d.sesiones),
        }).eq("id", id)
      )
    );
    const err = results.find((r) => r.error);
    if (err?.error) { toast.error(err.error.message); return; }
    setDrafts({});
    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Cambios guardados");
  }
  async function removeRow(c: BonoCatalogo) {
    if (!(await confirm({ title: `¿Eliminar "${prettyBonoNombre(c.nombre)}"?`, description: "Esta acción no se puede deshacer." }))) return;
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
  const dirtyCount = Object.keys(drafts).length;
  const tipoOptions = useMemo(() => {
    const s = new Set<string>(BUILTIN_TIPOS);
    for (const c of catalogo) if (c.tipo) s.add(c.tipo);
    return Array.from(s);
  }, [catalogo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sorted.findIndex((c) => c.id === active.id);
    const newIndex = sorted.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newSorted = arrayMove(sorted, oldIndex, newIndex);

    // Reasignar orden = índice + 1 y filtrar los que cambiaron (comparando por id)
    const prevOrden = new Map(sorted.map((c) => [c.id, c.orden]));
    const changed = newSorted
      .map((c, idx) => ({ id: c.id, orden: idx + 1 }))
      .filter((u) => prevOrden.get(u.id) !== u.orden);
    if (changed.length === 0) return;

    const results = await Promise.all(
      changed.map((u) =>
        supabase.from("bonos_catalogo").update({ orden: u.orden }).eq("id", u.id)
      )
    );

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      toast.error("Error al reordenar");
      return;
    }

    qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
    toast.success("Orden actualizado");
  }

  return (
    <Card>
      {dialog}
      <CardHeader>
        <CardTitle>Tipos de bono y precios</CardTitle>
        <p className="text-xs text-muted-foreground">Los cambios afectan a Facturación y Bonos.</p>
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-40">Tipo</TableHead>
                <TableHead>Bono</TableHead>
                <TableHead className="w-24">Sesiones</TableHead>
                <TableHead className="w-28">Precio (€)</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext items={sorted.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {sorted.map((c, i) => (
                  <SortableRow
                    key={c.id}
                    c={c}
                    i={i}
                    sortedLength={sorted.length}
                    drafts={drafts}
                    tipoOptions={tipoOptions}
                    getVal={getVal}
                    setVal={setVal}
                    removeRow={removeRow}
                  />
                ))}
              </SortableContext>
              {adding && (
                <TableRow>
                  <TableCell className="w-10"></TableCell>
                  <TableCell className="w-40">
                    <TipoSelect
                      value={nuevo.tipo}
                      onChange={(v) => setNuevo({ ...nuevo, tipo: v })}
                      options={tipoOptions}
                    />
                  </TableCell>
                  <TableCell>
                    <Input className="h-8" placeholder="Nombre (p. ej. 10 ses 45')" value={nuevo.nombre}
                      onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
                  </TableCell>
                  <TableCell className="w-24">
                    <Input className="h-8" type="number" value={nuevo.sesiones_incluidas}
                      onChange={(e) => setNuevo({ ...nuevo, sesiones_incluidas: e.target.value.replace(/^0+(?=\d)/, "") })} />
                  </TableCell>
                  <TableCell className="w-28">
                    <Input className="h-8" type="number" step="5" value={nuevo.precio}
                      onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value.replace(/^0+(?=\d)/, "") })} />
                  </TableCell>
                  <TableCell className="w-16 text-right space-x-1">
                    <Button size="sm" onClick={addRow}>Añadir</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DndContext>
        <div className="pt-3 flex items-center justify-between gap-2">
          {!adding ? (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo tipo de bono
            </Button>
          ) : <span />}
          <Button onClick={saveAll} disabled={dirtyCount === 0}>
            Guardar cambios{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
