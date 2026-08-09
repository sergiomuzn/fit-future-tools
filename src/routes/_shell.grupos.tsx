import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase, type Group, type Session, DIAS_SEMANA } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GroupDialog } from "@/components/groups/group-dialog";
import { useServicios } from "@/lib/servicios";

export const Route = createFileRoute("/_shell/grupos")({
  component: GruposPage,
});

function isGrupalSlug(slug: string) {
  return /grup/i.test(slug);
}
function isPersonalSlug(slug: string) {
  return /^(ep|personal)$/i.test(slug) || /personal/i.test(slug);
}

function GruposPage() {
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupEditing, setGroupEditing] = useState<Group | null>(null);
  const { data: servicios = [] } = useServicios();
  const [tab, setTab] = useState<string>("");

  useEffect(() => {
    if (!tab && servicios.length > 0) setTab(servicios[0].slug);
  }, [servicios, tab]);

  const current = servicios.find((s) => s.slug === tab);

  return (
    <div className="page-tabbed min-h-screen p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-display font-semibold">Servicios</h1>
        {current && isGrupalSlug(current.slug) && (
          <Button onClick={() => { setGroupEditing(null); setGroupOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo grupo
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {servicios.map((s) => (
            <TabsTrigger key={s.id} value={s.slug}>{s.nombre}</TabsTrigger>
          ))}
        </TabsList>
        {servicios.map((s) => (
          <TabsContent key={s.id} value={s.slug} className="pt-4">
            {isGrupalSlug(s.slug) ? (
              <GruposPanel onEdit={(g) => { setGroupEditing(g); setGroupOpen(true); }} />
            ) : isPersonalSlug(s.slug) ? (
              <div className="text-center text-muted-foreground py-12 border rounded-lg bg-card">
                Próximamente: configuración de disponibilidad de {s.nombre}.
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-12 border rounded-lg bg-card">
                {s.nombre}: sin configuración disponible por ahora.
              </div>
            )}
          </TabsContent>
        ))}
        {servicios.length === 0 && (
          <div className="text-center text-muted-foreground py-8 border rounded-lg bg-card">
            No hay servicios definidos. Créalos en Configuración.
          </div>
        )}
      </Tabs>

      <GroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} group={groupEditing} />
    </div>
  );
}

function GruposPanel({ onEdit }: { onEdit: (g: Group) => void }) {
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await supabase.from("groups").select("*").order("nombre")).data as Group[] ?? [],
  });
  // Derive each group's schedule from its agenda sessions (last ~90 days).
  const { data: groupSessions = [] } = useQuery({
    queryKey: ["group_sessions_for_groups_panel"],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const iso = from.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("sessions")
        .select("group_id,fecha,hora_inicio,client_id")
        .not("group_id", "is", null)
        .gte("fecha", iso);
      return (data ?? []) as Pick<Session, "group_id" | "fecha" | "hora_inicio" | "client_id">[];
    },
  });

  const scheduleByGroup = new Map<string, Map<string, Set<number>>>();
  for (const s of groupSessions) {
    if (!s.group_id) continue;
    const hora = (s.hora_inicio ?? "").slice(0, 5);
    const dow = new Date(`${s.fecha}T00:00:00`).getDay();
    if (hora) {
      if (!scheduleByGroup.has(s.group_id)) scheduleByGroup.set(s.group_id, new Map());
      const perHora = scheduleByGroup.get(s.group_id)!;
      if (!perHora.has(hora)) perHora.set(hora, new Set());
      perHora.get(hora)!.add(dow);
    }
  }

  function horarioSummary(groupId: string): string {
    const perHora = scheduleByGroup.get(groupId);
    if (!perHora || perHora.size === 0) return "—";
    return [...perHora.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hora, dows]) => {
        const days = [...dows].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        return `${days.map((d) => DIAS_SEMANA[d]).join(", ")} ${hora}`;
      })
      .join(" · ");
  }

  const sorted = [...groups].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {sorted.map((g) => (
        <div
          key={g.id}
          onClick={() => onEdit(g)}
          className={`group relative rounded-lg border bg-card p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition ${g.activo ? "" : "opacity-60"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{g.nombre}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Capacidad {g.capacidad}</div>
            </div>
            <span
              className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${g.activo ? "bg-state-prueba/30 text-state-prueba-fg" : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20"}`}
            >
              {g.activo ? "Activo" : "Inactivo"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {horarioSummary(g.id)}
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <div className="col-span-full text-center text-muted-foreground py-8 border rounded-lg bg-card">Sin grupos aún</div>
      )}
    </div>
  );
}
