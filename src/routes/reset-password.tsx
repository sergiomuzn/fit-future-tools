import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "Mínimo 8 caracteres").max(128);

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return toast.error(pw.error.issues[0].message);
    if (password !== confirm) return toast.error("Las contraseñas no coinciden");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw.data });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Nueva contraseña</CardTitle>
          <CardDescription>Introduce tu nueva contraseña.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-pass">Nueva contraseña</Label>
              <Input id="rp-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-confirm">Confirmar contraseña</Label>
              <Input id="rp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Guardar contraseña"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}