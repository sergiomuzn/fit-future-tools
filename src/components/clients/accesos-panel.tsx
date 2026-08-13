import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus, Ban, Trash2, RotateCcw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  accesoClienteLabel,
  bonoTipoClienteLabel,
  type AccesoCliente,
} from "@/lib/client-portal-types";
import { useServicios } from "@/lib/servicios";
import { InvitarClientesDialog } from "./invitar-clientes-dialog";
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

function generateCode(): string {
  const raw = crypto.randomUUID().replace(/-/g, "");
  return raw.slice(0, 20);
}

function invitationStatus(inv: Invitation): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
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

export function AccesosPanel() {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const { data: servicios = [] } = useServicios();
  const [seleccion, setSeleccion] = useState<string[]>(["grupos"]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const acceso: string | null =
    seleccion.length === 0
      ? null
      : seleccion.includes("personal") && seleccion.includes("grupos") && seleccion.length === 2
        ? ("ambos" satisfies AccesoCliente)
        : seleccion.join(",");
  const servicioLabel = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;

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
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      const { data, error } = await supabase
        .from("client_invitations")
        .insert([
          {
            code: generateCode(),
            nombre: nombre.trim() || null,
            email: email.trim() || null,
            expires_at: expires.toISOString(),
            acceso: acceso ?? "grupos",
          },
        ])
        .select("code")
        .single();
      if (error) throw error;
      return data!.code;
    },
    onSuccess: async (code) => {
      setNombre("");
      setEmail("");
      setSeleccion(["grupos"]);
      qc.invalidateQueries({ queryKey: ["client_invitations"] });
      const url = `${window.location.origin}/invitacion/${code}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Invitación creada y enlace copiado");
      } catch {
        toast.success("Invitación creada");
      }
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Nueva invitación</CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkOpen(true)}>
              <Users className="h-4 w-4" /> Invitar clientes
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-nombre">Nombre (opcional)</Label>
            <Input id="inv-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-52" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email (opcional)</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-64" />
          </div>
          <div className="space-y-1.5">
            <Label>Acceso&nbsp; a Servicio</Label>
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
          <Button
            onClick={() => {
              if (!acceso) return toast.error("Selecciona al menos un tipo de acceso");
              createInvitation.mutate();
            }}
            disabled={createInvitation.isPending}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> Generar enlace
          </Button>
          <p className="w-full text-xs text-muted-foreground">El enlace caduca a los 7 días si no se usa.</p>
        </CardContent>
      </Card>

      <InvitarClientesDialog open={bulkOpen} onOpenChange={setBulkOpen} />

      <Tabs defaultValue="invitaciones">
        <TabsList>
          <TabsTrigger value="invitaciones">Invitaciones ({invitations.length})</TabsTrigger>
          <TabsTrigger value="clientes">
            Clientes con acceso ({profiles.filter((p) => p.activo).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invitaciones" className="mt-3 space-y-2">
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
        </TabsContent>

        <TabsContent value="clientes" className="mt-3 space-y-2">
          {profiles.length === 0 && <p className="text-sm text-muted-foreground">Ningún cliente registrado todavía.</p>}
          {profiles.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openClientDetails({ clientId: p.client_id, email: p.email, nombre: p.nombre })}
                      className="font-medium text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {p.nombre}
                    </button>
                    <Badge variant={p.activo ? "secondary" : "destructive"}>{p.activo ? "Activo" : "Revocado"}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.email} · {bonoTipoClienteLabel(p.bono_tipo)} · {formatAcceso(p.acceso, servicioLabel)}
                  </p>
                </div>
                <Button
                  variant={p.activo ? "outline" : "default"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => toggleAccess.mutate({ id: p.id, activo: !p.activo })}
                >
                  {p.activo ? <Ban className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {p.activo ? "Revocar acceso" : "Reactivar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <ClientDetailsDialog
        client={viewingClient}
        defaultTab="info"
        onOpenChange={(open) => !open && setViewingClient(null)}
      />
    </div>
  );
}