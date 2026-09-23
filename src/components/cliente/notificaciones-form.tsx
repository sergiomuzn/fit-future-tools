import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { getMisNotifPrefs, saveMisNotifPrefs } from "@/lib/notif-prefs.functions";
import { TIPOS_AVISO_CLIENTE, tipoAvisoPorDefecto } from "@/lib/notificaciones-tipos";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function NotificacionesForm() {
  const fetchPrefs = useServerFn(getMisNotifPrefs);
  const savePrefs = useServerFn(saveMisNotifPrefs);

  const { data } = useQuery({
    queryKey: ["portal-notif-prefs"],
    queryFn: () => fetchPrefs({ data: undefined }),
  });

  const [emailActivo, setEmailActivo] = useState(true);
  const [tipos, setTipos] = useState<Record<string, boolean>>({});
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    if (!data) return;
    setEmailActivo(data.emailActivo);
    setTipos(data.tipos ?? {});
  }, [data]);

  async function persist(next: { emailActivo: boolean; tipos: Record<string, boolean> }) {
    try {
      await savePrefs({ data: next });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function toggleEmail(v: boolean) {
    setEmailActivo(v);
    if (v) setAbierto(true);
    void persist({ emailActivo: v, tipos });
  }

  function toggleTipo(tipo: string, v: boolean) {
    const next = { ...tipos, [tipo]: v };
    setTipos(next);
    void persist({ emailActivo, tipos: next });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-sm font-medium">Notificaciones</p>
          <p className="text-xs text-muted-foreground">
            Los avisos llegan siempre a tu buzón. Elige cuáles quieres recibir además por correo.
          </p>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="notif-email" className="text-sm font-medium">
            Recibir avisos también por correo
          </Label>
          <Switch id="notif-email" checked={emailActivo} onCheckedChange={toggleEmail} />
        </div>

        {emailActivo ? (
          <div className="rounded-md border">
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
            >
              Tipos de aviso por correo
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")}
              />
            </button>
            {abierto ? (
              <div className="space-y-3 border-t px-3 py-3">
                {TIPOS_AVISO_CLIENTE.map((t) => (
                  <div key={t.tipo} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`notif-${t.tipo}`} className="text-sm font-normal">
                      {t.label}
                    </Label>
                    <Switch
                      id={`notif-${t.tipo}`}
                      checked={tipos[t.tipo] ?? tipoAvisoPorDefecto(t.tipo)}
                      onCheckedChange={(v) => toggleTipo(t.tipo, v)}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
