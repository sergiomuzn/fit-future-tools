import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Ban, Trash2, RotateCcw, Link2, Pencil, ChevronDown, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { accesoClienteLabel, type AccesoCliente } from "@/lib/client-portal-types";
import { bonoTipoClienteLabel } from "@/lib/client-portal-types";
import { useServicios } from "@/lib/servicios";
import { cn } from "@/lib/utils";
import { crearInvitacionCliente, actualizarAccesoCliente } from "@/lib/accesos.functions";
import { InvitarClientesInline } from "./invitar-clientes-inline";
import { ClientDetailsDialog } from "./client-details-dialog";
import type { Client } from "@/lib/db";

type Invitation = {
  id: string;
  code: string;
  nombre: string | null;
  email: string | null;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  acceso: string | null;
};

function invitationStatus(inv: Invitation): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (inv.revoked_at) return { label: "Revocada", variant: "destructive" };
  if (inv.used_at) return { label: "Registrado", variant: "default" };
  if (new Date(inv.expires_at).getTime() < Date.now()) return { label: "Caducado", variant: "outline" };
  return { label: "Pendiente", variant: "secondary" };
}

function formatAcceso(acceso: string | null | undefined, servicioLabel: (slug: string) => string): string {
  if (!acceso) return accesoClienteLabel(acceso);
  if (acceso === "ambos") return `${servicioLabel("personal")} + ${servicioLabel("grupos")}`;
  return acceso
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(servicioLabel)
    .join(" + ");
}

function toAcceso(seleccion: string[]): string | null {
  if (seleccion.length === 0) return null;
  if (seleccion.includes("personal") && seleccion.includes("grupos") && seleccion.length === 2)
    return "ambos" satisfies AccesoCliente;
  return seleccion.join(",");
}

function fromAcceso(acceso: string | null | undefined): string[] {
  if (!acceso) return [];
  if (acceso === "ambos") return ["personal", "grupos"];
  return acceso.split(",").map((s) => s.trim()).filter(Boolean);
}

export function AccesosPanel() {
  const qc = useQueryClient();
  const { data: servicios = [] } = useServicios();
  const servicioLabel = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;

  const [expanded, setExpanded] = useState<"new" | "existing" | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [generated, setGenerated] = useState<{ code: string; url: string } | null>(null);
  const [emailInvitacion, setEmailInvitacion] = useState("");
  const [modoInvitacion, setModoInvitacion] = useState<"enlace" | "email">("enlace");

  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [editing, setEditing] = useState<{ id: string; nombre: string; seleccion: string[] } | null>(null);
  const [openInvitaciones, setOpenInvitaciones] = useState(false);
  const [openClientes, setOpenClientes] = useState(false);
  const [verRevocados, setVerRevocados] = useState(false);

  const crearInvitacion = useServerFn(crearInvitacionCliente);
  const actualizarAcceso = useServerFn(actualizarAccesoCliente);

  const { data: invitations = [] } = useQuery({
    queryKey: ["client_invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invitations")
        .select("id,code,nombre,email,expires_at,used_at,revoked_at,created_at,acceso")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invitation[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["client_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_profiles")
        .select("id,client_id,nombre,email,bono_tipo,activo,acceso,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function openClientDetails(opts: { clientId?: string | null; email?: string | null; nombre?: string | null }) {
    if (opts.clientId) {
      const { data } = await supabase.from("clients").select("*").eq("id", opts.clientId).maybeSingle();
      if (data) {
        setViewingClient(data as Client);
        return;
      }
    }
    if (opts.email) {
      const { data } = await supabase.from("clients").select("*").ilike("email", opts.email).limit(1);
      if (data && data.length > 0) {
        setViewingClient(data[0] as Client);
        return;
      }
    }
    if (opts.nombre) {
      const { data } = await supabase.from("clients").select("*").ilike("nombre", opts.nombre.trim()).limit(1);
      if (data && data.length > 0) {
        setViewingClient(data[0] as Client);
        return;
      }
    }
    toast.error("Este acceso no está vinculado a ninguna ficha de cliente");
  }

  const createInvitation = useMutation({
    mutationFn: async () => {
      const acceso = toAcceso(seleccion);
      if (!acceso) throw new Error("Selecciona al menos un servicio");
      return crearInvitacion({
        data: { acceso, enviarEmail: false, origin: window.location.origin },
      });
    },
    onSuccess: (res) => {
      setGenerated({ code: res.code, url: res.url });
      qc.invalidateQueries({ queryKey: ["client_invitations"] });
      try {
        void navigator.clipboard.writeText(res.url);
        toast.success("Invitación creada y enlace copiado");
      } catch {
        toast.success("Invitación creada");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviarInvitacionEmail = useMutation({
    mutationFn: async () => {
      const acceso = toAcceso(seleccion);
      if (!acceso) throw new Error("Selecciona al menos un servicio");
      const email = emailInvitacion.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Introduce un correo válido");
      return crearInvitacion({
        data: { acceso, email, enviarEmail: true, origin: window.location.origin },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["client_invitations"] });
      if (res.enviado) {
        toast.success("Invitación enviada por correo");
        setEmailInvitacion("");
        setSeleccion([]);
        setExpanded(null);
      } else {
        setGenerated({ code: res.code, url: res.url });
        toast.error(res.motivo ?? "No se pudo enviar el correo; usa el enlace");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarAcceso = useMutation({
    mutationFn: async ({ id, acceso }: { id: string; acceso: string }) =>
      actualizarAcceso({ data: { profileId: id, acceso } }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["client_profiles"] });
      toast.success("Acceso actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInvitation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_invitations"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteInvitation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_invitations"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAccess = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from("client_profiles").update({ activo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_profiles"] });
      qc.invalidateQueries({ queryKey: ["clientes_sin_acceso"] });
      toast.success("Acceso actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyLink(code: string) {
    const url = `${window.location.origin}/invitacion/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  const conAcceso = profiles.filter((p) => p.activo);
  const revocados = profiles.filter((p) => !p.activo);
  const pendientes = invitations.filter(
    (inv) => !inv.revoked_at && !inv.used_at && new Date(inv.expires_at).getTime() >= Date.now(),
  );

  function toggleCard(next: "new" | "existing") {
    setExpanded((prev) => (prev === next ? null : next));
  }

  function resetGenerated() {
    setGenerated(null);
    setSeleccion([]);
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* ================= Zona de acción ================= */}
      <div className="grid gap-6 lg:grid-cols-2 items-stretch">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nueva invitación</CardTitle>
            <CardDescription>Genera un enlace de acceso para un cliente nuevo</CardDescription>
          </CardHeader>
          <CardContent
            className={cn(
              "flex-1 flex flex-col",
              expanded !== "new" ? "items-center justify-center" : "items-start justify-start",
            )}
          >
            {expanded !== "new" ? (
              <Button onClick={() => toggleCard("new")} className="gap-1.5">
                <Link2 className="h-4 w-4" />
                Generar enlace
              </Button>
            ) : !generated ? (
              <div className="w-full space-y-4">
                <div className="flex min-h-9 flex-wrap items-center gap-4">
                  {servicios.length === 0 && (
                    <span className="text-sm text-muted-foreground">Sin servicios configurados</span>
                  )}
                  {servicios.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={seleccion.includes(s.slug)}
                        onCheckedChange={(v) =>
                          setSeleccion((prev) =>
                            v === true ? [...prev, s.slug] : prev.filter((x) => x !== s.slug),
                          )
                        }
                      />
                      {s.nombre}
                    </label>
                  ))}
                </div>
                <Button
                  onClick={() => createInvitation.mutate()}
                  disabled={createInvitation.isPending || seleccion.length === 0}
                  className="gap-1.5"
                >
                  <Link2 className="h-4 w-4" />
                  Generar enlace
                </Button>
              </div>
            ) : (
              <div className="w-full space-y-3">
                <p className="text-sm text-muted-foreground">Enlace generado:</p>
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{generated.url}</span>
                  <Button variant="ghost" size="sm" onClick={() => copyLink(generated.code)} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                </div>
                <Button variant="outline" onClick={resetGenerated}>
                  Generar otro enlace
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invitar clientes existentes</CardTitle>
            <CardDescription>Envía acceso a clientes ya registrados</CardDescription>
          </CardHeader>
          <CardContent
            className={cn(
              "flex-1 flex flex-col",
              expanded !== "existing" ? "items-center justify-center" : "items-start justify-start",
            )}
          >
            {expanded !== "existing" ? (
              <Button onClick={() => toggleCard("existing")}>Seleccionar clientes</Button>
            ) : (
              <InvitarClientesInline />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================= Zona de registro ================= */}
      <div className="space-y-3">
        <Collapsible open={openInvitaciones} onOpenChange={setOpenInvitaciones}>
          <Card>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-4 text-left">
              <span className="text-sm font-semibold">Invitaciones pendientes ({pendientes.length})</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${openInvitaciones ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-2 pt-0">
                {invitations.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin invitaciones todavía.</p>
                )}
                {invitations.map((inv) => {
                  const status = invitationStatus(inv);
                  return (
                    <div
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openClientDetails({ email: inv.email, nombre: inv.nombre })}
                            className="rounded text-left font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {inv.nombre || inv.email || "Invitación"}
                          </button>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatAcceso(inv.acceso, servicioLabel)} · /invitacion/{inv.code} · caduca{" "}
                          {new Date(inv.expires_at).toLocaleDateString("es-ES")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => copyLink(inv.code)} className="gap-1.5">
                          <Copy className="h-3.5 w-3.5" /> Copiar
                        </Button>
                        {!inv.used_at && !inv.revoked_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeInvitation.mutate(inv.id)}
                            className="gap-1.5"
                          >
                            <Ban className="h-3.5 w-3.5" /> Revocar
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteInvitation.mutate(inv.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible open={openClientes} onOpenChange={setOpenClientes}>
          <Card>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-4 text-left">
              <span className="text-sm font-semibold">Clientes con acceso ({conAcceso.length})</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${openClientes ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-2 pt-0">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={verRevocados} onCheckedChange={(v) => setVerRevocados(v === true)} />
                  Mostrar accesos revocados ({revocados.length})
                </label>

                {conAcceso.length === 0 && (
                  <p className="text-sm text-muted-foreground">Ningún cliente con acceso todavía.</p>
                )}
                {conAcceso.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openClientDetails({ clientId: p.client_id, email: p.email, nombre: p.nombre })}
                          className="rounded text-left font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {p.nombre}
                        </button>
                        <Badge variant="secondary">Activo</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.email} · {bonoTipoClienteLabel(p.bono_tipo)} · {formatAcceso(p.acceso, servicioLabel)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setEditing({ id: p.id, nombre: p.nombre, seleccion: fromAcceso(p.acceso) })}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar acceso
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => toggleAccess.mutate({ id: p.id, activo: false })}
                      >
                        <Ban className="h-3.5 w-3.5" /> Revocar
                      </Button>
                    </div>
                  </div>
                ))}

                {verRevocados &&
                  revocados.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.nombre}</span>
                          <Badge variant="destructive">Revocado</Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                      </div>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => toggleAccess.mutate({ id: p.id, activo: true })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reactivar
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Acceso de {editing?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground">Servicios</Label>
            {servicios.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={editing?.seleccion.includes(s.slug) ?? false}
                  onCheckedChange={(v) =>
                    setEditing((prev) =>
                      prev
                        ? {
                            ...prev,
                            seleccion:
                              v === true
                                ? [...prev.seleccion, s.slug]
                                : prev.seleccion.filter((x) => x !== s.slug),
                          }
                        : prev,
                    )
                  }
                />
                {s.nombre}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              disabled={guardarAcceso.isPending}
              onClick={() => {
                if (!editing) return;
                const acceso = toAcceso(editing.seleccion);
                if (!acceso) return toast.error("Selecciona al menos un servicio");
                guardarAcceso.mutate({ id: editing.id, acceso });
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientDetailsDialog
        client={viewingClient}
        defaultTab="info"
        onOpenChange={(open) => !open && setViewingClient(null)}
      />
    </div>
  );
}
