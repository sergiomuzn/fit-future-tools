import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { useServicios, slugifyServicio } from "@/lib/servicios";

export function ServiciosManager() {
  const { confirm, dialog } = useConfirm();
  const qc = useQueryClient();
  const { data: servicios = [] } = useServicios();
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => {
      const { data } = await supabase.from("bonos_catalogo").select("*").order("orden");
      return data ?? [];
    },
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [nuevo, setNuevo] = useState("");

  async function saveName(id: string) {
    const nombre = draft.trim();
    if (!nombre) { setEditing(null); return; }
    const { error } = await supabase.from("servicios").update({ nombre }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditing(null);
    await qc.invalidateQueries({ queryKey: ["servicios"] });
    toast.success("Servicio actualizado");
  }

  async function remove(id: string, slug: string, nombre: string) {
    const usados = catalogo.filter((c: any) => (c.servicio_slug ?? "personal") === slug).length;
    const ok = await confirm({
      title: `¿Eliminar "${nombre}"?`,
      description: usados > 0
        ? `Hay ${usados} bono(s) asignados a este servicio. Reasígnalos antes de eliminarlo.`
        : "Esta acción no se puede deshacer.",
      confirmText: usados > 0 ? "Entendido" : "Eliminar",
      destructive: usados === 0,
    });
    if (!ok || usados > 0) return;
    const { error } = await supabase.from("servicios").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["servicios"] });
    toast.success("Servicio eliminado");
  }

  async function add() {
    const nombre = nuevo.trim();
    if (!nombre) { setAdding(false); setNuevo(""); return; }
    const slug = slugifyServicio(nombre);
    if (!slug) return;
    if (servicios.some((s) => s.slug === slug)) { toast.error("Ese servicio ya existe"); return; }
    const maxOrden = servicios.reduce((m, s) => Math.max(m, s.orden), 0);
    const { error } = await supabase.from("servicios").insert({ slug, nombre, orden: maxOrden + 1 });
    if (error) { toast.error(error.message); return; }
    setNuevo(""); setAdding(false);
    await qc.invalidateQueries({ queryKey: ["servicios"] });
    toast.success("Servicio añadido");
  }

  return (
    <Card>
      {dialog}
      <CardHeader>
        <CardTitle>Servicios</CardTitle>
        <p className="text-xs text-muted-foreground">Los servicios definen los accesos disponibles para los clientes.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {servicios.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            {editing === s.id ? (
              <>
                <Input
                  autoFocus
                  className="h-8 max-w-xs"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName(s.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
                <Button size="icon" variant="ghost" onClick={() => void saveName(s.id)}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{s.nombre}</span>
                <Button size="icon" variant="ghost" onClick={() => { setEditing(s.id); setDraft(s.nombre); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => void remove(s.id, s.slug, s.nombre)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}
        {adding ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              className="h-8 max-w-xs"
              placeholder="Nuevo servicio"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
                if (e.key === "Escape") { setAdding(false); setNuevo(""); }
              }}
            />
            <Button size="sm" onClick={() => void add()}>Añadir</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNuevo(""); }}>Cancelar</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo servicio
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
