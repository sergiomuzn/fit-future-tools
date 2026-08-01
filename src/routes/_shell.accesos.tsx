import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus, Ban, Trash2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bonoTipoClienteLabel } from "@/lib/client-portal-types";

export const Route = createFileRoute("/_shell/accesos")({
  head: () => ({
    meta: [
      { title: "Accesos de clientes · Fitness 360" },
      { name: "description", content: "Genera invitaciones y gestiona el acceso de los clientes al portal de reservas." },
      { property: "og:title", content: "Accesos de clientes · Fitness 360" },
      { property: "og:description", content: "Genera invitaciones y gestiona el acceso de los clientes al portal de reservas." },
    ],
  }),
  component: AccesosPage,
});

type Invitation = {
  id: string;
  code: string;
  nombre: string | null;
  email: string | null;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
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

function AccesosPage() {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");

  const { data: invitations = [] } = useQuery({
    queryKey: ["client_invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invitations")
        .select("id,code,nombre,email,expires_at,used_at,revoked_at,created_at")
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
        .select("id,nombre,email,bono_tipo,activo,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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
    <div className="space-y-4 p-4">
      <h1 className="font-display text-xl font-semibold tracking-tight">Accesos de clientes</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nueva invitación</CardTitle>
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
          <Button onClick={() => createInvitation.mutate()} disabled={createInvitation.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" /> Generar enlace
          </Button>
          <p className="w-full text-xs text-muted-foreground">El enlace caduca a los 7 días si no se usa.</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="invitaciones">
        <TabsList>
          <TabsTrigger value="invitaciones">Invitaciones ({invitations.length})</TabsTrigger>
          <TabsTrigger value="clientes">Clientes con acceso ({profiles.length})</TabsTrigger>
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
                      <span className="font-medium">{inv.nombre || inv.email || "Invitación"}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      /invitacion/{inv.code} · caduca {new Date(inv.expires_at).toLocaleDateString("es-ES")}
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
                    <span className="font-medium">{p.nombre}</span>
                    <Badge variant={p.activo ? "secondary" : "destructive"}>{p.activo ? "Activo" : "Revocado"}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.email} · {bonoTipoClienteLabel(p.bono_tipo)}
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
    </div>
  );
}