import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Email inválido").max(255);

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot" | "signup">("signin");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">PT·Studio</CardTitle>
          <CardDescription>Accede a la gestión del centro</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "forgot" ? (
            <ForgotForm onBack={() => setMode("signin")} />
          ) : mode === "signup" ? (
            <SignUpForm onBack={() => setMode("signin")} />
          ) : (
            <SignInForm onForgot={() => setMode("forgot")} onSignUp={() => setMode("signup")} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SignInForm({ onForgot, onSignUp }: { onForgot: () => void; onSignUp: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    if (!em.success) return toast.error(em.error.issues[0].message);
    if (!password) return toast.error("Introduce tu contraseña");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: em.data, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="si-pass">Contraseña</Label>
        <Input id="si-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Iniciar sesión"}
      </Button>
      <button type="button" onClick={onForgot} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
        ¿Has olvidado tu contraseña?
      </button>
      <button type="button" onClick={onSignUp} className="text-xs text-muted-foreground hover:text-foreground w-full text-center border-t pt-3 mt-2">
        Crear cuenta (temporal)
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

function SignUpForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    if (!em.success) return toast.error(em.error.issues[0].message);
    if (password.length < 8) return toast.error("Mínimo 8 caracteres");
    if (password !== confirm) return toast.error("Las contraseñas no coinciden");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: em.data,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      toast.success("Cuenta creada");
      navigate({ to: "/" });
    } else {
      toast.success("Cuenta creada. Revisa tu correo si requiere confirmación.");
      onBack();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-pass">Contraseña (mín. 8)</Label>
        <div className="relative">
          <Input id="su-pass" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Ocultar" : "Mostrar"}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-pass2">Repetir contraseña</Label>
        <Input id="su-pass2" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creando..." : "Crear cuenta"}
      </Button>
      <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
        Volver
      </button>
    </form>
  );
}