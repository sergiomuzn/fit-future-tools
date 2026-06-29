import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase, type Invoice, type Client, type Trainer, type BonoCatalogo } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_shell/facturacion")({ component: FacturacionPage });

const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function FacturacionPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Invoice> & { nuevoCliente?: string }>({});
  const [search, setSearch] = useState("");

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: async () => (await supabase.from("clients").select("*").order("nombre")).data as Client[] ?? [] });
  const { data: trainers = [] } = useQuery({ queryKey: ["trainers"], queryFn: async () => (await supabase.from("trainers").select("*")).data as Trainer[] ?? [] });
  const { data: catalogo = [] } = useQuery({ queryKey: ["bonos_catalogo"], queryFn: async () => (await supabase.from("bonos_catalogo").select("*").order("orden")).data as BonoCatalogo[] ?? [] });

  const startD = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = new Date(year, month + 1, 0);
  const endD = `${year}-${String(month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", startD, endD],
    queryFn: async () => (await supabase.from("invoices").select("*").gte("fecha", startD).lte("fecha", endD).order("fecha", { ascending: false })).data as Invoice[] ?? [],
  });

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const trainerMap = new Map(trainers.map((t) => [t.id, t]));
  const catMap = new Map(catalogo.map((b) => [b.id, b]));

  const total = invoices.reduce((acc, i) => acc + Number(i.precio_cobrado), 0);

  const filteredClients = useMemo(
    () => clients.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase())),
    [clients, search],
  );

  function openNew() {
    setForm({ fecha: new Date().toISOString().slice(0, 10) });
    setSearch("");
    setOpen(true);
  }

  async function save() {
    let clientId = form.client_id;
    if (!clientId && form.nuevoCliente) {
      const { data, error } = await supabase.from("clients").insert({ nombre: form.nuevoCliente }).select().single();
      if (error) { toast.error(error.message); return; }
      clientId = data.id;
      qc.invalidateQueries({ queryKey: ["clients"] });
    }
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
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[year-2, year-1, year, year+1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto rounded-lg border bg-card px-4 py-2">
          <span className="text-xs text-muted-foreground">Total mes: </span>
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
                <TableCell>{catMap.get(i.bono_catalogo_id)?.nombre ?? "?"}</TableCell>
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
              <Input placeholder="Buscar cliente o escribir nuevo nombre..." value={search} onChange={(e) => { setSearch(e.target.value); setForm({ ...form, client_id: undefined, nuevoCliente: e.target.value }); }} />
              <div className="max-h-32 overflow-y-auto rounded-md border">
                {filteredClients.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setForm({ ...form, client_id: c.id, nuevoCliente: undefined }); setSearch(c.nombre); }} className={`w-full text-left px-2 py-1.5 text-sm hover:bg-accent ${form.client_id === c.id ? "bg-accent font-medium" : ""}`}>
                    {c.nombre}
                  </button>
                ))}
                {filteredClients.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground">Sin resultados.</div>
                )}
              </div>
              {search && !form.client_id && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    const nombre = search.trim();
                    if (!nombre) return;
                    const { data, error } = await supabase.from("clients").insert({ nombre }).select().single();
                    if (error) { toast.error(error.message); return; }
                    qc.invalidateQueries({ queryKey: ["clients"] });
                    setForm({ ...form, client_id: data.id, nuevoCliente: undefined });
                    setSearch(data.nombre);
                    toast.success(`Cliente «${nombre}» creado`);
                  }}
                >
                  + Añadir «{search}» como nuevo cliente
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Bono</Label>
              <Select value={form.bono_catalogo_id ?? ""} onValueChange={(v) => {
                const b = catalogo.find((x) => x.id === v);
                setForm({ ...form, bono_catalogo_id: v, precio_cobrado: b ? Number(b.precio) : form.precio_cobrado });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona bono..." /></SelectTrigger>
                <SelectContent>
                  {(["individual", "pareja", "grupal"] as const).map((tipo) => (
                    <div key={tipo}>
                      <div className="text-[10px] uppercase text-muted-foreground px-2 pt-2">{tipo}</div>
                      {catalogo.filter((b) => b.tipo === tipo).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.nombre} — {Number(b.precio).toFixed(0)} €</SelectItem>
                      ))}
                    </div>
                  ))}
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