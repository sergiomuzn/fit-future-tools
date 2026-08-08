import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, RotateCcw } from "lucide-react";
import { toast } from "sonner";
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

  useEffect(() => {
    setCfg(getBehaviorConfig());
  }, []);

  function update<K extends keyof BehaviorConfig>(key: K, value: BehaviorConfig[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function save() {
    writeBehaviorConfig(cfg);
    setDirty(false);
    toast.success("Configuración de funcionamiento guardada");
  }

  function reset() {
    setCfg(DEFAULT_BEHAVIOR_CONFIG);
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
              <b>Altas y bajas:</b> el primer bono (individual, pareja o grupal, no de prueba ni
              pases genéricos) genera un <i>alta</i>. Marcar un cliente como inactivo registra una
              <i> baja</i>; volver a activarlo la retira.
            </li>
            <li>
              <b>Clientes de prueba:</b> tras {cfg.pruebaDiasInactivar} días desde la sesión de
              prueba sin haber contratado bono, el cliente pasa automáticamente a inactivo
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

      <div className="flex justify-between items-center">
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Restaurar valores por defecto
        </Button>
        <Button onClick={save} disabled={!dirty}>
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}