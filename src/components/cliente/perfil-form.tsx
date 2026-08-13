import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  nombre: string;
  email: string;
  telefono?: string | null;
}

export function PerfilForm({ nombre, email, telefono }: Props) {
  const [email1, setEmail1] = useState("");
  const [email2, setEmail2] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const [passActual, setPassActual] = useState("");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  async function reauth(password: string): Promise<boolean> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("La contraseña actual no es correcta");
      return false;
    }
    return true;
  }

  async function handleEmail() {
    const a = email1.trim().toLowerCase();
    const b = email2.trim().toLowerCase();
    if (!a || !b) return toast.error("Rellena ambos campos de correo");
    if (a !== b) return toast.error("Los correos no coinciden");
    if (!emailPass) return toast.error("Introduce tu contraseña actual");
    setSavingEmail(true);
    try {
      if (!(await reauth(emailPass))) return;
      const { error } = await supabase.auth.updateUser({ email: a });
      if (error) throw new Error(error.message);
      toast.success("Te hemos enviado un correo para confirmar el cambio");
      setEmail1("");
      setEmail2("");
      setEmailPass("");
      setShowEmailForm(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handlePassword() {
    if (pass1.length < 8) return toast.error("La nueva contraseña debe tener al menos 8 caracteres");
    if (pass1 !== pass2) return toast.error("Las contraseñas no coinciden");
    if (!passActual) return toast.error("Introduce tu contraseña actual");
    setSavingPass(true);
    try {
      if (!(await reauth(passActual))) return;
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw new Error(error.message);
      toast.success("Contraseña actualizada");
      setPassActual("");
      setPass1("");
      setPass2("");
      setShowPasswordForm(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPass(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Nombre: </span>
            {nombre}
          </p>
          <p>
            <span className="text-muted-foreground">Correo de acceso: </span>
            {email}
          </p>
          {telefono ? (
            <p>
              <span className="text-muted-foreground">Teléfono: </span>
              {telefono}
            </p>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Cambiar correo de acceso</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmailForm((v) => !v)}
            >
              {showEmailForm ? "Cancelar" : "Cambiar"}
            </Button>
          </div>
          {showEmailForm ? (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="perfil-email1">Nuevo correo</Label>
                <Input id="perfil-email1" type="email" value={email1} onChange={(e) => setEmail1(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perfil-email2">Repetir nuevo correo</Label>
                <Input id="perfil-email2" type="email" value={email2} onChange={(e) => setEmail2(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perfil-email-pass">Contraseña actual</Label>
                <Input
                  id="perfil-email-pass"
                  type="password"
                  value={emailPass}
                  onChange={(e) => setEmailPass(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={handleEmail} disabled={savingEmail}>
                Actualizar correo
              </Button>
              <p className="text-xs text-muted-foreground">
                Enviaremos un enlace de verificación al nuevo correo (válido 24 h). El cambio no se aplica hasta que lo
                confirmes; también avisamos al correo anterior.
              </p>
            </div>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Cambiar contraseña</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordForm((v) => !v)}
            >
              {showPasswordForm ? "Cancelar" : "Cambiar"}
            </Button>
          </div>
          {showPasswordForm ? (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="perfil-pass-act">Contraseña actual</Label>
                <Input
                  id="perfil-pass-act"
                  type="password"
                  value={passActual}
                  onChange={(e) => setPassActual(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perfil-pass1">Nueva contraseña</Label>
                <Input id="perfil-pass1" type="password" value={pass1} onChange={(e) => setPass1(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perfil-pass2">Repetir nueva contraseña</Label>
                <Input id="perfil-pass2" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
              </div>
              <Button size="sm" onClick={handlePassword} disabled={savingPass}>
                Actualizar contraseña
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
