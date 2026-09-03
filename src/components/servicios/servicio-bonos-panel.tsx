import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Tags, Pencil, MoreVertical, GripVertical, Check } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/confirm-dialog";
import {
  CaducidadSelect,
  caducidadLabel,
  type CaducidadValue,
} from "@/components/caducidad-select";
import { useServicios } from "@/lib/servicios";
import { useModalidades, MODALIDAD_NONE, type Modalidad } from "@/lib/modalidades";

interface Props {
  servicioSlug: string;
}

interface Draft {
  nombre: string;
  modalidad: string;
  sesiones: string;
  duracion: string;
  precio: string;
  caducidad: CaducidadValue;
}

const EMPTY: Draft = {
  nombre: "",
  modalidad: MODALIDAD_NONE,
  sesiones: "10",
  duracion: "60",
  precio: "0",
  caducidad: { tipo: null, dias: null },
};

/** Fila ordenable de la tabla de bonos (solo activa en modo edición). */
function SortableRow({
  id,
  editing,
  children,
}: {
  id: string;
  editing: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !editing });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    opacity: isDragging ? 0.85 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 10 : undefined,
  };
  const handle = editing ? (
    <TableCell className="p-0 w-6">
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label="Arrastrar para reordenar"
        className="flex h-8 w-6 cursor-grab touch-none items-center justify-center text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </TableCell>
  ) : null;
  return (
    <TableRow
      ref={setNodeRef}
      style={editing ? style : undefined}
      className={isDragging ? "bg-muted/50" : undefined}
    >
      {children(handle)}
    </TableRow>
  );
}

/** Gestión de los bonos ofrecidos por un servicio (crear, editar y eliminar). */
export function ServicioBonosPanel({ servicioSlug }: Props) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [modalOpen, setModalOpen] = useState(false);
  const [nuevaModalidad, setNuevaModalidad] = useState("");
  const [orderIds, setOrderIds] = useState<string[] | null>(null);
  const { data: modalidades = [] } = useModalidades(servicioSlug);
  const { data: servicios = [] } = useServicios();
  const servicio = servicios.find((s) => s.slug === servicioSlug);
  /** Caducidad por defecto configurada en el servicio. */
  const caducidadDefecto: CaducidadValue = {
    tipo: (servicio?.caducidad_tipo ?? null) as CaducidadValue["tipo"],
    dias: servicio?.caducidad_dias ?? null,
  };

  function startAdding() {
    setDraft({ ...EMPTY, caducidad: caducidadDefecto });
    setAdding(true);
    setEditing(true);
  }

  const { data: bonosData = [], isLoading } = useQuery({
    queryKey: ["bonos_catalogo", servicioSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bonos_catalogo")
        .select("*")
        .eq("servicio_slug", servicioSlug)
        .order("orden");
      if (error) throw error;
      return (data ?? []) as BonoCatalogo[];
    },
    enabled: !!servicioSlug,
  });

  /** Orden mostrado: el local mientras se arrastra, el del servidor en cuanto coincide. */
  const bonos = useMemo(() => {
    if (!orderIds) return bonosData;
    const map = new Map(bonosData.map((b) => [b.id, b]));
    const ordered = orderIds.map((id) => map.get(id)).filter(Boolean) as BonoCatalogo[];
    const rest = bonosData.filter((b) => !orderIds.includes(b.id));
    return [...ordered, ...rest];
  }, [bonosData, orderIds]);

  useEffect(() => {
    if (!orderIds) return;
    const serverIds = bonosData.map((b) => b.id).join(",");
    if (serverIds === bonos.map((b) => b.id).join(",")) setOrderIds(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonosData]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
  const invalidateModalidades = () => qc.invalidateQueries({ queryKey: ["modalidades"] });

  /** Reordena al instante y persiste el nuevo orden. */
  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = bonos.map((b) => b.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setOrderIds(next);
    const results = await Promise.all(
      next.map((id, i) => supabase.from("bonos_catalogo").update({ orden: i + 1 }).eq("id", id)),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) {
      toast.error(err.message);
      setOrderIds(null);
    }
    invalidate();
  }

  /** Crea una modalidad nueva para este servicio. */
  async function addModalidad() {
    const nombre = nuevaModalidad.trim();
    if (!nombre) return;
    const maxOrden = modalidades.reduce((m, x) => Math.max(m, x.orden ?? 0), 0);
    const { error } = await supabase
      .from("modalidades")
      .insert({ servicio_slug: servicioSlug, nombre, orden: maxOrden + 1 });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNuevaModalidad("");
    invalidateModalidades();
  }

  /** Renombra una modalidad y propaga el cambio a los bonos que la usan. */
  async function renameModalidad(m: Modalidad, nombre: string) {
    const nuevo = nombre.trim();
    if (!nuevo || nuevo === m.nombre) return;
    const { error } = await supabase.from("modalidades").update({ nombre: nuevo }).eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase
      .from("bonos_catalogo")
      .update({ modalidad: nuevo })
      .eq("servicio_slug", servicioSlug)
      .eq("modalidad", m.nombre);
    await supabase
      .from("client_bonos")
      .update({ modalidad: nuevo })
      .eq("servicio_slug", servicioSlug)
      .eq("modalidad", m.nombre);
    invalidateModalidades();
    invalidate();
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
  }

  /** Borra una modalidad y la desasigna de los bonos que la tuvieran. */
  async function removeModalidad(m: Modalidad) {
    const ok = await confirm({
      title: `¿Eliminar la modalidad "${m.nombre}"?`,
      description: "Los bonos que la usan quedarán sin modalidad.",
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("modalidades").delete().eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase
      .from("bonos_catalogo")
      .update({ modalidad: null })
      .eq("servicio_slug", servicioSlug)
      .eq("modalidad", m.nombre);
    invalidateModalidades();
    invalidate();
  }

  const updateRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BonoCatalogo> }) => {
      const { error } = await supabase.from("bonos_catalogo").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  async function addRow() {
    const nombre = draft.nombre.trim();
    if (!nombre) {
      toast.error("Pon un nombre al bono");
      return;
    }
    const maxOrden = bonos.reduce((m, b) => Math.max(m, b.orden ?? 0), 0);
    const { error } = await supabase.from("bonos_catalogo").insert({
      servicio_slug: servicioSlug,
      nombre,
      tipo: servicioSlug,
      modalidad: draft.modalidad === MODALIDAD_NONE ? null : draft.modalidad,
      sesiones_incluidas: Math.max(0, Number(draft.sesiones) || 0),
      duracion_min: draft.duracion ? Math.max(0, Number(draft.duracion) || 0) : null,
      precio: Number(draft.precio) || 0,
      orden: maxOrden + 1,
      caducidad_tipo: draft.caducidad.tipo,
      caducidad_dias: draft.caducidad.dias,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft(EMPTY);
    setAdding(false);
    invalidate();
    toast.success("Bono añadido");
  }

  async function removeRow(b: BonoCatalogo) {
    const ok = await confirm({
      title: `¿Eliminar "${b.nombre}"?`,
      description: "Los bonos ya asignados a clientes no se modifican.",
      confirmText: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("bonos_catalogo").delete().eq("id", b.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
    toast.success("Bono eliminado");
  }

  async function removeAll() {
    if (bonos.length === 0) return;
    const ok = await confirm({
      title: "¿Borrar todos los bonos de este servicio?",
      description: "Se eliminarán del catálogo. Los bonos ya asignados a clientes no se modifican.",
      confirmText: "Borrar todos",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from("bonos_catalogo")
      .delete()
      .eq("servicio_slug", servicioSlug);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
    toast.success("Bonos eliminados");
  }

  /** La columna de modalidad solo se muestra si el servicio tiene modalidades. */
  const showModalidad = modalidades.length > 0;
  const colCount = 5 + (showModalidad ? 1 : 0) + (editing ? 2 : 0);

  return (
    <div className="space-y-3">
      {dialog}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold leading-none tracking-tight">Bonos</h3>
        <div className="flex items-center gap-1">
          {editing && (
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setAdding(false); }}>
              <Check className="h-4 w-4 mr-1" /> Listo
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Opciones de bonos">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing((v) => !v)}>
                <Pencil className="h-4 w-4 mr-2" /> {editing ? "Salir de edición" : "Editar bonos"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setModalOpen(true)}>
                <Tags className="h-4 w-4 mr-2" /> Añadir modalidad
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  setTimeout(() => void removeAll(), 0);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Borrar todos los bonos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <table className="w-full caption-bottom text-sm table-fixed">
            <TableHeader>
              <TableRow>
                {editing && <TableHead className="w-6 px-0" />}
                {showModalidad && <TableHead className="w-24">Modalidad</TableHead>}
                <TableHead className="w-32">Bono</TableHead>
                <TableHead className="w-16 text-right">Sesiones</TableHead>
                <TableHead className="w-12 text-right">Duración</TableHead>
                <TableHead className="w-12 text-right">Precio</TableHead>
                <TableHead className="w-28 pr-0">Caducidad</TableHead>
                {editing && <TableHead className="w-8 px-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext items={bonos.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {bonos.map((b) => (
                  <SortableRow key={b.id} id={b.id} editing={editing}>
                    {(handle) => (
                      <>
                        {handle}
                        {showModalidad &&
                          (editing ? (
                            <TableCell>
                              <Select
                                value={b.modalidad ?? MODALIDAD_NONE}
                                onValueChange={(v) =>
                                  updateRow.mutate({
                                    id: b.id,
                                    patch: { modalidad: v === MODALIDAD_NONE ? null : v },
                                  })
                                }
                              >
                                <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={MODALIDAD_NONE}>—</SelectItem>
                                  {modalidades.map((m) => (
                                    <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          ) : (
                            <TableCell className="truncate">{b.modalidad ?? "—"}</TableCell>
                          ))}
                        {editing ? (
                          <TableCell>
                            <Input
                              className="h-8 w-full"
                              defaultValue={b.nombre}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== b.nombre) updateRow.mutate({ id: b.id, patch: { nombre: v } });
                              }}
                            />
                          </TableCell>
                        ) : (
                          <TableCell className="truncate">{b.nombre}</TableCell>
                        )}
                        {editing ? (
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              className="h-8 px-1.5 text-right no-spinner"
                              defaultValue={b.sesiones_incluidas}
                              onBlur={(e) => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                if (v !== b.sesiones_incluidas)
                                  updateRow.mutate({ id: b.id, patch: { sesiones_incluidas: v } });
                              }}
                            />
                          </TableCell>
                        ) : (
                          <TableCell className="text-right">{b.sesiones_incluidas}</TableCell>
                        )}
                        {editing ? (
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              className="h-8 px-1.5 text-right no-spinner"
                              defaultValue={b.duracion_min ?? ""}
                              onBlur={(e) => {
                                const raw = e.target.value;
                                const v = raw === "" ? null : Math.max(0, Number(raw) || 0);
                                if (v !== b.duracion_min)
                                  updateRow.mutate({ id: b.id, patch: { duracion_min: v } });
                              }}
                            />
                          </TableCell>
                        ) : (
                          <TableCell className="text-right">{b.duracion_min ?? "—"}</TableCell>
                        )}
                        {editing ? (
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 px-1.5 text-right no-spinner"
                              defaultValue={Number(b.precio)}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v !== Number(b.precio))
                                  updateRow.mutate({ id: b.id, patch: { precio: v } });
                              }}
                            />
                          </TableCell>
                        ) : (
                          <TableCell className="text-right">{Number(b.precio)}</TableCell>
                        )}
                        {editing ? (
                          <TableCell className="pr-0">
                            <CaducidadSelect
                              triggerClassName="h-8 w-full"
                              value={{
                                tipo: (b.caducidad_tipo ?? null) as CaducidadValue["tipo"],
                                dias: b.caducidad_dias ?? null,
                              }}
                              onChange={(v) =>
                                updateRow.mutate({
                                  id: b.id,
                                  patch: { caducidad_tipo: v.tipo, caducidad_dias: v.dias },
                                })
                              }
                            />
                          </TableCell>
                        ) : (
                          <TableCell className="pr-0 truncate">
                            {caducidadLabel({
                              tipo: (b.caducidad_tipo ?? null) as CaducidadValue["tipo"],
                              dias: b.caducidad_dias ?? null,
                            })}
                          </TableCell>
                        )}
                        {editing && (
                          <TableCell className="p-0">
                            <Button size="icon" variant="ghost" onClick={() => void removeRow(b)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </>
                    )}
                  </SortableRow>
                ))}
              </SortableContext>
              {adding && (
                <TableRow>
                  {editing && <TableCell className="p-0 w-6" />}
                  {showModalidad && (
                    <TableCell>
                      <Select
                        value={draft.modalidad}
                        onValueChange={(v) => setDraft({ ...draft, modalidad: v })}
                      >
                        <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MODALIDAD_NONE}>—</SelectItem>
                          {modalidades.map((m) => (
                            <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                  <TableCell>
                    <Input
                      autoFocus
                      className="h-8 w-full"
                      placeholder="Bono 10 sesiones"
                      value={draft.nombre}
                      onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 px-1.5 text-right no-spinner"
                      value={draft.sesiones}
                      onChange={(e) => setDraft({ ...draft, sesiones: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 px-1.5 text-right no-spinner"
                      value={draft.duracion}
                      onChange={(e) => setDraft({ ...draft, duracion: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 px-1.5 text-right no-spinner"
                      value={draft.precio}
                      onChange={(e) => setDraft({ ...draft, precio: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="pr-0">
                    <CaducidadSelect
                      triggerClassName="h-8 w-full"
                      value={draft.caducidad}
                      onChange={(v) => setDraft({ ...draft, caducidad: v })}
                    />
                  </TableCell>
                  {editing && <TableCell />}
                </TableRow>
              )}
              {!isLoading && bonos.length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-sm text-muted-foreground py-6">
                    Este servicio todavía no ofrece bonos.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
        </DndContext>
      </div>
      {adding ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void addRow()}>
            Guardar bono
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setDraft(EMPTY);
            }}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={startAdding}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo bono
          </Button>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modalidades del servicio</DialogTitle>
            <DialogDescription>
              Las modalidades son opcionales y sirven para distinguir variantes de un bono
              (por ejemplo Individual o Pareja).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {modalidades.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay modalidades.</p>
            )}
            {modalidades.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  className="h-8"
                  defaultValue={m.nombre}
                  onBlur={(e) => void renameModalidad(m, e.target.value)}
                />
                <Button size="icon" variant="ghost" onClick={() => void removeModalidad(m)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2">
              <Input
                className="h-8"
                placeholder="Nueva modalidad…"
                value={nuevaModalidad}
                onChange={(e) => setNuevaModalidad(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addModalidad();
                }}
              />
              <Button size="sm" onClick={() => void addModalidad()}>
                <Plus className="h-4 w-4 mr-1" /> Añadir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
