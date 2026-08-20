import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { supabase, prettyBonoNombre, sortCatalogo, type Invoice, type Client, type Trainer, type BonoCatalogo } from "@/lib/db";
import { ClientDetailsDialog } from "@/components/clients/client-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { enterToSave } from "@/lib/enter-to-save";
import { normalizeText, fuzzyMatch } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ClientPicker } from "@/components/clients/client-picker";
import { formatNameTitle } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { ExpandableSearch } from "@/components/expandable-search";
import { useCenterConfig } from "@/lib/center-schedule";
import { tipoColorOf, chipStyle } from "@/lib/colors";

export const Route = createFileRoute("/_shell/facturacion")({ component: FacturacionPage });

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function FacturacionPage() {
  const { confirm, dialog } = useConfirm();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth()); // -1 = año completo
  const [year, setYear] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<Invoice>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [confirmNoClient, setConfirmNoClient] = useState(false);

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: async () => (await supabase.from("clients").select("*").order("nombre")).data as Client[] ?? [] });
  const { data: trainers = [] } = useQuery({ queryKey: ["trainers"], queryFn: async () => (await supabase.from("trainers").select("*")).data as Trainer[] ?? [] });
  const { data: catalogo = [] } = useQuery({ queryKey: ["bonos_catalogo"], queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [] });

  // Último bono contratado por cliente (más reciente por fecha_inicio, luego created_at).
  const { data: lastBonoRows = [] } = useQuery({
    queryKey: ["client-last-bonos"],
    queryFn: async () =>
      (await supabase
        .from("client_bonos")
        .select("client_id, bono_catalogo_id, fecha_inicio, created_at")
        .order("fecha_inicio", { ascending: false })
        .order("created_at", { ascending: false })
      ).data as { client_id: string; bono_catalogo_id: string | null; fecha_inicio: string; created_at: string }[] ?? [],
  });
  const lastBonoByClient = new Map<string, string>();
  for (const row of lastBonoRows) {
    if (lastBonoByClient.has(row.client_id)) continue;
    if (!row.bono_catalogo_id) continue;
    lastBonoByClient.set(row.client_id, row.bono_catalogo_id);
  }

  // Al elegir cliente en una NUEVA factura, precargar su último bono contratado
  // y el precio del catálogo (si aún no se han modificado a mano).
  useEffect(() => {
    if (editingId) return;
    if (!form.client_id) return;
    if (form.bono_catalogo_id) return;
    const bonoId = lastBonoByClient.get(form.client_id);
    if (!bonoId) return;
    const cat = catalogo.find((b) => b.id === bonoId);
    setForm((f) => ({
      ...f,
      bono_catalogo_id: bonoId,
      precio_cobrado: f.precio_cobrado && f.precio_cobrado > 0 ? f.precio_cobrado : (cat ? Number(cat.precio) : f.precio_cobrado),
      sesiones_override: (f as { sesiones_override?: number | null }).sesiones_override ?? (cat ? cat.sesiones_incluidas : null),
    }));
  }, [form.client_id, editingId, lastBonoByClient, catalogo, form.bono_catalogo_id]);

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

  const monthsWithData = monthsByYear.get(year) ?? new Set<number>();
  const monthsForYear = new Set<number>(monthsWithData);
  // Include the current month by default so the user can register the first invoice of the month.
  if (year === now.getFullYear()) monthsForYear.add(now.getMonth());
  const availableMonths = MONTHS.map((label, idx) => ({ label, idx })).filter(({ idx }) => monthsForYear.has(idx));

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

  const searchNorm = search.trim().toLowerCase();
  const exactInvoices = searchNorm
    ? invoices.filter((i) => {
        const c = i.client_id ? clientMap.get(i.client_id) : null;
        return normalizeText(c?.nombre).includes(normalizeText(searchNorm));
      })
    : invoices;
  const filteredInvoices = !searchNorm || exactInvoices.length > 0
    ? exactInvoices
    : invoices.filter((i) => {
        const c = i.client_id ? clientMap.get(i.client_id) : null;
        return fuzzyMatch(c?.nombre, searchNorm);
      });
  const filteredTotal = filteredInvoices.reduce((acc, i) => acc + Number(i.precio_cobrado), 0);

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
    if (!(await confirm({ title: "¿Eliminar esta factura?", description: "Se revertirá el bono creado." }))) return;
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Factura eliminada");
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoices-fechas"] });
    qc.invalidateQueries({ queryKey: ["client_bonos"] });
    qc.invalidateQueries({ queryKey: ["client-last-bonos"] });
    qc.invalidateQueries({ queryKey: ["client-altas"] });
  }

  async function save() {
    if (!form.client_id) {
      setConfirmNoClient(true);
      return;
    }
    await persist();
  }

  async function persist() {
    const clientId = form.client_id ?? null;
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
      sesiones_override: bonoId && clientId ? sesionesOverride : null,
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
    qc.invalidateQueries({ queryKey: ["client-last-bonos"] });
    qc.invalidateQueries({ queryKey: ["client-altas"] });
    setOpen(false);
  }

  return (
    <div className="p-6 space-y-4">
      {dialog}
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
        <ExpandableSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar factura por cliente..."
        />
        <div className="ml-auto rounded-lg border bg-card px-4 py-2">
          <span className="text-xs text-muted-foreground">{searchNorm ? "Total filtrado: " : isYear ? "Total año: " : "Total mes: "}</span>
          <span className="font-semibold">{(searchNorm ? filteredTotal : total).toFixed(2)} €</span>
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
            {filteredInvoices.map((i) => {
              const cat = catMap.get(i.bono_catalogo_id ?? "");
              const tipo = cat?.tipo;
              const TIPO_LABEL: Record<string, string> = { prueba: "Prueba", individual: "Individual", pareja: "Pareja", grupal: "Grupal", gympass: "Gympass" };
              return (
              <TableRow key={i.id}>
                <TableCell>{i.fecha}</TableCell>
                <TableCell>{i.cobrador_trainer_id ? trainerMap.get(i.cobrador_trainer_id)?.nombre : "—"}</TableCell>
                <TableCell className="font-medium">
                  {(() => {
                    const c = i.client_id ? clientMap.get(i.client_id) : null;
                    const isAlta = i.client_id ? altaByClient.get(i.client_id) === i.fecha : false;
                    return c ? (
                      <div className="flex items-center gap-2">
                        <button className="hover:underline text-left" onClick={() => setViewingClient(c)}>{formatNameTitle(c.nombre)}</button>
                        {isAlta && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">Alta</span>
                        )}
                      </div>
                    ) : <span className="text-muted-foreground italic">Sin cliente</span>;
                  })()}
                </TableCell>
                <TableCell>{tipo ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={chipStyle(tipoColorOf(colores, tipo)!)}>{TIPO_LABEL[tipo] ?? tipo}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
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
            {filteredInvoices.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{searchNorm ? "Sin resultados" : "Sin facturas este mes"}</TableCell></TableRow>
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
            <ClientPicker autoFocus value={form.client_id ?? null} onChange={(id) => setForm({ ...form, client_id: id ?? undefined })} />
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
      <AlertDialog open={confirmNoClient} onOpenChange={setConfirmNoClient}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factura sin cliente</AlertDialogTitle>
            <AlertDialogDescription>
              No has seleccionado ningún cliente. ¿Quieres registrar la factura sin cliente asociado?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmNoClient(false); void persist(); }}>
              Registrar sin cliente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}