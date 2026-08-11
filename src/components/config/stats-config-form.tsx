import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Info } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider,
  TooltipTrigger as UITooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DEFAULT_STATS_CONFIG,
  DEFAULT_COMPAT,
  STATS_DESGLOSES,
  STATS_DESGLOSE_LABEL,
  STATS_KPI_LABEL,
  STATS_METRICS,
  STATS_METRIC_LABEL,
  isDefaultCompat,
  useStatsConfig,
  writeStatsConfig,
  type StatsConfig,
  type StatsDesglose,
  type StatsKpiKey,
  type StatsMetric,
} from "@/lib/stats-config";

export function StatsConfigForm() {
  const saved = useStatsConfig();
  const [local, setLocal] = useState<StatsConfig>(saved);

  useEffect(() => {
    setLocal(saved);
  }, [saved]);

  function toggleCompat(metric: StatsMetric, d: StatsDesglose) {
    setLocal((cur) => ({
      ...cur,
      compat: {
        ...cur.compat,
        [metric]: { ...cur.compat[metric], [d]: !cur.compat[metric][d] },
      },
    }));
  }

  function toggleKpi(k: StatsKpiKey) {
    setLocal((cur) => ({ ...cur, kpis: { ...cur.kpis, [k]: !cur.kpis[k] } }));
  }

  function resetDefaults() {
    setLocal(DEFAULT_STATS_CONFIG);
  }

  function save() {
    writeStatsConfig(local);
    toast.success("Configuración de estadísticas guardada");
  }

  const dirty = JSON.stringify(local) !== JSON.stringify(saved);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>KPIs visibles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Selecciona qué tarjetas de indicadores quieres ver arriba de Estadísticas.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.keys(STATS_KPI_LABEL) as StatsKpiKey[]).map((k) => (
              <label key={k} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <Checkbox
                  checked={local.kpis[k]}
                  onCheckedChange={() => toggleKpi(k)}
                />
                {STATS_KPI_LABEL[k]}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={save} disabled={!dirty}>Guardar cambios</Button>
            <Button variant="outline" onClick={resetDefaults}>Restablecer recomendados</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compatibilidad métrica × desglose</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <UITooltipProvider delayDuration={150}>
            <p className="text-xs text-muted-foreground">
              Activa qué desgloses estarán disponibles para cada métrica. Los sombreados en amarillo son combinaciones
              no recomendadas: podrás usarlas pero Estadísticas mostrará un aviso porque el cálculo puede no ser fiable.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className="p-2 font-medium">Métrica</th>
                    {STATS_DESGLOSES.map((d) => (
                      <th key={d} className="p-2 font-medium text-center whitespace-nowrap">
                        {STATS_DESGLOSE_LABEL[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STATS_METRICS.map((m) => (
                    <tr key={m} className="border-t">
                      <td className="p-2 font-medium whitespace-nowrap">{STATS_METRIC_LABEL[m]}</td>
                      {STATS_DESGLOSES.map((d) => {
                        const enabled = local.compat[m][d];
                        const isDefault = isDefaultCompat(m, d);
                        const warn = enabled && !isDefault;
                        return (
                          <td
                            key={d}
                            className={
                              "p-2 text-center " +
                              (warn ? "bg-amber-500/10" : isDefault ? "" : "")
                            }
                          >
                            <div className="flex items-center justify-center gap-1">
                              <Checkbox
                                checked={enabled}
                                onCheckedChange={() => toggleCompat(m, d)}
                              />
                              {warn && (
                                <UITooltip>
                                  <UITooltipTrigger asChild>
                                    <span className="text-amber-600 dark:text-amber-400" aria-label="Combinación no recomendada">
                                      <Info className="h-3 w-3" />
                                    </span>
                                  </UITooltipTrigger>
                                  <UITooltipContent side="top" className="max-w-xs text-xs">
                                    Combinación no recomendada. Aparecerá disponible en Estadísticas pero con aviso, ya que el cálculo puede no ser representativo.
                                  </UITooltipContent>
                                </UITooltip>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Recomendadas por defecto:
              {" "}
              {STATS_METRICS.reduce(
                (n, m) => n + STATS_DESGLOSES.filter((d) => DEFAULT_COMPAT[m][d]).length,
                0,
              )}
              {" "}combinaciones activadas.
            </p>
          </UITooltipProvider>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={save}>Guardar cambios</Button>
            <Button variant="outline" onClick={resetDefaults}>Restablecer recomendados</Button>
            <Label className="text-xs text-muted-foreground ml-auto">
              La configuración se guarda en este navegador.
            </Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}