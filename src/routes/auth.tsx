import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { homePathForCurrentUser } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getDevRoleOverride } from "@/lib/dev-role-preview";
import { useCenterName } from "@/lib/center-schedule";
import { Eye, EyeOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { resendVerificationEmail } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Email inválido").max(255);

function AuthPage() {
  const navigate = useNavigate();
  const centroNombre = useCenterName();
  const [mode, setMode] = useState<"signin" | "forgot" | "verify">("signin");
  const [isCliente, setIsCliente] = useState(false);

  useEffect(() => {
    setIsCliente(getDevRoleOverride() === "cliente");
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void homePathForCurrentUser().then((path) => navigate({ to: path }));
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">TRA</CardTitle>
          {!isCliente && <CardDescription>Accede a la gestión del centro</CardDescription>}
        </CardHeader>
        <CardContent>
          {mode === "forgot" ? (
            <ForgotForm onBack={() => setMode("signin")} />
          ) : mode === "verify" ? (
            <ResendVerifyForm onBack={() => setMode("signin")} />
          ) : (
            <SignInForm onForgot={() => setMode("forgot")} onVerify={() => setMode("verify")} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SignInForm({ onForgot, onVerify }: { onForgot: () => void; onVerify: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    if (!em.success) return toast.error(em.error.issues[0].message);
    if (!password) return toast.error("Introduce tu contraseña");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: em.data, password });
    setLoading(false);
    if (error) {
      if (/not confirmed|confirm/i.test(error.message)) {
        toast.error("Debes verificar tu correo antes de acceder");
        return onVerify();
      }
      return toast.error(error.message);
    }
    const path = await homePathForCurrentUser();
    navigate({ to: path });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="si-pass">Contraseña</Label>
        <div className="relative">
          <Input id="si-pass" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Iniciar sesión"}
      </Button>
      <button type="button" onClick={onForgot} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
        ¿Has olvidado tu contraseña?
      </button>
      <button type="button" onClick={onVerify} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
        Reenviar correo de verificación
      </button>
    </form>
  );
}

function ResendVerifyForm({ onBack }: { onBack: () => void }) {
  const resend = useServerFn(resendVerificationEmail);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    if (!em.success) return toast.error(em.error.issues[0].message);
    setLoading(true);
    const res = await resend({ data: { email: em.data, redirectTo: `${window.location.origin}/auth` } });
    setLoading(false);
    if (!res.ok) return toast.error(res.error ?? "No se pudo enviar el correo");
    toast.success("Te hemos enviado un nuevo correo de verificación");
    onBack();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Introduce tu correo y te enviaremos un nuevo enlace de verificación.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="rv-email">Email</Label>
        <Input id="rv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Enviando..." : "Reenviar verificación"}
      </Button>
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
        Volver
      </button>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    if (!em.success) return toast.error(em.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(em.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Revisa tu correo para restablecer la contraseña.");
    onBack();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="fp-email">Email</Label>
        <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Enviando..." : "Enviar enlace de recuperación"}
      </Button>
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
        Volver
      </button>
    </form>
  );
}
