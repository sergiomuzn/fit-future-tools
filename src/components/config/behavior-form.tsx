import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  BOOKING_MODES,
  DEFAULT_BOOKING_MODE,
  parseBookingMode,
  type BookingMode,
} from "@/lib/booking-mode";
import {
  type BehaviorConfig,
  DEFAULT_BEHAVIOR_CONFIG,
  getBehaviorConfig,
  writeBehaviorConfig,
} from "@/lib/behavior-config";

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0">
      <div className="min-w-0 flex-1">
        <Label className="text-sm font-medium">{title}</Label>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

export function BehaviorForm() {
  const [cfg, setCfg] = useState<BehaviorConfig>(DEFAULT_BEHAVIOR_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [avisoUmbral, setAvisoUmbral] = useState(2);
  const [avisoRenovacion, setAvisoRenovacion] = useState(true);
  const [modoReservas, setModoReservas] = useState<BookingMode>(DEFAULT_BOOKING_MODE);
  const qc = useQueryClient();

  useEffect(() => {
    setCfg(getBehaviorConfig());
    void (async () => {
      const { data } = await supabase.from("center_config").select("avisos").eq("id", true).maybeSingle();
      const avisos = (data?.avisos ?? {}) as {
        umbral_sesiones?: number;
        avisar_renovacion?: boolean;
        cliente_ve_canceladas?: boolean;
        canceladas_nc_suman?: boolean;
        modo_reservas?: string;
      };
      setModoReservas(parseBookingMode(avisos.modo_reservas));
      setAvisoUmbral(avisos.umbral_sesiones ?? 2);
      setAvisoRenovacion(avisos.avisar_renovacion ?? true);
      setCfg((prev) => ({
        ...prev,
        clienteVeCanceladas: avisos.cliente_ve_canceladas ?? false,
        canceladasNCSumanTotal: avisos.canceladas_nc_suman ?? false,
      }));
    })();
  }, []);

  function update<K extends keyof BehaviorConfig>(key: K, value: BehaviorConfig[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function save() {
    writeBehaviorConfig(cfg);
    const { error } = await supabase
      .from("center_config")
      .update({
        avisos: {
          umbral_sesiones: avisoUmbral,
          avisar_renovacion: avisoRenovacion,
          cliente_ve_canceladas: cfg.clienteVeCanceladas,
          canceladas_nc_suman: cfg.canceladasNCSumanTotal,
          modo_reservas: modoReservas,
        },
      })
      .eq("id", true);
    setDirty(false);
    if (error) {
      toast.error("No se pudieron guardar los avisos al cliente");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["booking-mode"] });
    toast.success("Configuración de funcionamiento guardada");
  }

  function reset() {
    setCfg(DEFAULT_BEHAVIOR_CONFIG);
    setAvisoUmbral(2);
    setAvisoRenovacion(true);
    setModoReservas(DEFAULT_BOOKING_MODE);
    setDirty(true);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            Cómo funciona la app
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            Esta pestaña explica las <b>automatizaciones</b> que la app aplica sin que tengas que
            hacer nada, y te permite ajustar algunas de ellas. Los cambios se aplican al momento
            en toda la app (agenda, estadísticas, bonos…).
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <b>Auto-realizada:</b> las sesiones reservadas cuya hora de fin ya ha pasado se
              marcan automáticamente como <i>realizada</i>. Las de tipo <i>prueba</i> y las
              marcadas como <i>por confirmar</i> nunca se auto-convierten.
            </li>
            <li>
              <b>Bonos y renovaciones:</b> al facturar un nuevo bono, el anterior pasa al historial
              del cliente y las sesiones sobrantes se acumulan en el nuevo. Un bono no desaparece
              al llegar a 0: se conserva hasta que el cliente renueva.
            </li>
            <li>
              <b>Bonos agotados y archivado:</b> cuando las sesiones restantes llegan a 0 o pasan a
              negativo (-1, -2…), el bono sigue visible en la pestaña <i>Bonos</i> mostrando ese
              número con el estado <i>Agotado</i>. Sólo se archiva en el historial cuando entra un
              bono nuevo (desde facturación o añadido a mano), y en ese momento las sesiones
              restantes del bono archivado se suman o restan al bono nuevo. Las sesiones restantes
              no se muestran en la pestaña <i>Clientes</i>, sólo en <i>Bonos</i>.
            </li>
            <li>
              <b>Altas y bajas:</b> el primer bono (individual, pareja o grupal, no de prueba ni
              pases genéricos) genera un <i>alta</i>. Marcar un cliente como inactivo registra una
              <i> baja</i>; volver a activarlo la retira.
            </li>
            <li>
              <b>Sesiones de prueba:</b> al marcar la casilla <i>Sesión de prueba</i> en la agenda, el
              cliente queda registrado con bono de tipo <i>Prueba</i>. El estado de esa sesión
              (reservada, realizada o cancelada) se puede cambiar igualmente. Tras{" "}
              {cfg.pruebaDiasInactivar} días desde la sesión de prueba sin haber contratado bono, el
              cliente pasa automáticamente a inactivo conservando el tipo de bono <i>Prueba</i> hasta
              que se registre un bono nuevo (facturación o alta manual)
              {cfg.pruebaAutoInactivar ? "" : " (automatismo desactivado)"}.
            </li>
            <li>
              <b>Cancelaciones:</b>{" "}
              {cfg.canceladasCuentanModo === "siempre"
                ? "todas las sesiones canceladas cuentan como entrenamiento realizado."
                : cfg.canceladasCuentanModo === "nunca"
                  ? "ninguna sesión cancelada cuenta como entrenamiento realizado."
                  : "una sesión cancelada cuenta como entrenamiento salvo que la marques como “No contabilizar”."}{" "}
              Lo que cuenta como realizado es también lo que se suma al entrenador.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            title="Margen de gracia tras la hora de fin"
            description="Tiempo que se espera después de la hora de fin antes de marcar la sesión como realizada. Útil para dar margen a cancelaciones de última hora."
          >
            <Select
              value={String(cfg.graciaAutoRealizadaMin)}
              onValueChange={(v) => update("graciaAutoRealizadaMin", Number(v))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sin margen</SelectItem>
                <SelectItem value="5">5 minutos</SelectItem>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="60">1 hora</SelectItem>
                <SelectItem value="180">3 horas</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modo de reservas</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={modoReservas}
            onValueChange={(v) => {
              setModoReservas(parseBookingMode(v));
              setDirty(true);
            }}
            className="space-y-3"
          >
            {BOOKING_MODES.map((m) => (
              <div key={m.value} className="flex items-start gap-3">
                <RadioGroupItem value={m.value} id={`modo-${m.value}`} className="mt-1" />
                <Label htmlFor={`modo-${m.value}`} className="cursor-pointer font-normal">
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {m.description}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesiones grupales</CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            title="Contar las sesiones grupales como realizadas aunque no haya integrantes"
            description="Cuando esté activado, las sesiones grupales pasadas se marcan como realizadas y cuentan en estadísticas aunque no tengan ningún cliente asignado. Si lo desactivas, sólo cuentan las grupales con al menos un cliente."
          >
            <Switch
              checked={cfg.grupalesSinAsistentesCuentan}
              onCheckedChange={(v) => update("grupalesSinAsistentesCuentan", v)}
            />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cancelaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            title="Contar las sesiones canceladas como realizadas"
            description="Define si una sesión cancelada cuenta como entrenamiento en estadísticas y en el total de sesiones del entrenador. Si no cuenta como realizada, tampoco se le suma al entrenador."
          >
            <Select
              value={cfg.canceladasCuentanModo}
              onValueChange={(v) => update("canceladasCuentanModo", v as BehaviorConfig["canceladasCuentanModo"])}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="segunNC">Según “No contabilizar”</SelectItem>
                <SelectItem value="siempre">Sí, siempre cuentan</SelectItem>
                <SelectItem value="nunca">No, nunca cuentan</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row
            title="Al cancelar, marcar por defecto como 'No contabilizar'"
            description="Si lo activas, al cambiar una sesión a 'cancelada' la casilla 'No contabilizar' aparecerá marcada por defecto (se puede desmarcar). Con el ajuste desactivado, las cancelaciones cuentan como entrenamiento salvo que lo marques a mano."
          >
            <Switch
              checked={cfg.cancelacionDefaultNoContabilizar}
              onCheckedChange={(v) => update("cancelacionDefaultNoContabilizar", v)}
              disabled={cfg.canceladasCuentanModo !== "segunNC"}
            />
          </Row>
          <Row
            title="El cliente puede ver sus sesiones canceladas"
            description="Si lo activas, en el portal del cliente aparecerán también las sesiones canceladas (marcadas como tal). Si lo desactivas, sólo verá las sesiones vigentes."
          >
            <Switch
              checked={cfg.clienteVeCanceladas}
              onCheckedChange={(v) => update("clienteVeCanceladas", v)}
            />
          </Row>
          <Row
            title="Las canceladas 'No contabilizar' suman al total de cancelaciones"
            description="En el portal del cliente, el total de cancelaciones incluye sólo las canceladas contabilizadas. Actívalo para sumar también las marcadas como 'No contabilizar'."
          >
            <Switch
              checked={cfg.canceladasNCSumanTotal}
              onCheckedChange={(v) => update("canceladasNCSumanTotal", v)}
            />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avisos al cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            title="Avisar cuando le queden pocas sesiones"
            description="El cliente recibe un aviso en su buzón cada vez que consume una sesión y su saldo queda por debajo de este número (incluye 0 y saldos negativos)."
          >
            <Select
              value={String(avisoUmbral)}
              onValueChange={(v) => {
                setAvisoUmbral(Number(v));
                setDirty(true);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Menos de 1 sesión</SelectItem>
                <SelectItem value="2">Menos de 2 sesiones</SelectItem>
                <SelectItem value="3">Menos de 3 sesiones</SelectItem>
                <SelectItem value="4">Menos de 4 sesiones</SelectItem>
                <SelectItem value="5">Menos de 5 sesiones</SelectItem>
                <SelectItem value="10">Menos de 10 sesiones</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row
            title="Avisar cuando renueva el bono"
            description="El cliente recibe un aviso en su buzón cuando se le suman sesiones a su perfil tras una renovación o un nuevo bono."
          >
            <Switch checked={avisoRenovacion} onCheckedChange={(v) => { setAvisoRenovacion(v); setDirty(true); }} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesiones de prueba</CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            title="Pasar a inactivo los clientes de prueba"
            description="Si el cliente sólo tiene bono de prueba y no contrata ningún bono, pasa automáticamente a inactivo. Desactívalo si prefieres gestionarlo a mano."
          >
            <Switch
              checked={cfg.pruebaAutoInactivar}
              onCheckedChange={(v) => update("pruebaAutoInactivar", v)}
            />
          </Row>
          <Row
            title="Días hasta pasar a inactivo"
            description="Tiempo que transcurre desde la sesión de prueba antes de marcar al cliente como inactivo."
          >
            <Select
              value={String(cfg.pruebaDiasInactivar)}
              onValueChange={(v) => update("pruebaDiasInactivar", Number(v))}
            >
              <SelectTrigger className="w-36" disabled={!cfg.pruebaAutoInactivar}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 días</SelectItem>
                <SelectItem value="15">15 días</SelectItem>
                <SelectItem value="30">30 días</SelectItem>
                <SelectItem value="45">45 días</SelectItem>
                <SelectItem value="60">60 días</SelectItem>
                <SelectItem value="90">90 días</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bonos</CardTitle>
        </CardHeader>
        <CardContent>
          <Row
            title="Ocultar bonos agotados de clientes inactivos"
            description="Si el cliente está inactivo y su bono no tiene sesiones restantes, el bono deja de aparecer en la tabla de Bonos. Desactívalo para seguir viéndolos."
          >
            <Switch
              checked={cfg.ocultarBonosInactivosAgotados}
              onCheckedChange={(v) => update("ocultarBonosInactivosAgotados", v)}
            />
          </Row>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Restaurar valores por defecto
        </Button>
        <Button onClick={save} disabled={!dirty}>
          Guardar
        </Button>
      </div>
    </div>
  );
}