import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase, prettyBonoNombre, sortCatalogo, type Invoice, type Client, type Trainer, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ClientPicker } from "@/components/clients/client-picker";

export const Route = createFileRoute("/_shell/facturacion")({ component: FacturacionPage });

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function FacturacionPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth()); // -1 = año completo
  const [year, setYear] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Invoice>>({});

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: async () => (await supabase.from("clients").select("*").order("nombre")).data as Client[] ?? [] });
  const { data: trainers = [] } = useQuery({ queryKey: ["trainers"], queryFn: async () => (await supabase.from("trainers").select("*")).data as Trainer[] ?? [] });
  const { data: catalogo = [] } = useQuery({ queryKey: ["bonos_catalogo"], queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [] });

  const { data: allFechas = [] } = useQuery({
    queryKey: ["invoices-fechas"],
    queryFn: async () => (await supabase.from("invoices").select("fecha")).data as { fecha: string }[] ?? [],
  });
  const yearsSet = new Set<number>();
  const monthsByYear = new Map<number, Set<number>>();
  for (const r of allFechas) {
    const d = new Date(r.fecha);
    const y = d.getFullYear();
    const m = d.getMonth();
    yearsSet.add(y);
    if (!monthsByYear.has(y)) monthsByYear.set(y, new Set());
    monthsByYear.get(y)!.add(m);
  }
  yearsSet.add(now.getFullYear());
  const availableYears = Array.from(yearsSet).filter((y) => y <= now.getFullYear()).sort((a, b) => b - a);
  const maxMonthForYear = year === now.getFullYear() ? now.getMonth() : 11;
  const monthsWithData = monthsByYear.get(year) ?? new Set<number>();
  const availableMonths = MONTHS
    .map((label, idx) => ({ label, idx }))
    .filter(({ idx }) => idx <= maxMonthForYear && (monthsWithData.has(idx) || idx === now.getMonth() && year === now.getFullYear()));

  const isYear = month === -1;
  const startD = isYear
    ? `${year}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endD = isYear
    ? `${year}-12-31`
    : (() => {
        const endDate = new Date(year, month + 1, 0);
        return `${year}-${String(month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
      })();

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", startD, endD],
    queryFn: async () => (await supabase.from("invoices").select("*").gte("fecha", startD).lte("fecha", endD).order("fecha", { ascending: false })).data as Invoice[] ?? [],
  });

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const trainerMap = new Map(trainers.map((t) => [t.id, t]));
  const catMap = new Map(catalogo.map((b) => [b.id, b]));

  const total = invoices.reduce((acc, i) => acc + Number(i.precio_cobrado), 0);

  function openNew() {
    setForm({ fecha: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  async function save() {
    const clientId = form.client_id;
    if (!clientId) { toast.error("Selecciona o crea un cliente"); return; }
    if (!form.bono_catalogo_id) { toast.error("Selecciona un bono"); return; }
    const { error } = await supabase.from("invoices").insert({
      fecha: form.fecha!,
      cobrador_trainer_id: form.cobrador_trainer_id ?? null,
      client_id: clientId,
      bono_catalogo_id: form.bono_catalogo_id,
      precio_cobrado: form.precio_cobrado!,
      nota: form.nota ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Factura registrada · bono actualizado");
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    setOpen(false);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold">Facturación</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nueva factura</Button>
      </div>
      <div className="flex items-center gap-2">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="-1">Año completo</SelectItem>
            {availableMonths.map(({ label, idx }) => <SelectItem key={idx} value={String(idx)}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto rounded-lg border bg-card px-4 py-2">
          <span className="text-xs text-muted-foreground">{isYear ? "Total año: " : "Total mes: "}</span>
          <span className="font-semibold">{total.toFixed(2)} €</span>
        </div>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cobrador</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Bono</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Nota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.fecha}</TableCell>
                <TableCell>{i.cobrador_trainer_id ? trainerMap.get(i.cobrador_trainer_id)?.nombre : "—"}</TableCell>
                <TableCell className="font-medium">{clientMap.get(i.client_id)?.nombre ?? "?"}</TableCell>
                <TableCell>{prettyBonoNombre(catMap.get(i.bono_catalogo_id)?.nombre)}</TableCell>
                <TableCell>{Number(i.precio_cobrado).toFixed(2)} €</TableCell>
                <TableCell className="text-muted-foreground text-xs">{i.nota ?? "—"}</TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin facturas este mes</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nueva factura</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={form.fecha ?? ""} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Cobrador</Label>
                <Select value={form.cobrador_trainer_id ?? ""} onValueChange={(v) => setForm({ ...form, cobrador_trainer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{trainers.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <ClientPicker value={form.client_id ?? null} onChange={(id) => setForm({ ...form, client_id: id })} />
            </div>
            <div className="space-y-1.5">
              <Label>Bono</Label>
              <Select value={form.bono_catalogo_id ?? ""} onValueChange={(v) => {
                const b = catalogo.find((x) => x.id === v);
                setForm({ ...form, bono_catalogo_id: v, precio_cobrado: b ? Number(b.precio) : form.precio_cobrado });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona bono..." /></SelectTrigger>
                <SelectContent>
                  {sortCatalogo(catalogo).map((b) => {
                    const label = b.tipo.charAt(0).toUpperCase() + b.tipo.slice(1);
                    return (
                      <SelectItem key={b.id} value={b.id}>{label} · {prettyBonoNombre(b.nombre)} — {Number(b.precio).toFixed(0)} €</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Precio cobrado (€)</Label>
              <Input type="number" step="0.01" value={form.precio_cobrado ?? ""} onChange={(e) => setForm({ ...form, precio_cobrado: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nota</Label>
              <Textarea rows={2} value={form.nota ?? ""} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}