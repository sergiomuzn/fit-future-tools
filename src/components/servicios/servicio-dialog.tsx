import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { slugifyServicio, type Servicio } from "@/lib/servicios";
import { useCenterConfig } from "@/lib/center-schedule";
import { defaultServicioColor, servicioColorKey } from "@/lib/colors";
import { ServicioBonosPanel } from "./servicio-bonos-panel";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Servicio a configurar; null para crear uno nuevo. */
  servicio: Servicio | null;
  servicios: Servicio[];
  onCreated?: (slug: string) => void;
}

/** Mismo menú para crear y configurar un servicio: nombre, capacidad, color, descripción y bonos. */
export function ServicioDialog({ open, onClose, servicio, servicios, onCreated }: Props) {
  const qc = useQueryClient();
  const { horario, precios, colores, invalidate } = useCenterConfig();
  const [nombre, setNombre] = useState("");
  const [capacidad, setCapacidad] = useState("1");
  const [descripcion, setDescripcion] = useState("");
  const [color, setColor] = useState("#3CC0F3");
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const slugActual = servicio?.slug ?? createdSlug;

  useEffect(() => {
    if (!open) return;
    setNombre(servicio?.nombre ?? "");
    setCapacidad(String(servicio?.capacidad_default ?? 1));
    setDescripcion(servicio?.descripcion ?? "");
    setCreatedSlug(null);
    const slug = servicio?.slug;
    setColor(slug ? (colores[servicioColorKey(slug)] ?? defaultServicioColor(slug)) : "#3CC0F3");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, servicio?.id]);

  async function saveColor(slug: string) {
    const next = { ...colores, [servicioColorKey(slug)]: color };
    const { error } = await supabase
      .from("center_config")
      .update({
        horario_base: horario as unknown as never,
        precios: precios as unknown as never,
        colores: next as unknown as never,
      })
      .eq("id", true);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  }

  async function save() {
    const n = nombre.trim();
    if (!n) {
      toast.error("Escribe un nombre de servicio");
      return;
    }
    const cap = Math.max(1, Number(capacidad) || 1);
    const desc = descripcion.trim() || null;

    if (slugActual) {
      const { error } = await supabase
        .from("servicios")
        .update({ nombre: n, capacidad_default: cap, descripcion: desc })
        .eq("slug", slugActual);
      if (error) {
        toast.error(error.message);
        return;
      }
      await saveColor(slugActual);
      await qc.invalidateQueries({ queryKey: ["servicios"] });
      toast.success("Servicio actualizado");
      onClose();
      return;
    }

    const slug = slugifyServicio(n);
    if (!slug) {
      toast.error("Nombre no válido");
      return;
    }
    if (servicios.some((s) => s.slug === slug)) {
      toast.error("Ese servicio ya existe");
      return;
    }
    const maxOrden = servicios.reduce((m, s) => Math.max(m, s.orden), 0);
    const { error } = await supabase
      .from("servicios")
      .insert({ slug, nombre: n, orden: maxOrden + 1, capacidad_default: cap, descripcion: desc });
    if (error) {
      toast.error(error.message);
      return;
    }
    await saveColor(slug);
    await qc.invalidateQueries({ queryKey: ["servicios"] });
    setCreatedSlug(slug);
    onCreated?.(slug);
    toast.success("Servicio creado. Añade ahora sus bonos.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{servicio ? `Configurar ${servicio.nombre}` : "Nuevo servicio"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre del servicio</Label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Entrenamiento personal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Capacidad por sesión</Label>
              <Input
                type="number"
                min={1}
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Plazas que se ofertan por defecto al crear sesiones y huecos de reservas de este
                servicio (se puede modificar en cada sesión).
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Color del servicio</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 rounded border border-input bg-background cursor-pointer"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <Input
                className="font-mono uppercase"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Define el color de sus sesiones en la Agenda y de la columna “Servicio”. Las sesiones
              realizadas se muestran en un tono algo más oscuro.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="En qué consiste este servicio…"
            />
          </div>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {slugActual ? "Cerrar" : "Cancelar"}
          </Button>
          <Button onClick={() => void save()}>
            {servicio || createdSlug ? "Guardar cambios" : "Crear servicio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
