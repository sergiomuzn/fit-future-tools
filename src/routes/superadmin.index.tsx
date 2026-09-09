import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Users, CalendarDays, Plus } from "lucide-react";
import {
  listCentros,
  getGlobalStats,
  setCentroEstado,
  crearCentro,
} from "@/lib/superadmin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/superadmin/")({
  ssr: false,
  component: SuperadminHome,
});

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function SuperadminHome() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchCentros = useServerFn(listCentros);
  const fetchStats = useServerFn(getGlobalStats);
  const cambiarEstado = useServerFn(setCentroEstado);

  const centros = useQuery({ queryKey: ["sa-centros"], queryFn: () => fetchCentros() });
  const stats = useQuery({ queryKey: ["sa-stats"], queryFn: () => fetchStats() });

  async function toggle(centroId: string, activo: boolean) {
    try {
      await cambiarEstado({ data: { centroId, estado: activo ? "activo" : "inactivo" } });
      toast.success(activo ? "Centro activado" : "Centro desactivado");
      qc.invalidateQueries({ queryKey: ["sa-centros"] });
      qc.invalidateQueries({ queryKey: ["sa-stats"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const s = stats.data;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Building2 className="h-4 w-4" />} label="Centros activos" value={s ? `${s.centros_activos} / ${s.centros_total}` : "—"} />
        <StatCard icon={<CalendarDays className="h-4 w-4" />} label="Sesiones este mes" value={s ? String(s.sesiones_mes) : "—"} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Usuarios en plataforma" value={s ? String(s.usuarios_total) : "—"} />
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Centros</CardTitle>
          <NuevoCentroDialog onCreated={(id) => navigate({ to: "/superadmin/centro/$centroId", params: { centroId: id } })} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead className="text-right">Usuarios</TableHead>
                <TableHead>Último acceso</TableHead>
                <TableHead className="text-right">Sesiones mes</TableHead>
                <TableHead className="text-right">Acceso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(centros.data ?? []).map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link to="/superadmin/centro/$centroId" params={{ centroId: c.id }} className="hover:underline">
                      {c.nombre}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.estado === "activo" ? "default" : "secondary"}>{c.estado}</Badge>
                  </TableCell>
                  <TableCell>{fmtDate(c.fecha_creacion)}</TableCell>
                  <TableCell className="text-right">{c.usuarios}</TableCell>
                  <TableCell>{fmtDate(c.ultimo_acceso)}</TableCell>
                  <TableCell className="text-right">{c.sesiones_mes}</TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={c.estado === "activo"}
                      onCheckedChange={(v) => toggle(c.id, v)}
                      aria-label="Activar centro"
                    />
                  </TableCell>
                </TableRow>
              ))}
              {centros.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">Cargando…</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Centros con más actividad (30 días)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {(s?.top_centros ?? []).map((t) => (
            <div key={t.nombre} className="flex items-center justify-between text-sm">
              <span>{t.nombre}</span>
              <span className="text-muted-foreground">{t.sesiones} sesiones</span>
            </div>
          ))}
          {!s?.top_centros?.length && <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-display text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function NuevoCentroDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const crear = useServerFn(crearCentro);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await crear({
        data: { nombre, email, plan: "basico", origin: window.location.origin },
      });
      toast.success(res.aviso ? `Centro creado. ${res.aviso}` : "Centro creado y administrador invitado por email");
      qc.invalidateQueries({ queryKey: ["sa-centros"] });
      qc.invalidateQueries({ queryKey: ["sa-stats"] });
      setOpen(false);
      setNombre("");
      setEmail("");
      onCreated(res.centroId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo centro
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo centro</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nc-nombre">Nombre del centro</Label>
            <Input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-email">Email del administrador</Label>
            <Input id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <p className="text-xs text-muted-foreground">
              Recibirá un correo de bienvenida con un enlace para establecer su contraseña.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creando…" : "Crear centro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
