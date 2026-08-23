import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Ban, Trash2, RotateCcw, Mail, Link2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { accesoClienteLabel, type AccesoCliente } from "@/lib/client-portal-types";
import { bonoTipoClienteLabel } from "@/lib/client-portal-types";
import { useServicios } from "@/lib/servicios";
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

  const [email, setEmail] = useState("");
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [editing, setEditing] = useState<{ id: string; nombre: string; seleccion: string[] } | null>(null);

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
    mutationFn: async (vars: { enviarEmail: boolean; email?: string }) => {
      const acceso = toAcceso(seleccion);
      if (!acceso) throw new Error("Selecciona al menos un servicio");
      if (vars.enviarEmail && !vars.email?.trim()) throw new Error("Indica el email del cliente");
      return crearInvitacion({
        data: {
          acceso,
          email: vars.enviarEmail ? vars.email!.trim() : undefined,
          enviarEmail: vars.enviarEmail,
          origin: window.location.origin,
        },
      });
    },
    onSuccess: async (res, vars) => {
      setEmail("");
      setSeleccion([]);
      qc.invalidateQueries({ queryKey: ["client_invitations"] });
      if (vars.enviarEmail) {
        setEmailDialogOpen(false);
        if (res.enviado) toast.success("Invitación enviada por correo");
        else toast.warning(res.motivo ?? "Invitación creada, pero el correo no se pudo enviar");
        return;
      }
      try {
        await navigator.clipboard.writeText(res.url);
        toast.success("Invitación creada y enlace copiado");
      } catch {
        toast.success("Invitación creada");
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

  return (
    <div className="space-y-6">
      {/* ---------- Nueva invitación ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Nueva invitación</h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Registrar un cliente nuevo con acceso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Acceso a servicios</Label>
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
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => createInvitation.mutate({ enviarEmail: false })}
                disabled={createInvitation.isPending}
                className="gap-1.5"
              >
                <Link2 className="h-4 w-4" />
                Generar enlace
              </Button>
              <Button
                variant="outline"
                onClick={() => setEmailDialogOpen(true)}
                disabled={createInvitation.isPending}
                className="gap-1.5"
              >
                <Mail className="h-4 w-4" />
                Enviar por correo
              </Button>
              <span className="text-xs text-muted-foreground">El enlace caduca a los 7 días si no se usa.</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Invitaciones ({invitations.length})
          </h3>
          {invitations.length === 0 && <p className="text-sm text-muted-foreground">Sin invitaciones todavía.</p>}
          {invitations.map((inv) => {
            const status = invitationStatus(inv);
            return (
              <Card key={inv.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
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
                      <Button variant="ghost" size="sm" onClick={() => revokeInvitation.mutate(inv.id)} className="gap-1.5">
                        <Ban className="h-3.5 w-3.5" /> Revocar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => deleteInvitation.mutate(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <hr />

      {/* ---------- Invitar clientes existentes ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Invitar clientes existentes</h2>
        <p className="text-sm text-muted-foreground">
          Envía el acceso al portal de reservas a clientes que ya están dados de alta.
        </p>
        <InvitarClientesInline />
      </section>

      <hr />

      {/* ---------- Clientes con acceso ---------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Clientes con acceso</h2>
        <div className="space-y-2">
          {conAcceso.length === 0 && (
            <p className="text-sm text-muted-foreground">Ningún cliente con acceso todavía.</p>
          )}
          {conAcceso.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
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
                    onClick={() =>
                      setEditing({ id: p.id, nombre: p.nombre, seleccion: fromAcceso(p.acceso) })
                    }
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
              </CardContent>
            </Card>
          ))}

          {profiles.some((p) => !p.activo) && (
            <>
              <h3 className="pt-2 text-sm font-medium text-muted-foreground">Accesos revocados</h3>
              {profiles
                .filter((p) => !p.activo)
                .map((p) => (
                  <Card key={p.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
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
                    </CardContent>
                  </Card>
                ))}
            </>
          )}
        </div>
      </section>


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Acceso de {editing?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar invitación por correo</DialogTitle>
            <DialogDescription>
              Selecciona el email del cliente. Recibirá un correo con el enlace y su email ya rellenado en el registro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-email-dialog">Email del cliente</Label>
              <Input
                id="inv-email-dialog"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={createInvitation.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={createInvitation.isPending || !email.trim()}
              onClick={() => createInvitation.mutate({ enviarEmail: true, email })}
            >
              {createInvitation.isPending ? "Enviando..." : "Enviar"}
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
