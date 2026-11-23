import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EMAIL_CENTRO_DEFAULT,
  TIPOS_AVISO_CENTRO,
  parseEmailCentro,
  tipoCentroActivo,
  type EmailCentroConfig,
} from "@/lib/email-centro";
import { useUnsavedGuard } from "@/lib/unsaved-changes";

export function EmailCentroForm() {
  const [cfg, setCfg] = useState<EmailCentroConfig>(EMAIL_CENTRO_DEFAULT);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () =>
    void supabase
      .from("center_config")
      .select("email_centro")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        setCfg(parseEmailCentro(data?.email_centro));
        setDirty(false);
      });
  useEffect(() => {
    load();
  }, []);

  const change = (next: EmailCentroConfig) => {
    setCfg(next);
    setDirty(true);
  };

  async function save(): Promise<boolean> {
    setSaving(true);
    const { error } = await supabase
      .from("center_config")
      .update({ email_centro: { ...cfg, destino: "" } as never })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error("No se pudieron guardar las notificaciones");
      return false;
    }
    setDirty(false);
    toast.success("Notificaciones guardadas");
    return true;
  }

  useUnsavedGuard("config-notificaciones", {
    dirty: () => dirty,
    save,
    discard: () => load(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificaciones por correo</CardTitle>
        <p className="text-sm text-muted-foreground">
          Elige qué avisos del buzón del centro quieres recibir también por correo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 border-b pb-3">
          <div>
            <Label className="text-sm font-medium">Recibir avisos por correo</Label>
            <p className="text-xs text-muted-foreground mt-1">Los avisos llegan al correo del centro.</p>
          </div>
          <Switch checked={cfg.activo} onCheckedChange={(v) => change({ ...cfg, activo: v })} />
        </div>
        {cfg.activo && (
        <div>
          {TIPOS_AVISO_CENTRO.map((t) => (
            <div key={t.tipo} className="flex items-center justify-between gap-4 py-2.5 border-b last:border-b-0">
              <Label className="text-sm">{t.label}</Label>
              <Switch
                checked={tipoCentroActivo(cfg, t.tipo)}
                onCheckedChange={(v) => change({ ...cfg, tipos: { ...cfg.tipos, [t.tipo]: v } })}
              />
            </div>
          ))}
        </div>
        )}
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={!dirty || saving}>Guardar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
