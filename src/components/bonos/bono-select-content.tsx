import { SelectContent, SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import { prettyBonoNombre, sortCatalogo, type BonoCatalogo } from "@/lib/db";
import { useServicios } from "@/lib/servicios";
import { useColores } from "@/lib/colors";

interface Props {
  catalogo: BonoCatalogo[];
  /** Valor para la opción "sin bono" (si se indica, se muestra al principio). */
  noneValue?: string;
  noneLabel?: string;
  /** Personaliza el texto de cada bono. */
  itemLabel?: (b: BonoCatalogo) => string;
}

/** Prefija la modalidad del bono (si la tiene): "Modalidad - Bono". */
export function withModalidad(b: BonoCatalogo, label: string): string {
  const m = (b as { modalidad?: string | null }).modalidad?.trim();
  return m ? `${m} - ${label}` : label;
}

/**
 * Contenido del desplegable de selección de bono: más ancho, sin scroll horizontal
 * y agrupado por servicio (cabecera con línea del color del servicio).
 */
export function BonoSelectContent({ catalogo, noneValue, noneLabel, itemLabel }: Props) {
  const { data: servicios = [] } = useServicios();
  const { servicioColor } = useColores();

  const ordenServicio = new Map(servicios.map((s, i) => [s.slug, i]));
  const nombreServicio = new Map(servicios.map((s) => [s.slug, s.nombre]));

  const grupos = new Map<string, BonoCatalogo[]>();
  for (const b of sortCatalogo(catalogo)) {
    const list = grupos.get(b.servicio_slug) ?? [];
    list.push(b);
    grupos.set(b.servicio_slug, list);
  }
  const slugsOrdenados = [...grupos.keys()].sort(
    (a, b) => (ordenServicio.get(a) ?? 999) - (ordenServicio.get(b) ?? 999) || a.localeCompare(b),
  );

  return (
    <SelectContent className="w-[min(560px,90vw)] max-w-[min(560px,90vw)] overflow-x-hidden">
      {noneValue !== undefined && (
        <SelectItem value={noneValue} className="whitespace-normal">{noneLabel ?? "Sin bono"}</SelectItem>
      )}
      {slugsOrdenados.map((slug) => {
        const color = servicioColor(slug) ?? "#888888";
        return (
          <SelectGroup key={slug}>
            <SelectLabel className="flex items-center gap-2 text-xs uppercase tracking-wide text-foreground">
              <span className="h-3.5 w-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {nombreServicio.get(slug) ?? slug}
            </SelectLabel>
            {grupos.get(slug)!.map((b) => (
              <SelectItem key={b.id} value={b.id} className="whitespace-normal text-foreground/80">
                {withModalidad(b, itemLabel ? itemLabel(b) : prettyBonoNombre(b.nombre))}
              </SelectItem>
            ))}
          </SelectGroup>
        );
      })}
    </SelectContent>
  );
}
