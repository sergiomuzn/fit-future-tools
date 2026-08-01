import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listClases, reservarClase, cancelarReserva, getMyPortalProfile } from "@/lib/client-portal.functions";
import { bonoTipoClienteLabel, type ClaseGrupal } from "@/lib/client-portal-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { DIAS_SEMANA_LONG } from "@/lib/db";

export const Route = createFileRoute("/cliente")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mis clases · Fitness 360" },
      { name: "description", content: "Reserva y gestiona tus clases grupales en Fitness 360." },
      { property: "og:title", content: "Mis clases · Fitness 360" },
      { property: "og:description", content: "Reserva y gestiona tus clases grupales en Fitness 360." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: ClientePortal,
});

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DIAS_SEMANA_LONG[date.getDay()]} ${d} de ${date.toLocaleDateString("es-ES", { month: "long" })}`;
}

function ClientePortal() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyPortalProfile);
  const fetchClases = useServerFn(listClases);
  const reservar = useServerFn(reservarClase);
  const cancelar = useServerFn(cancelarReserva);
  const [tab, setTab] = useState("clases");

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ["portal-profile"],
    queryFn: () => fetchProfile({ data: undefined }),
  });

  const { data: clases = [], isLoading } = useQuery({
    queryKey: ["portal-clases"],
    queryFn: () => fetchClases({ data: undefined }),
    enabled: !!profile,
  });

  const bookMutation = useMutation({
    mutationFn: (key: string) => reservar({ data: { key } }),
    onSuccess: () => {
      toast.success("Plaza reservada");
      qc.invalidateQueries({ queryKey: ["portal-clases"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (sessionId: string) => cancelar({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Reserva cancelada");
      qc.invalidateQueries({ queryKey: ["portal-clases"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const misReservas = clases.filter((c) => c.reservada);

  if (!loadingProfile && !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <h1 className="font-display text-xl font-semibold">Cuenta sin acceso</h1>
        <p className="text-sm text-muted-foreground">
          Tu acceso de cliente no está activo. Contacta con el centro.
        </p>
        <Button variant="outline" onClick={handleSignOut}>
          Cerrar sesión
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold leading-tight">Fitness 360</h1>
            <p className="truncate text-xs text-muted-foreground">
              {profile ? `${profile.nombre} · ${bonoTipoClienteLabel(profile.bonoTipo)}` : "Cargando…"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="clases">Clases grupales</TabsTrigger>
            <TabsTrigger value="calendario">Calendario</TabsTrigger>
            <TabsTrigger value="reservas">Mis reservas{misReservas.length ? ` (${misReservas.length})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="clases" className="space-y-2">
            {isLoading && <p className="text-sm text-muted-foreground">Cargando clases…</p>}
            {!isLoading && clases.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay clases programadas en las próximas semanas.</p>
            )}
            {clases.map((c) => (
              <ClaseCard
                key={c.key}
                clase={c}
                onBook={() => bookMutation.mutate(c.key)}
                onCancel={() => c.miSesionId && cancelMutation.mutate(c.miSesionId)}
                busy={bookMutation.isPending || cancelMutation.isPending}
              />
            ))}
          </TabsContent>

          <TabsContent value="calendario">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando clases…</p>
            ) : (
              <CalendarioClases
                clases={clases}
                onBook={(c) => bookMutation.mutate(c.key)}
                onCancel={(c) => c.miSesionId && cancelMutation.mutate(c.miSesionId)}
                busy={bookMutation.isPending || cancelMutation.isPending}
              />
            )}
          </TabsContent>

          <TabsContent value="reservas" className="space-y-2">
            {misReservas.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no tienes reservas.</p>
            )}
            {misReservas.map((c) => (
              <ClaseCard
                key={c.key}
                clase={c}
                onBook={() => bookMutation.mutate(c.key)}
                onCancel={() => c.miSesionId && cancelMutation.mutate(c.miSesionId)}
                busy={bookMutation.isPending || cancelMutation.isPending}
              />
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ClaseCard({
  clase,
  onBook,
  onCancel,
  busy,
}: {
  clase: ClaseGrupal;
  onBook: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const completa = clase.ocupadas >= clase.capacidad;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{clase.nombre}</span>
            {clase.reservada && <Badge variant="secondary">Reservada</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatFecha(clase.fecha)} · {clase.horaInicio}–{clase.horaFin} ({clase.duracionMin} min)
          </p>
          <p className="text-xs text-muted-foreground">
            {clase.entrenador ? `Entrenador: ${clase.entrenador}` : "Entrenador por asignar"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-muted-foreground">
            {clase.ocupadas} de {clase.capacidad}
          </span>
          {clase.reservada ? (
            <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
          ) : (
            <Button size="sm" onClick={onBook} disabled={busy || completa}>
              {completa ? "Completa" : "Reservar"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}