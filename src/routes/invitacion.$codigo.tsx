import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validateInvitation, registerFromInvitation } from "@/lib/client-portal.functions";
import { BONO_TIPO_CLIENTE, type BonoTipoCliente } from "@/lib/client-portal-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCenterName } from "@/lib/center-schedule";

export const Route = createFileRoute("/invitacion/$codigo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Invitación · Fitness 360" },
      { name: "description", content: "Crea tu cuenta de cliente en Fitness 360 y reserva tus clases grupales." },
      { property: "og:title", content: "Invitación · Fitness 360" },
      { property: "og:description", content: "Crea tu cuenta de cliente en Fitness 360 y reserva tus clases grupales." },
    ],
  }),
  component: InvitacionPage,
});

const emailSchema = z.string().trim().email("Email inválido").max(255);

function InvitacionPage() {
  const centroNombre = useCenterName();
  const { codigo } = Route.useParams();
  const navigate = useNavigate();
  const check = useServerFn(validateInvitation);
  const register = useServerFn(registerFromInvitation);

  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [reason, setReason] = useState<string>("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [bonoTipo, setBonoTipo] = useState<BonoTipoCliente | "">("");
  const [existente, setExistente] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    check({ data: { code: codigo } })
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setState("ok");
          setExistente(Boolean(res.existente));
          const partes = (res.nombre ?? "").trim().split(/\s+/);
          setNombre(partes[0] ?? "");
          setApellido(partes.slice(1).join(" "));
          setEmail(res.email ?? "");
          if (res.telefono) setTelefono(res.telefono);
        } else {
          setState("invalid");
          setReason(
            res.reason === "expired"
              ? "Este enlace ha caducado."
              : res.reason === "used"
                ? "Este enlace ya se ha utilizado."
                : res.reason === "revoked"
                  ? "Este enlace ha sido revocado."
                  : "Este enlace no existe.",
          );
        }
      })
      .catch(() => {
        if (alive) {
          setState("invalid");
          setReason("No se ha podido validar el enlace.");
        }
      });
    return () => {
      alive = false;
    };
  }, [codigo, check]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    if (nombre.trim().length < 2) return toast.error("Escribe tu nombre");
    if (apellido.trim().length < 2) return toast.error("Escribe tu apellido");
    if (!existente && telefono.trim().length < 6) return toast.error("Escribe un teléfono válido");
    if (!email.trim()) return toast.error("El correo es obligatorio");
    if (!em.success) return toast.error(em.error.issues[0].message);
    if (password.length < 8) return toast.error("La contraseña debe tener mínimo 8 caracteres");
    if (password !== confirm) return toast.error("Las contraseñas no coinciden");
    if (!existente && !bonoTipo) return toast.error("Selecciona tu tipo de bono");

    setLoading(true);
    try {
      const res = await register({
        data: {
          code: codigo,
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          ...(existente ? {} : { telefono: telefono.trim() }),
          email: em.data,
          password,
          ...(existente ? {} : { bonoTipo: bonoTipo as BonoTipoCliente }),
        },
      });
      if (!res.ok) {
        setLoading(false);
        return toast.error(res.error);
      }
      const { error } = await supabase.auth.signInWithPassword({ email: em.data, password });
      setLoading(false);
      if (error) {
        toast.success("Cuenta creada. Inicia sesión para continuar.");
        navigate({ to: "/auth" });
        return;
      }
      toast.success("¡Bienvenido!");
      navigate({ to: "/cliente" });
    } catch (err) {
      setLoading(false);
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">{centroNombre}</CardTitle>
          <CardDescription>
            {state === "ok"
              ? existente
                ? "Activa tu acceso al portal de reservas"
                : "Crea tu cuenta para reservar clases grupales"
              : "Invitación"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "loading" && <p className="text-sm text-muted-foreground">Validando invitación…</p>}
          {state === "invalid" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{reason}</p>
              <p className="text-sm text-muted-foreground">
                Pide a tu centro que te envíe una nueva invitación.
              </p>
            </div>
          )}
          {state === "ok" && (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-nombre">Nombre</Label>
                  <Input
                    id="inv-nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    readOnly={existente}
                    className={existente ? "bg-muted text-muted-foreground" : undefined}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-apellido">Apellido</Label>
                  <Input
                    id="inv-apellido"
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    readOnly={existente}
                    className={existente ? "bg-muted text-muted-foreground" : undefined}
                    required
                  />
                </div>
              </div>
              {!existente && (
                <div className="space-y-1.5">
                  <Label htmlFor="inv-tel">Teléfono</Label>
                  <Input id="inv-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email</Label>
                <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-pass">Contraseña (mín. 8)</Label>
                <Input id="inv-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-pass2">Repetir contraseña</Label>
                <Input id="inv-pass2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              {!existente && (
                <div className="space-y-1.5">
                  <Label>Tipo de bono</Label>
                  <Select value={bonoTipo} onValueChange={(v) => setBonoTipo(v as BonoTipoCliente)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona tu tipo de bono" />
                    </SelectTrigger>
                    <SelectContent>
                      {BONO_TIPO_CLIENTE.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Activando…" : existente ? "Activar acceso" : "Crear cuenta"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}