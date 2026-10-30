import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyRoles } from "@/lib/roles";
import {
  listClases,
  reservarClase,
  cancelarReserva,
  getMyPortalProfile,
  listSesionesPersonales,
  getMiResumen,
  getPortalPreferencias,
} from "@/lib/client-portal.functions";
import { apuntarseCola, salirCola, responderCola } from "@/lib/cola-espera.functions";
import { colaTiempoLabel } from "@/lib/cola-espera";
import {
  getAvisosCancelacionCliente,
  ocultarAvisoCancelacion,
} from "@/lib/client-portal.functions";
import { cancelacionParaServicio } from "@/lib/cancelacion-antelacion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  accesoIncluyeGrupos,
  accesoIncluyePersonal,

  type ClaseGrupal,
  type ResumenCliente,
  type SesionPersonal,
} from "@/lib/client-portal-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { yaComenzo } from "@/lib/booking-antelacion";
import { cn, formatDateShort } from "@/lib/utils";
import { shade, REALIZADA_SHADE } from "@/lib/colors";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/notifications-bell";
import { useCenterName } from "@/lib/center-schedule";

export const Route = createFileRoute("/cliente")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mis clases · Tracli" },
      { name: "description", content: "Reserva y gestiona tus clases grupales en Tracli." },
      { property: "og:title", content: "Mis clases · Tracli" },
      { property: "og:description", content: "Reserva y gestiona tus clases grupales en Tracli." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const roles = await fetchMyRoles();
    if (roles.includes("admin") && !roles.includes("cliente")) throw redirect({ to: "/" });
  },
  component: ClientePortal,
});

function formatFecha(fecha: string): string {
  return formatDateShort(fecha);
}

function ClientePortal() {
  const centroNombre = useCenterName();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyPortalProfile);
  const fetchClases = useServerFn(listClases);
  const reservar = useServerFn(reservarClase);
  const cancelar = useServerFn(cancelarReserva);
  const fetchPersonales = useServerFn(listSesionesPersonales);
  const fetchResumen = useServerFn(getMiResumen);
  const fetchPrefs = useServerFn(getPortalPreferencias);
  const entrarCola = useServerFn(apuntarseCola);
  const dejarCola = useServerFn(salirCola);
  const responder = useServerFn(responderCola);
  const [tab, setTab] = useState("clases");

  const { data: behavior = { clienteVeCanceladas: false, canceladasNCSumanTotal: false, colaActiva: false } } = useQuery({
    queryKey: ["portal-prefs"],
    queryFn: () => fetchPrefs({ data: undefined }),
    refetchOnWindowFocus: true,
  });

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ["portal-profile"],
    queryFn: () => fetchProfile({ data: undefined }),
    refetchOnWindowFocus: true,
  });

  const { data: clases = [], isLoading } = useQuery({
    queryKey: ["portal-clases"],
    queryFn: () => fetchClases({ data: undefined }),
    refetchInterval: 1000,
    enabled: !!profile && accesoIncluyeGrupos(profile?.acceso),
    refetchOnWindowFocus: true,
  });

  const verGrupos = accesoIncluyeGrupos(profile?.acceso);
  const verPersonal = accesoIncluyePersonal(profile?.acceso);

  const { data: resumen } = useQuery({
    queryKey: ["portal-resumen"],
    queryFn: () => fetchResumen({ data: undefined }),
    enabled: !!profile,
    refetchOnWindowFocus: true,
  });

  const { data: personalesAll = [], isLoading: loadingPersonales } = useQuery({
    queryKey: ["portal-personales"],
    queryFn: () => fetchPersonales({ data: undefined }),
    refetchInterval: 1000,
    enabled: !!profile && verPersonal,
    refetchOnWindowFocus: true,
  });
  const personales = behavior.clienteVeCanceladas
    ? personalesAll
    : personalesAll.filter((s) => s.estado !== "cancelada");

  const [pendingAction, setPendingAction] = useState<{
    key: string;
    action: "reservar" | "cancelar";
  } | null>(null);

  // Confirmación antes de cancelar cualquier sesión
  const [confirmarCancel, setConfirmarCancel] = useState<{ sessionId: string; key: string } | null>(null);

  // Carga clases y sesiones personales a la vez y las aplica en el mismo instante,
  // para que la reserva no aparezca duplicada un momento entre ambas listas.
  async function refrescarListas() {
    const [nc, np] = await Promise.all([
      verGrupos ? fetchClases({ data: undefined }) : Promise.resolve(undefined),
      verPersonal ? fetchPersonales({ data: undefined }) : Promise.resolve(undefined),
    ]);
    if (nc !== undefined) qc.setQueryData(["portal-clases"], nc);
    if (np !== undefined) qc.setQueryData(["portal-personales"], np);
  }

  const bookMutation = useMutation({
    mutationFn: (key: string) => reservar({ data: { key } }),
    onMutate: (key: string) => setPendingAction({ key, action: "reservar" }),
    onSuccess: async (res) => {
      if (res?.ok === false) {
        toast.error(res.mensaje ?? "No se pudo reservar la plaza");
      } else {
        toast.success("Plaza reservada");
      }
      await Promise.all([
        refrescarListas(),
        qc.refetchQueries({ queryKey: ["portal-resumen"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPendingAction(null),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ sessionId }: { sessionId: string; key: string }) => cancelar({ data: { sessionId } }),
    onMutate: ({ key }) => setPendingAction({ key, action: "cancelar" }),
    onSuccess: async () => {
      toast.success("Reserva cancelada");
      await Promise.all([
        refrescarListas(),
        qc.refetchQueries({ queryKey: ["portal-resumen"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPendingAction(null),
  });

  const [colaBusy, setColaBusy] = useState<string | null>(null);
  const [avisoCola, setAvisoCola] = useState<{ posicion: number; avisoMin: number | null } | null>(null);

  // Aviso de política de cancelación antes de reservar
  const fetchAvisos = useServerFn(getAvisosCancelacionCliente);
  const guardarAviso = useServerFn(ocultarAvisoCancelacion);
  const { data: avisos } = useQuery({
    queryKey: ["portal-avisos-cancelacion"],
    queryFn: () => fetchAvisos({ data: undefined }),
    enabled: !!profile,
    refetchOnWindowFocus: true,
  });
  const [avisoReserva, setAvisoReserva] = useState<
    { key: string; servicioSlug: string; min: number } | null
  >(null);
  const [avisoLeido, setAvisoLeido] = useState(false);
  const [avisoNoMostrar, setAvisoNoMostrar] = useState(false);

  function pedirReserva(clase: { key: string; servicioSlug: string | null }) {
    const slug = clase.servicioSlug;
    const cfg = avisos?.config;
    const min = cfg ? cancelacionParaServicio(cfg, slug) : 0;
    if (!slug || min <= 0 || avisos?.aceptados[slug] === min) {
      bookMutation.mutate(clase.key);
      return;
    }
    setAvisoLeido(false);
    setAvisoNoMostrar(false);
    setAvisoReserva({ key: clase.key, servicioSlug: slug, min });
  }

  async function confirmarAvisoReserva() {
    if (!avisoReserva) return;
    const { key, servicioSlug, min } = avisoReserva;
    setAvisoReserva(null);
    if (avisoNoMostrar) {
      try {
        await guardarAviso({ data: { servicioSlug, cancelacionMin: min } });
        await qc.invalidateQueries({ queryKey: ["portal-avisos-cancelacion"] });
      } catch {
        /* la preferencia es opcional: no bloquea la reserva */
      }
    }
    bookMutation.mutate(key);
  }

  async function refrescar() {
    await Promise.all([
      refrescarListas(),
      qc.refetchQueries({ queryKey: ["portal-resumen"] }),
      qc.refetchQueries({ queryKey: ["notificaciones"] }),
      qc.refetchQueries({ queryKey: ["mis-ofertas-cola"] }),
    ]);
  }

  async function handleCola(
    clase: ClaseGrupal,
    accion: "entrar" | "salir" | "aceptar" | "rechazar",
  ) {
    setColaBusy(clase.key);
    try {
      if (accion === "entrar") {
        const r = await entrarCola({ data: { clave: clase.key } });
        if (r.avisoMin != null) {
          setAvisoCola({ posicion: r.posicion, avisoMin: r.avisoMin });
        } else {
          toast.success(`Estás en la cola, posición ${r.posicion}º`);
        }
      } else if (accion === "salir") {
        await dejarCola({ data: { clave: clase.key } });
        toast.success("Has salido de la cola");
      } else if (clase.colaId) {
        const res = await responder({
          data: { colaId: clase.colaId, accion: accion === "aceptar" ? "aceptar" : "rechazar" },
        });
        if (res?.ok === false) toast.error(res.mensaje ?? "Ya no hay plaza disponible");
        else toast.success(accion === "aceptar" ? "Plaza confirmada" : "Plaza rechazada");
      }
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setColaBusy(null);
    }
  }

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const misReservas = clases.filter((c) => c.reservada);
  /** Sesiones completas en las que estoy esperando en la cola. */
  const misColas = clases.filter((c) => !c.reservada && !!c.colaEstado);
  /** Ids ya mostrados como reserva, para no repetirlos como sesión personal. */
  const idsReservados = new Set(misReservas.map((c) => c.miSesionId).filter(Boolean) as string[]);
  const personalesUnicas = personales.filter((s) => !idsReservados.has(s.id));

  const defaultTab = verGrupos ? "calendario" : "reservas";
  const activeTab = ["calendario", "reservas", "bono"].includes(tab) ? tab : defaultTab;

  // Al cambiar de pestaña se recargan los datos para mostrar siempre la información actualizada.
  function handleTabChange(value: string) {
    setTab(value);
    qc.invalidateQueries({ queryKey: ["portal-clases"] });
    qc.invalidateQueries({ queryKey: ["portal-personales"] });
    qc.invalidateQueries({ queryKey: ["portal-resumen"] });
    qc.invalidateQueries({ queryKey: ["portal-prefs"] });
  }

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
            <h1 className="font-display text-lg font-semibold leading-tight">{centroNombre}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {profile ? profile.nombre : "Cargando…"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="gap-1.5" aria-label="Mi perfil">
              <Link to="/perfil">
                <User className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Perfil</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            {verGrupos && <TabsTrigger value="calendario">Calendario</TabsTrigger>}
            <TabsTrigger value="reservas">Mis reservas</TabsTrigger>
            <TabsTrigger value="bono">Mi bono</TabsTrigger>
          </TabsList>

          <TabsContent value="calendario">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando clases…</p>
            ) : (
              <CalendarioClases
                clases={clases}
                personales={personales}
                onBook={(c) => pedirReserva(c)}
                onCancel={(c) => c.miSesionId && setConfirmarCancel({ sessionId: c.miSesionId, key: c.key })}
                pendingAction={pendingAction}
                colaActiva={behavior.colaActiva}
                colaBusy={colaBusy}
                onCola={handleCola}
              />
            )}
          </TabsContent>

          <TabsContent value="reservas" className="space-y-2">
            {(isLoading || loadingPersonales) && (
              <p className="text-sm text-muted-foreground">Cargando reservas…</p>
            )}
            {misReservas.length === 0 && personalesUnicas.length === 0 && !isLoading && !loadingPersonales && (
              <p className="text-sm text-muted-foreground">Todavía no tienes reservas.</p>
            )}
            {misReservas.length + personalesUnicas.length > 0 && (
              <div className="flex items-center gap-2 pb-1">
                <Badge variant="secondary">
                  {misReservas.length + personalesUnicas.length}{" "}
                  {misReservas.length + personalesUnicas.length === 1 ? "reserva" : "reservas"}
                </Badge>
              </div>
            )}
            {misReservas.map((c) => (
              <ClaseCard
                key={c.key}
                clase={c}
                onBook={() => pedirReserva(c)}
                onCancel={() => c.miSesionId && setConfirmarCancel({ sessionId: c.miSesionId, key: c.key })}
                busyAction={pendingAction?.key === c.key ? pendingAction.action : null}
                colaActiva={behavior.colaActiva}
                colaBusy={colaBusy === c.key}
                onCola={(accion) => void handleCola(c, accion)}
              />
            ))}
            {misColas.map((c) => (
              <ClaseCard
                key={c.key}
                clase={c}
                onBook={() => pedirReserva(c)}
                onCancel={() => {}}
                busyAction={pendingAction?.key === c.key ? pendingAction.action : null}
                colaActiva={behavior.colaActiva}
                colaBusy={colaBusy === c.key}
                onCola={(accion) => void handleCola(c, accion)}
              />
            ))}
            {personalesUnicas.map((s) => (
              <SesionPersonalCard
                key={s.id}
                sesion={s}
                busy={pendingAction?.key === `personal|${s.id}`}
                onCancel={() => setConfirmarCancel({ sessionId: s.id, key: `personal|${s.id}` })}
              />
            ))}
          </TabsContent>

          <TabsContent value="bono">
            <ResumenBono resumen={resumen ?? null} sumarNC={behavior.canceladasNCSumanTotal} verCanceladas={behavior.clienteVeCanceladas} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={avisoCola !== null} onOpenChange={(open) => !open && setAvisoCola(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Estás en la cola</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Tu posición es la {avisoCola?.posicion}º.
                </p>
                {avisoCola?.avisoMin ? (
                  <p>
                    Si alguien se apunta detrás de ti, tendrás {colaTiempoLabel(avisoCola.avisoMin)} para
                    confirmar la plaza cuando quede libre.
                  </p>
                ) : (
                  <p>Si queda una plaza libre te avisaremos para que la confirmes.</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setAvisoCola(null)}>Entendido</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarCancel !== null} onOpenChange={(open) => !open && setConfirmarCancel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="space-y-3">
            <DialogTitle className="leading-relaxed pr-2 text-left">
              ¿Estás seguro de que quieres cancelar la sesión?
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setConfirmarCancel(null)}>
              No
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const c = confirmarCancel;
                setConfirmarCancel(null);
                if (c) cancelMutation.mutate(c);
              }}
            >
              Sí, cancelar sesión
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={avisoReserva !== null} onOpenChange={(open) => !open && setAvisoReserva(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar reserva</DialogTitle>
            <DialogDescription>
              {avisoReserva
                ? `Si cancelas esta sesión con menos de ${horasAviso(avisoReserva.min)} de antelación la sesión se contabilizará como realizada y se descontará de tu bono.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="aviso-leido"
                checked={avisoLeido}
                onCheckedChange={(v) => setAvisoLeido(v === true)}
              />
              <Label htmlFor="aviso-leido" className="text-sm font-normal leading-snug">
                He leído y entiendo la política de cancelación
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="aviso-no-mostrar"
                checked={avisoNoMostrar}
                onCheckedChange={(v) => setAvisoNoMostrar(v === true)}
              />
              <Label htmlFor="aviso-no-mostrar" className="text-sm font-normal leading-snug">
                No volver a mostrar este aviso
              </Label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setAvisoReserva(null)}>
                Cancelar
              </Button>
              <Button disabled={!avisoLeido} onClick={() => void confirmarAvisoReserva()}>
                Confirmar reserva
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "2 horas" / "90 minutos" para el texto del aviso de cancelación. */
function horasAviso(min: number): string {
  if (min % 60 === 0) {
    const h = min / 60;
    return h === 1 ? "1 hora" : `${h} horas`;
  }
  return `${min} minutos`;
}

function fechaCorta(fecha?: string | null): string {
  return formatDateShort(fecha);
}

function DatoFila({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function ResumenBono({ resumen, sumarNC, verCanceladas }: { resumen: ResumenCliente | null; sumarNC: boolean; verCanceladas: boolean }) {
  if (!resumen) return <p className="text-sm text-muted-foreground">Cargando información…</p>;
  const prox = resumen.proximaSesion;
  return (
    <div className="space-y-3">
      {resumen.bonos.length === 0 ? (
        <Card>
          <CardContent className="p-3 text-sm text-muted-foreground">
            No tienes ningún bono activo ahora mismo.
          </CardContent>
        </Card>
      ) : (
        <div className={`grid gap-3 ${resumen.bonos.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          {resumen.bonos.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              <div className="h-1.5 w-full" style={{ backgroundColor: b.color ?? "hsl(var(--muted))" }} />
              <CardContent className="p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: b.color ?? "hsl(var(--muted))" }}
                  />
                  <span className="truncate font-medium">{b.servicio ?? b.nombre ?? "Bono"}</span>
                </div>
                <DatoFila label="Tipo" value={b.tipo ? capitalizar(b.tipo) : "—"} />
                <DatoFila label="Bono" value={b.nombre ?? "—"} />
                {b.fechaCaducidad && (
                  <DatoFila label="Caduca el" value={fechaCorta(b.fechaCaducidad)} />
                )}
                <DatoFila
                  label="Sesiones restantes"
                  value={b.sesionesRestantes == null ? "—" : String(b.sesionesRestantes)}
                />
                <DatoFila
                  label="Sesiones realizadas"
                  value={b.sesionesRealizadas == null ? "—" : String(b.sesionesRealizadas)}
                />
                {verCanceladas && (
                  <DatoFila
                    label="Cancelaciones de este bono"
                    value={String(b.cancelaciones + (sumarNC ? b.cancelacionesNC : 0))}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardContent className="p-3">
          <DatoFila label="Último pago (renovación)" value={fechaCorta(resumen.ultimoPago)} />
          <DatoFila
            label="Próxima sesión"
            value={prox ? `${formatFecha(prox.fecha)} · ${prox.horaInicio} · ${prox.nombre}` : "Sin sesiones"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function SesionPersonalCard({
  sesion,
  onCancel,
  busy,
}: {
  sesion: SesionPersonal;
  onCancel?: () => void;
  busy?: boolean;
}) {
  const comenzada = yaComenzo(sesion.fecha, sesion.horaInicio);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{sesion.servicioNombre ?? sesion.titulo ?? "Sesión"}</span>
            {sesion.estado === "realizada" ? (
              <Badge variant="secondary">Realizada</Badge>
            ) : sesion.estado === "cancelada" ? (
              <Badge variant="destructive">Cancelada</Badge>
            ) : sesion.porConfirmar ? (
              <Badge variant="outline">Por confirmar</Badge>
            ) : (
              <Badge variant="secondary">Reservada</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatFecha(sesion.fecha)} · {sesion.horaInicio}–{sesion.horaFin} ({sesion.duracionMin} min)
          </p>
          <p className="text-xs text-muted-foreground">
            {sesion.entrenador ? `Entrenador: ${sesion.entrenador}` : "Entrenador por asignar"}
          </p>
        </div>
        {sesion.puedeCancelar && onCancel && !comenzada && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

type ColaAccion = "entrar" | "salir" | "aceptar" | "rechazar";

function ClaseCard({
  clase,
  onBook,
  onCancel,
  busyAction,
  hideCancel,
  colaActiva = false,
  colaBusy = false,
  onCola,
}: {
  clase: ClaseGrupal;
  onBook: () => void;
  onCancel: () => void;
  busyAction: "reservar" | "cancelar" | null;
  hideCancel?: boolean;
  colaActiva?: boolean;
  colaBusy?: boolean;
  onCola?: (accion: ColaAccion) => void;
}) {
  return (
    <ClaseCardImpl
      clase={clase}
      onBook={onBook}
      onCancel={onCancel}
      busyAction={busyAction}
      hideCancel={hideCancel}
      colaActiva={colaActiva}
      colaBusy={colaBusy}
      onCola={onCola}
    />
  );
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DOW_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Color de una clase: color del servicio, algo más oscuro si ya fue asistida. */
function claseColor(c: ClaseGrupal): string | undefined {
  if (!c.color) return undefined;
  return c.asistida ? shade(c.color, REALIZADA_SHADE) : c.color;
}

/** Convierte una sesión personal asignada por el centro en una entrada de calendario. */
function personalToClase(s: SesionPersonal): ClaseGrupal {
  return {
    key: `personal|${s.id}`,
    groupId: "",
    nombre: s.servicioNombre ?? s.titulo ?? "Sesión",
    fecha: s.fecha,
    horaInicio: s.horaInicio,
    horaFin: s.horaFin,
    duracionMin: s.duracionMin,
    entrenador: s.entrenador,
    capacidad: 1,
    ocupadas: 1,
    reservada: s.estado !== "cancelada",
    porConfirmar: s.porConfirmar && s.estado === "reservada",
    asistida: s.estado === "realizada",
    reservable: false,
    miSesionId: s.id,
    servicioSlug: s.servicioSlug,
    servicioNombre: s.servicioNombre,
    color: s.color,
  };
}

function CalendarioClases({
  clases,
  personales,
  onBook,
  onCancel,
  pendingAction,
  colaActiva = false,
  colaBusy = null,
  onCola,
}: {
  clases: ClaseGrupal[];
  personales: SesionPersonal[];
  onBook: (c: ClaseGrupal) => void;
  onCancel: (c: ClaseGrupal) => void;
  pendingAction: { key: string; action: "reservar" | "cancelar" } | null;
  colaActiva?: boolean;
  colaBusy?: string | null;
  onCola?: (clase: ClaseGrupal, accion: ColaAccion) => void;
}) {
  // Sesiones personales que reservó el propio cliente: puede cancelarlas desde el calendario.
  const personalesCancelables = new Set(
    personales.filter((s) => s.puedeCancelar).map((s) => `personal|${s.id}`),
  );
  // Una sesión reservada ya aparece en `clases`: no se repite como sesión personal.
  const idsEnClases = new Set(clases.map((c) => c.miSesionId).filter(Boolean) as string[]);
  const personalesUnicas = personales.filter((s) => !idsEnClases.has(s.id));
  const porDia = new Map<string, ClaseGrupal[]>();
  for (const c of [...clases, ...personalesUnicas.map(personalToClase)]) {
    const arr = porDia.get(c.fecha);
    if (arr) arr.push(c);
    else porDia.set(c.fecha, [c]);
  }
  // Días con reserva hecha por el cliente: un puntito por servicio distinto, del color del servicio.
  const reservasPorDia = new Map<string, string[]>();
  for (const [fecha, lista] of porDia) {
    const colores: string[] = [];
    for (const c of lista) {
      if ((c.reservada || c.asistida || c.porConfirmar) && c.color && !colores.includes(c.color)) {
        colores.push(c.color);
      }
    }
    if (colores.length) reservasPorDia.set(fecha, colores);
  }

  const hoyIso = ymd(new Date());
  const [selected, setSelected] = useState<string>(hoyIso);
  // Vista de 7 días: el día de hoy a la izquierda y los 6 siguientes.
  const [inicio, setInicio] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const cells: { d: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    cells.push({ d });
  }

  const hoyDate = new Date(`${hoyIso}T00:00:00`);
  const puedeAtras = inicio.getTime() > hoyDate.getTime();

  function shift(days: number) {
    const d = new Date(inicio);
    d.setDate(d.getDate() + days);
    if (d.getTime() < hoyDate.getTime()) d.setTime(hoyDate.getTime());
    setInicio(d);
    setSelected(ymd(d));
  }

  const delDia = porDia.get(selected) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center gap-2 p-3">
          <div className="flex shrink-0 flex-col gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Días anteriores"
              disabled={!puedeAtras}
              onClick={() => shift(-7)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Días siguientes"
              onClick={() => shift(7)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid flex-1 grid-cols-7 gap-1">
            {cells.map(({ d }) => {
              const key = ymd(d);
              const activo = key === selected;
              const tiene = (porDia.get(key)?.length ?? 0) > 0;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className="flex flex-col items-center gap-1 rounded-md py-1 text-xs"
                >
                  <span className={cn("font-medium", activo ? "text-foreground" : "text-muted-foreground")}>
                    {key === hoyIso ? "Hoy" : DOW_SHORT[(d.getDay() + 6) % 7]}
                  </span>
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition",
                      activo
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground hover:bg-accent",
                      !tiene && !activo && "text-muted-foreground",
                    )}
                  >
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium capitalize">{formatFecha(selected)}</p>
        {delDia.length === 0 && <p className="text-sm text-muted-foreground">No hay clases este día.</p>}
        {delDia.map((c) => (
          <ClaseCard
            key={c.key}
            clase={c}
            onBook={() => onBook(c)}
            onCancel={() => onCancel(c)}
            busyAction={pendingAction?.key === c.key ? pendingAction.action : null}
            hideCancel={c.key.startsWith("personal|") && !personalesCancelables.has(c.key)}
            colaActiva={colaActiva}
            colaBusy={colaBusy === c.key}
            onCola={(accion) => onCola?.(c, accion)}
          />
        ))}
      </div>
    </div>
  );
}

function ClaseCardImpl({
  clase,
  onBook,
  onCancel,
  busyAction,
  hideCancel = false,
  colaActiva = false,
  colaBusy = false,
  onCola,
}: {
  clase: ClaseGrupal;
  onBook: () => void;
  onCancel: () => void;
  busyAction: "reservar" | "cancelar" | null;
  hideCancel?: boolean;
  colaActiva?: boolean;
  colaBusy?: boolean;
  onCola?: (accion: ColaAccion) => void;
}) {
  const completa = clase.ocupadas >= clase.capacidad;
  const fueraDePlazo = !clase.reservable;
  const comenzada = yaComenzo(clase.fecha, clase.horaInicio);
  const puedeCola = colaActiva && !!onCola && !clase.reservada && !clase.asistida && !comenzada;
  const enCola = clase.colaEstado === "en_cola";
  const ofrecida = clase.colaEstado === "ofrecida";
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 items-stretch gap-3">
          <span
            aria-hidden
            className="w-1.5 shrink-0 self-stretch rounded-full bg-muted"
            style={clase.color ? { backgroundColor: claseColor(clase) } : undefined}
          />
          <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{clase.nombre}</span>
            {clase.asistida ? (
              <Badge variant="secondary">Asistida</Badge>
            ) : clase.porConfirmar ? (
              <Badge variant="outline">Pendiente de confirmar</Badge>
            ) : (
              clase.reservada && <Badge variant="secondary">Reservada</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {clase.horaInicio}–{clase.horaFin} ({clase.duracionMin} min)
          </p>
          <p className="text-xs text-muted-foreground">
            {clase.entrenador ? `Entrenador: ${clase.entrenador}` : "Entrenador por asignar"}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-foreground">
            {clase.ocupadas}/{clase.capacidad}
          </span>
          {puedeCola && ofrecida ? (
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={colaBusy} onClick={() => onCola?.("aceptar")}>
                Confirmar plaza
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={colaBusy}
                onClick={() => onCola?.("rechazar")}
              >
                Rechazar
              </Button>
            </div>
          ) : puedeCola && enCola ? (
            <div className="flex flex-row-reverse items-center justify-end gap-2 sm:flex-col sm:items-end">
              <span className="text-xs text-muted-foreground">
                {clase.colaPosicion}º en cola
              </span>
              <Button variant="outline" size="sm" disabled={colaBusy} onClick={() => onCola?.("salir")}>
                Salir de la cola
              </Button>
            </div>
          ) : puedeCola && completa && !fueraDePlazo ? (
            <Button size="sm" disabled={colaBusy} onClick={() => onCola?.("entrar")}>
              {colaBusy ? "Procesando…" : "Apuntarme a la cola"}
            </Button>
          ) : busyAction ? (
            <Button variant="outline" size="sm" className="min-w-24" disabled>
              Procesando…
            </Button>
          ) : clase.asistida ? (
            <span className="text-sm text-muted-foreground">Completada</span>
          ) : clase.reservada ? (
            hideCancel ? null : (
               <Button variant="outline" size="sm" className="min-w-24" onClick={onCancel} disabled={comenzada}>
                Cancelar
              </Button>
            )
          ) : fueraDePlazo ? (
            <span className="text-sm text-muted-foreground">
              {comenzada ? "Realizada" : "Fuera de plazo"}
            </span>
          ) : (
             <Button size="sm" className="min-w-24" onClick={onBook} disabled={completa}>
              {completa ? "Completa" : "Reservar"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
