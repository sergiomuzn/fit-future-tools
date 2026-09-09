import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Eye } from "lucide-react";
import { getCentroDetalle, setModoSoporte } from "@/lib/superadmin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/superadmin/centro/$centroId")({
  ssr: false,
  component: CentroDetalle,
});

function fmt(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function CentroDetalle() {
  const { centroId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchDetalle = useServerFn(getCentroDetalle);
  const soporte = useServerFn(setModoSoporte);

  const detalle = useQuery({
    queryKey: ["sa-centro", centroId],
    queryFn: () => fetchDetalle({ data: { centroId } }),
  });

  async function entrarSoporte() {
    try {
      await soporte({ data: { centroId } });
      await qc.cancelQueries();
      qc.clear();
      navigate({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const d = detalle.data;
  const config = d?.config as { horario_base?: unknown; precios?: unknown; avisos?: unknown } | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link to="/superadmin">
            <ArrowLeft className="h-4 w-4" />
            Centros
          </Link>
        </Button>
        <h1 className="font-display text-lg font-semibold">{d?.centro?.nombre ?? "Centro"}</h1>
        {d?.centro && (
          <Badge variant={d.centro.estado === "activo" ? "default" : "secondary"}>{d.centro.estado}</Badge>
        )}
        <Button size="sm" className="ml-auto gap-2" onClick={entrarSoporte}>
          <Eye className="h-4 w-4" />
          Acceder como soporte
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios del centro</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead>Último acceso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(d?.usuarios ?? []).map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell>{u.email ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                  <TableCell>{fmt(u.alta)}</TableCell>
                  <TableCell>{fmt(u.ultimo_acceso)}</TableCell>
                </TableRow>
              ))}
              {!detalle.isLoading && !(d?.usuarios ?? []).length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">Sin usuarios todavía.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración del centro</CardTitle>
        </CardHeader>
        <CardContent>
          {config ? (
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(config, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">Este centro todavía no tiene configuración.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
