import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  const [dragSlug, setDragSlug] = useState<string | null>(null);
  const [overSlug, setOverSlug] = useState<string | null>(null);

  const ordered = useMemo(() => {
    if (!dragSlug || !overSlug || dragSlug === overSlug) return servicios;
    const arr = servicios.slice();
    const from = arr.findIndex((s) => s.slug === dragSlug);
    const to = arr.findIndex((s) => s.slug === overSlug);
    if (from < 0 || to < 0) return servicios;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    return arr;
  }, [servicios, dragSlug, overSlug]);

  async function persistOrden() {
    const final = ordered;
    setDragSlug(null);
    setOverSlug(null);
    const changed = final.filter((s, i) => s.orden !== i + 1);
    if (changed.length === 0) return;
    queryClient.setQueryData(
      ["servicios"],
      final.map((s, i) => ({ ...s, orden: i + 1 })),
    );
    const results = await Promise.all(
      final.map((s, i) =>
        s.orden === i + 1
          ? Promise.resolve({ error: null })
          : supabase.from("servicios").update({ orden: i + 1 }).eq("id", s.id),
      ),
    );
    if (results.some((r) => r.error)) toast.error("No se pudo guardar el orden");
    queryClient.invalidateQueries({ queryKey: ["servicios"] });
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
        <TabsList>
          {ordered.map((s) => (
            <TabsTrigger
              key={s.id}
              value={s.slug}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragSlug(s.slug);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragSlug && s.slug !== overSlug) setOverSlug(s.slug);
              }}
              onDrop={(e) => {
                e.preventDefault();
                void persistOrden();
              }}
              onDragEnd={() => void persistOrden()}
              className={dragSlug === s.slug ? "opacity-60 cursor-grabbing" : "cursor-grab"}
            >
              {s.nombre}
            </TabsTrigger>
          ))}
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bonos</CardTitle>
                </CardHeader>
                <CardContent>
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
