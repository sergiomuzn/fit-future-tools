import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MoreVertical, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useServicios } from "@/lib/servicios";
import { useColores } from "@/lib/colors";
import { ServicioBonosPanel } from "@/components/servicios/servicio-bonos-panel";
import { ServicioReservasPanel } from "@/components/servicios/servicio-reservas-panel";
import { ServicioDialog } from "@/components/servicios/servicio-dialog";

export const Route = createFileRoute("/_shell/grupos")({
  component: ServiciosPage,
});

function ServiciosPage() {
  const { data: servicios = [] } = useServicios();
  const { servicioColor } = useColores();
  const [tab, setTab] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!tab && servicios.length > 0) setTab(servicios[0].slug);
  }, [servicios, tab]);

  const editing = servicios.find((s) => s.slug === editingSlug) ?? null;

  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    slug: string;
    from: number;
    startX: number;
    rects: { left: number; width: number }[];
  } | null>(null);
  const [dragSlug, setDragSlug] = useState<string | null>(null);
  const [dx, setDx] = useState(0);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);

  async function persistOrden(from: number, to: number) {
    const arr = servicios.slice();
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    if (arr.every((s, i) => s.orden === i + 1)) return;
    queryClient.setQueryData(
      ["servicios"],
      arr.map((s, i) => ({ ...s, orden: i + 1 })),
    );
    const results = await Promise.all(
      arr.map((s, i) =>
        s.orden === i + 1
          ? Promise.resolve({ error: null })
          : supabase.from("servicios").update({ orden: i + 1 }).eq("id", s.id),
      ),
    );
    if (results.some((r) => r.error)) toast.error("No se pudo guardar el orden");
    queryClient.invalidateQueries({ queryKey: ["servicios"] });
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, index: number, slug: string) {
    if (e.button !== 0) return;
    const list = listRef.current;
    if (!list) return;
    const nodes: HTMLElement[] = Array.from(
      list.querySelectorAll("[data-tab-slug]"),
    ) as HTMLElement[];
    const rects = nodes.map((n: HTMLElement) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, width: r.width };
    });
    dragRef.current = { slug, from: index, startX: e.clientX, rects };
    setDragSlug(slug);
    setDx(0);
    setTargetIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    const delta = e.clientX - d.startX;
    setDx(delta);
    const center = d.rects[d.from].left + d.rects[d.from].width / 2 + delta;
    let idx = d.from;
    while (idx > 0 && center < d.rects[idx - 1].left + d.rects[idx - 1].width / 2) idx--;
    while (
      idx < d.rects.length - 1 &&
      center > d.rects[idx + 1].left + d.rects[idx + 1].width / 2
    )
      idx++;
    setTargetIndex(idx);
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    const to = targetIndex ?? d.from;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setDragSlug(null);
    setDx(0);
    setTargetIndex(null);
    if (to !== d.from) void persistOrden(d.from, to);
  }

  /** Desplazamiento horizontal de cada pestaña mientras se arrastra. */
  function shiftFor(index: number): number {
    const d = dragRef.current;
    if (!d || targetIndex === null || index === d.from) return 0;
    const w = d.rects[d.from].width + 4;
    if (index > d.from && index <= targetIndex) return -w;
    if (index < d.from && index >= targetIndex) return w;
    return 0;
  }

  return (
    <div className="page-tabbed min-h-full p-6 space-y-4">
      <div className="flex min-h-10 items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-display font-semibold">Servicios</h1>
          <p className="text-sm text-muted-foreground">
            Panel de control de cada servicio: información, bonos y reservas.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingSlug(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Nuevo servicio
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList ref={listRef}>
          {servicios.map((s, i) => {
            const dragging = dragSlug === s.slug;
            const offset = dragging ? dx : shiftFor(i);
            return (
              <TabsTrigger
                key={s.id}
                value={s.slug}
                data-tab-slug={s.slug}
                onPointerDown={(e) => onPointerDown(e, i, s.slug)}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{
                  transform: offset ? `translateX(${offset}px)` : undefined,
                  transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22,1,0.36,1)",
                  zIndex: dragging ? 20 : undefined,
                  touchAction: "none",
                }}
                className={dragging ? "cursor-grabbing shadow-sm" : "cursor-grab"}
              >
                {s.nombre}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {servicios.map((s) => (
          <TabsContent key={s.id} value={s.slug} className="pt-4 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full border"
                    style={{ backgroundColor: servicioColor(s.slug) ?? undefined }}
                    aria-hidden
                  />
                  <CardTitle className="text-base">{s.nombre}</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Ajustes del servicio"
                  onClick={() => {
                    setEditingSlug(s.slug);
                    setDialogOpen(true);
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Plazas por sesión: </span>
                  {s.capacidad_default} {s.capacidad_default === 1 ? "plaza" : "plazas"}
                </p>
                <p className={s.descripcion ? "" : "text-muted-foreground"}>
                  {s.descripcion ?? "Sin descripción. Añádela desde los ajustes del servicio."}
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
              <Card className="xl:col-span-2">
                <CardContent className="p-6">
                  <ServicioBonosPanel servicioSlug={s.slug} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Reservas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ServicioReservasPanel servicioSlug={s.slug} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}

        {servicios.length === 0 && (
          <div className="text-center text-muted-foreground py-8 border rounded-lg bg-card">
            Aún no hay servicios. Crea el primero con “Nuevo servicio”.
          </div>
        )}
      </Tabs>

      <ServicioDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        servicio={editing}
        servicios={servicios}
        onCreated={(slug) => setTab(slug)}
      />
    </div>
  );
}
