import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCenterConfig } from "@/lib/center-schedule";

const emailSchema = z.string().trim().email("Email inválido").max(255);
const passwordSchema = z.string().min(8, "Mínimo 8 caracteres").max(128);

export function AccountForm() {
  const { nombre: centroNombre, invalidate } = useCenterConfig();
  const [centro, setCentro] = useState("");
  const [centroLoading, setCentroLoading] = useState(false);
  const [centroTouched, setCentroTouched] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setCurrentEmail(data.user.email);
    });
  }, []);

  useEffect(() => {
    if (!centroTouched) setCentro(centroNombre);
  }, [centroNombre, centroTouched]);

  async function onChangeCentro(e: React.FormEvent) {
    e.preventDefault();
    const val = centro.trim();
    if (!val) return toast.error("El nombre del centro no puede estar vacío");
    if (val.length > 60) return toast.error("Máximo 60 caracteres");
    setCentroLoading(true);
    const { error } = await supabase
      .from("center_config")
      .update({ nombre: val } as never)
      .eq("id", true);
    setCentroLoading(false);
    if (error) return toast.error(error.message);
    setCentroTouched(false);
    invalidate();
    toast.success("Nombre del centro actualizado");
  }

  async function onChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(newEmail);
    if (!em.success) return toast.error(em.error.issues[0].message);
    if (em.data === currentEmail) return toast.error("El email es el mismo");
    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser(
      { email: em.data },
      { emailRedirectTo: `${window.location.origin}/` },
    );
    setEmailLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Hemos enviado un email de verificación a la dirección nueva y una notificación a la actual. El cambio se completará cuando ambos correos sean confirmados.");
    setNewEmail("");
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPass) return toast.error("Introduce tu contraseña actual");
    const pw = passwordSchema.safeParse(newPass);
    if (!pw.success) return toast.error(pw.error.issues[0].message);
    if (newPass !== confirmPass) return toast.error("Las nuevas contraseñas no coinciden");

    setPassLoading(true);
    // Reautentica con la contraseña actual
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPass,
    });
    if (signInErr) {
      setPassLoading(false);
      return toast.error("La contraseña actual no es correcta");
    }
    const { error } = await supabase.auth.updateUser({ password: pw.data });
    setPassLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada");
    setCurrentPass(""); setNewPass(""); setConfirmPass("");
  }

  async function onSendReset() {
    if (!currentEmail) return toast.error("No se ha detectado el email de la cuenta");
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(currentEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Te hemos enviado un enlace para restablecer la contraseña. Caduca en 1 hora.");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nombre del centro</CardTitle>
          <CardDescription>
            Se muestra en el menú lateral, en el acceso y en el portal de clientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangeCentro} className="space-y-3 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="centro-nombre">Nombre</Label>
              <Input
                id="centro-nombre"
                value={centro}
                onChange={(e) => { setCentro(e.target.value); setCentroTouched(true); }}
                maxLength={60}
                required
              />
            </div>
            <Button type="submit" disabled={!centroTouched || centroLoading}>
              {centroLoading ? "Guardando..." : "Guardar nombre"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email de acceso</CardTitle>
          <CardDescription>
            Cambiar el email requiere verificación desde el correo actual y el nuevo. Si el correo anterior no confirma el cambio en 24 horas, la solicitud caduca.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangeEmail} className="space-y-3 max-w-md">
            <div className="space-y-1.5">
              <Label>Email actual</Label>
              <Input value={currentEmail} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Nuevo email</Label>
              <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            </div>
            <Button type="submit" disabled={emailLoading}>
              {emailLoading ? "Enviando..." : "Solicitar cambio de email"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contraseña</CardTitle>
          <CardDescription>Introduce la contraseña actual y la nueva dos veces para confirmarla.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangePassword} className="space-y-3 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="cur-pass">Contraseña actual</Label>
              <Input id="cur-pass" type="password" autoComplete="current-password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pass">Nueva contraseña</Label>
              <Input id="new-pass" type="password" autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pass">Confirmar nueva contraseña</Label>
              <Input id="confirm-pass" type="password" autoComplete="new-password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} required />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={passLoading}>
                {passLoading ? "Guardando..." : "Cambiar contraseña"}
              </Button>
              <Button type="button" variant="outline" onClick={onSendReset} disabled={resetLoading}>
                {resetLoading ? "Enviando..." : "¿Olvidaste tu contraseña?"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}