import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Tags, Pencil } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/confirm-dialog";
import {
  CaducidadSelect,
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

/** Gestión de los bonos ofrecidos por un servicio (crear, editar y eliminar). */
export function ServicioBonosPanel({ servicioSlug }: Props) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [modalOpen, setModalOpen] = useState(false);
  const [nuevaModalidad, setNuevaModalidad] = useState("");
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
  }

  const { data: bonos = [], isLoading } = useQuery({
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

  const invalidate = () => qc.invalidateQueries({ queryKey: ["bonos_catalogo"] });
  const invalidateModalidades = () => qc.invalidateQueries({ queryKey: ["modalidades"] });

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

  return (
    <div className="space-y-3">
      {dialog}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Modalidad</TableHead>
              <TableHead>Bono</TableHead>
              <TableHead className="w-24">Sesiones</TableHead>
              <TableHead className="w-24">Duración</TableHead>
              <TableHead className="w-24">Precio</TableHead>
              <TableHead className="w-48">Caducidad</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bonos.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Select
                    value={b.modalidad ?? MODALIDAD_NONE}
                    onValueChange={(v) =>
                      updateRow.mutate({ id: b.id, patch: { modalidad: v === MODALIDAD_NONE ? null : v } })
                    }
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MODALIDAD_NONE}>Sin modalidad</SelectItem>
                      {modalidades.map((m) => (
                        <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    defaultValue={b.nombre}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== b.nombre) updateRow.mutate({ id: b.id, patch: { nombre: v } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    defaultValue={b.sesiones_incluidas}
                    onBlur={(e) => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      if (v !== b.sesiones_incluidas)
                        updateRow.mutate({ id: b.id, patch: { sesiones_incluidas: v } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    defaultValue={b.duracion_min ?? ""}
                    onBlur={(e) => {
                      const raw = e.target.value;
                      const v = raw === "" ? null : Math.max(0, Number(raw) || 0);
                      if (v !== b.duracion_min)
                        updateRow.mutate({ id: b.id, patch: { duracion_min: v } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-8"
                    defaultValue={Number(b.precio)}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== Number(b.precio))
                        updateRow.mutate({ id: b.id, patch: { precio: v } });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <CaducidadSelect
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
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => void removeRow(b)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {adding && (
              <TableRow>
                <TableCell>
                  <Select
                    value={draft.modalidad}
                    onValueChange={(v) => setDraft({ ...draft, modalidad: v })}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MODALIDAD_NONE}>Sin modalidad</SelectItem>
                      {modalidades.map((m) => (
                        <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    autoFocus
                    className="h-8"
                    placeholder="Bono 10 sesiones"
                    value={draft.nombre}
                    onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    value={draft.sesiones}
                    onChange={(e) => setDraft({ ...draft, sesiones: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    value={draft.duracion}
                    onChange={(e) => setDraft({ ...draft, duracion: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-8"
                    value={draft.precio}
                    onChange={(e) => setDraft({ ...draft, precio: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <CaducidadSelect
                    value={draft.caducidad}
                    onChange={(v) => setDraft({ ...draft, caducidad: v })}
                  />
                </TableCell>
                <TableCell />
              </TableRow>
            )}
            {!isLoading && bonos.length === 0 && !adding && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Este servicio todavía no ofrece bonos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
        <Button size="sm" variant="outline" onClick={startAdding}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo bono
        </Button>
      )}
    </div>
  );
}
