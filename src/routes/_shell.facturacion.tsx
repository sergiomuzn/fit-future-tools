import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase, prettyBonoNombre, sortCatalogo, type Invoice, type Client, type Trainer, type BonoCatalogo } from "@/lib/db";
import { ClientDetailsDialog } from "@/components/clients/client-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ClientPicker } from "@/components/clients/client-picker";
import { formatNameTitle } from "@/lib/utils";

export const Route = createFileRoute("/_shell/facturacion")({ component: FacturacionPage });

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function FacturacionPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth()); // -1 = año completo
  const [year, setYear] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Invoice>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: async () => (await supabase.from("clients").select("*").order("nombre")).data as Client[] ?? [] });
  const { data: trainers = [] } = useQuery({ queryKey: ["trainers"], queryFn: async () => (await supabase.from("trainers").select("*")).data as Trainer[] ?? [] });
  const { data: catalogo = [] } = useQuery({ queryKey: ["bonos_catalogo"], queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [] });

  const { data: altas = [] } = useQuery({
    queryKey: ["client-altas"],
    queryFn: async () => (await supabase.from("client_events").select("client_id, fecha").eq("tipo", "alta")).data as { client_id: string; fecha: string }[] ?? [],
  });
  const altaByClient = new Map(altas.map((a) => [a.client_id, a.fecha]));

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
  const allYears = Array.from(yearsSet);
  const minYear = allYears.length ? Math.min(...allYears, now.getFullYear()) : now.getFullYear();
  const availableYears: number[] = [];
  for (let y = now.getFullYear(); y >= minYear; y--) availableYears.push(y);
  for (const y of allYears) {
    if (y > now.getFullYear() && !availableYears.includes(y)) availableYears.push(y);
  }
  availableYears.sort((a, b) => b - a);

  let availableMonths: { label: string; idx: number }[];
  if (year < now.getFullYear()) {
    availableMonths = MONTHS.map((label, idx) => ({ label, idx }));
  } else if (year === now.getFullYear()) {
    availableMonths = MONTHS.map((label, idx) => ({ label, idx })).filter(({ idx }) => idx <= now.getMonth());
  } else {
    const monthsWithData = monthsByYear.get(year) ?? new Set<number>();
    availableMonths = MONTHS.map((label, idx) => ({ label, idx })).filter(({ idx }) => monthsWithData.has(idx));
  }

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
    queryFn: async () => (await supabase
      .from("invoices").select("*")
      .gte("fecha", startD).lte("fecha", endD)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
    ).data as Invoice[] ?? [],
  });

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const trainerMap = new Map(trainers.map((t) => [t.id, t]));
  const catMap = new Map(catalogo.map((b) => [b.id, b]));

  const total = invoices.reduce((acc, i) => acc + Number(i.precio_cobrado), 0);

  function openNew() {
    setForm({ fecha: new Date().toISOString().slice(0, 10) });
    setEditingId(null);
    setOpen(true);
  }

  function openEdit(inv: Invoice) {
    setForm(inv);
    setEditingId(inv.id);
    setOpen(true);
  }

  async function removeInvoice(inv: Invoice) {
    if (!confirm("¿Eliminar esta factura? Se revertirá el bono creado.")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Factura eliminada");
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoices-fechas"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    qc.invalidateQueries({ queryKey: ["client-altas"] });
  }

  async function save() {
    const clientId = form.client_id;
    if (!clientId) { toast.error("Selecciona o crea un cliente"); return; }
    const bonoId = form.bono_catalogo_id?.trim() || null;
    const overrideRaw = (form as { sesiones_override?: number | null }).sesiones_override;
    const sesionesOverride =
      overrideRaw === undefined || overrideRaw === null || (overrideRaw as unknown as string) === ""
        ? null
        : Number(overrideRaw);
    const payload = {
      fecha: form.fecha!,
      cobrador_trainer_id: form.cobrador_trainer_id ?? null,
      client_id: clientId,
      bono_catalogo_id: bonoId,
      precio_cobrado: form.precio_cobrado!,
      nota: form.nota ?? null,
      sesiones_override: bonoId ? sesionesOverride : null,
    };
    if (editingId) {
      const { error } = await supabase.from("invoices").update(payload).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
      toast.success("Factura actualizada");
    } else {
      const { error } = await supabase.from("invoices").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Factura registrada · bono actualizado");
    }
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoices-fechas"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    qc.invalidateQueries({ queryKey: ["client-altas"] });
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
              <TableHead>Tipo</TableHead>
              <TableHead>Bono</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((i) => {
              const cat = catMap.get(i.bono_catalogo_id ?? "");
              const tipo = cat?.tipo;
              const TIPO_LABEL: Record<string, string> = { prueba: "Prueba", individual: "Individual", pareja: "Pareja", grupal: "Grupal", gympass: "Gympass" };
              const TIPO_CLASS: Record<string, string> = {
                prueba: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
                individual: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
                pareja: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
                grupal: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
                gympass: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
              };
              return (
              <TableRow key={i.id}>
                <TableCell>{i.fecha}</TableCell>
                <TableCell>{i.cobrador_trainer_id ? trainerMap.get(i.cobrador_trainer_id)?.nombre : "—"}</TableCell>
                <TableCell className="font-medium">
                  {(() => {
                    const c = clientMap.get(i.client_id);
                    const isAlta = altaByClient.get(i.client_id) === i.fecha;
                    return c ? (
                      <div className="flex items-center gap-2">
                        <button className="hover:underline text-left" onClick={() => setViewingClient(c)}>{c.nombre}</button>
                        {isAlta && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">Alta</span>
                        )}
                      </div>
                    ) : "?";
                  })()}
                </TableCell>
                <TableCell>{tipo ? <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_CLASS[tipo]}`}>{TIPO_LABEL[tipo]}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{prettyBonoNombre(cat?.nombre)}</TableCell>
                <TableCell>{Number(i.precio_cobrado).toFixed(2)} €</TableCell>
                <TableCell className="text-muted-foreground text-xs">{i.nota ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeInvoice(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
            {invoices.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin facturas este mes</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" onKeyDown={enterToSave(save)}>
          <DialogHeader><DialogTitle>{editingId ? "Editar factura" : "Nueva factura"}</DialogTitle></DialogHeader>
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
            <ClientPicker value={form.client_id ?? null} onChange={(id) => setForm({ ...form, client_id: id ?? undefined })} />
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1 min-w-0">
              <Label>Bono</Label>
              <Select value={form.bono_catalogo_id ?? "__none__"} onValueChange={(v) => {
                const b = catalogo.find((x) => x.id === v);
                setForm({
                  ...form,
                  bono_catalogo_id: v === "__none__" ? undefined : v,
                  precio_cobrado: b ? Number(b.precio) : form.precio_cobrado,
                  sesiones_override: v === "__none__" ? null : (b ? b.sesiones_incluidas : null),
                });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona bono..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin bono</SelectItem>
                  {sortCatalogo(catalogo).map((b) => {
                    const label = b.tipo.charAt(0).toUpperCase() + b.tipo.slice(1);
                    return (
                      <SelectItem key={b.id} value={b.id}>{label} · {prettyBonoNombre(b.nombre)} — {Number(b.precio).toFixed(0)} €</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              </div>
              {form.bono_catalogo_id && (
                <div className="space-y-1.5 w-20 shrink-0">
                  <Label className="text-xs">Sesiones</Label>
                  <Input
                    type="number"
                    step="1"
                    className="h-9 text-center px-2"
                    value={form.sesiones_override ?? ""}
                    onChange={(e) => setForm({ ...form, sesiones_override: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Precio cobrado (€)</Label>
              <Input type="number" step="5" placeholder="0" value={form.precio_cobrado ? form.precio_cobrado : ""} onChange={(e) => setForm({ ...form, precio_cobrado: Number(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nota</Label>
              <Textarea rows={2} value={form.nota ?? ""} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editingId ? "Guardar" : "Registrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ClientDetailsDialog client={viewingClient} defaultTab="historial" onOpenChange={(o) => !o && setViewingClient(null)} />
    </div>
  );
}