import { useQuery } from "@tanstack/react-query";
import { supabase, prettyBonoNombre, type Client, type ClientBono, type BonoCatalogo } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TIPO_LABEL: Record<string, string> = { individual: "Individual", pareja: "Pareja", grupal: "Grupal" };
const TIPO_CLASS: Record<string, string> = {
  individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
};

export type ClientDetailsTab = "info" | "historial";

export function ClientDetailsDialog({
  client,
  defaultTab = "info",
  onOpenChange,
}: {
  client: Client | null;
  defaultTab?: ClientDetailsTab;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: bonos = [] } = useQuery({
    queryKey: ["client_bonos"],
    queryFn: async () => (await supabase.from("client_bonos").select("*")).data as ClientBono[] ?? [],
  });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["bonos_catalogo"],
    queryFn: async () => (await supabase.from("bonos_catalogo").select("*")).data as BonoCatalogo[] ?? [],
  });
  const catMap = new Map(catalogo.map((c) => [c.id, c]));

  const history = client
    ? bonos
        .filter((b) => b.client_id === client.id && !b.activo)
        .sort((a, b) => (b.ultimo_bono_fecha ?? "").localeCompare(a.ultimo_bono_fecha ?? ""))
    : [];

  return (
    <Dialog open={!!client} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{client?.nombre}</DialogTitle>
        </DialogHeader>
        {client && (
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList>
              <TabsTrigger value="info">Información</TabsTrigger>
              <TabsTrigger value="historial">Historial de bonos</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="pt-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="Nombre" value={client.nombre} />
                <Field label="Estado" value={
                  <span className={`text-xs px-2 py-0.5 rounded-full ${client.activo ? "bg-state-prueba/30 text-state-prueba-fg" : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20"}`}>
                    {client.activo ? "Activo" : "Inactivo"}
                  </span>
                } />
                <Field label="Teléfono" value={client.telefono ?? "—"} />
                <Field label="Fecha de inicio" value={client.fecha_inicio ?? "—"} />
                <Field label="Cumpleaños" value={client.cumpleanos ?? "—"} />
              </dl>
              {client.notas && (
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground mb-1">Notas</div>
                  <div className="text-sm whitespace-pre-wrap">{client.notas}</div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="historial" className="pt-4">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sin bonos anteriores.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bono</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Realizadas</TableHead>
                      <TableHead>Restantes al cerrar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((b) => {
                      const cat = catMap.get(b.bono_catalogo_id ?? "");
                      return (
                        <TableRow key={b.id}>
                          <TableCell>{prettyBonoNombre(cat?.nombre ?? b.ultimo_bono_nombre)}</TableCell>
                          <TableCell>{cat ? <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_CLASS[cat.tipo]}`}>{TIPO_LABEL[cat.tipo]}</span> : "—"}</TableCell>
                          <TableCell>{b.ultimo_bono_fecha ?? b.fecha_inicio}</TableCell>
                          <TableCell>{b.sesiones_realizadas}</TableCell>
                          <TableCell className={b.sesiones_disponibles < 0 ? "text-red-500" : ""}>{b.sesiones_disponibles}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}