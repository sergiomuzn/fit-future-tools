import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Send, Mail, MailX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExpandableSearch } from "@/components/expandable-search";
import { useServicios } from "@/lib/servicios";
import { fuzzyMatch } from "@/lib/utils";

type ClienteSinAcceso = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
};

type Resultado = {
  cliente: string;
  email: string | null;
  url: string;
  enviado: boolean;
};

function generateCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

export function InvitarClientesInline() {
  const qc = useQueryClient();
  const { data: servicios = [] } = useServicios();
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [acceso, setAcceso] = useState<string[]>([]);
  const [fServicio, setFServicio] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [sinContactoOpen, setSinContactoOpen] = useState(false);
  const lastSelectedIdRef = useRef<string | null>(null);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes_sin_acceso"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    queryFn: async () => {
      const [{ data: cs, error: e1 }, { data: ps, error: e2 }] = await Promise.all([
        supabase.from("clients").select("id,nombre,email,telefono,activo").order("nombre"),
        supabase.from("client_profiles").select("client_id,activo"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const conAcceso = new Set(
        (ps ?? []).filter((p) => p.activo).map((p) => p.client_id).filter(Boolean) as string[],
      );
      return ((cs ?? []) as ClienteSinAcceso[]).filter((c) => !conAcceso.has(c.id));
    },
  });

  const { data: serviciosPorCliente = new Map<string, string[]>() } = useQuery({
    queryKey: ["servicios_por_cliente"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [{ data: cb }, { data: cat }] = await Promise.all([
        supabase.from("client_bonos").select("client_id,bono_catalogo_id,activo"),
        supabase.from("bonos_catalogo").select("id,servicio_slug"),
      ]);
      const catMap = new Map((cat ?? []).map((c) => [c.id, c.servicio_slug as string | null]));
      const map = new Map<string, string[]>();
      for (const b of cb ?? []) {
        if (!b.activo || !b.bono_catalogo_id) continue;
        const slug = catMap.get(b.bono_catalogo_id);
        if (!slug) continue;
        const prev = map.get(b.client_id) ?? [];
        if (!prev.includes(slug)) map.set(b.client_id, [...prev, slug]);
      }
      return map;
    },
  });

  const nombreServicio = (slug: string) => servicios.find((s) => s.slug === slug)?.nombre ?? slug;

  const clientesFiltrados = useMemo(() => {
    const filtrados =
      fServicio === "todos"
        ? clientes
        : fServicio === "sin"
          ? clientes.filter((c) => (serviciosPorCliente.get(c.id) ?? []).length === 0)
          : clientes.filter((c) => (serviciosPorCliente.get(c.id) ?? []).includes(fServicio));

    if (!busqueda.trim()) return filtrados;
    const q = busqueda.trim();
    return filtrados.filter((c) => fuzzyMatch(c.nombre, q) || fuzzyMatch(c.email, q) || fuzzyMatch(c.telefono, q));
  }, [clientes, fServicio, serviciosPorCliente, busqueda]);

  const accesoValue = useMemo(() => {
    if (acceso.length > 0) {
      if (acceso.includes("personal") && acceso.includes("grupos") && acceso.length === 2) return "ambos";
      return acceso.join(",");
    }
    // Sin selección explícita: se deriva del filtro de servicio activo
    if (fServicio !== "todos" && fServicio !== "sin") return fServicio;
    return "ambos";
  }, [acceso, fServicio]);

  const todosSeleccionados =
    clientesFiltrados.length > 0 && clientesFiltrados.every((c) => seleccionados.includes(c.id));

  function toggleSeleccion(id: string, event: React.MouseEvent | React.PointerEvent) {
    setSeleccionados((prev) => {
      const isSelected = prev.includes(id);
      if (event.shiftKey && lastSelectedIdRef.current && lastSelectedIdRef.current !== id) {
        const ids = clientesFiltrados.map((c) => c.id);
        const start = ids.indexOf(lastSelectedIdRef.current);
        const end = ids.indexOf(id);
        if (start !== -1 && end !== -1) {
          const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1);
          const next = new Set(prev);
          for (const rid of range) {
            if (isSelected) next.delete(rid);
            else next.add(rid);
          }
          return Array.from(next);
        }
      }
      lastSelectedIdRef.current = id;
      if (isSelected) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  const enviar = useMutation({
    mutationFn: async () => {
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      const elegidos = clientes.filter((c) => seleccionados.includes(c.id));
      const rows = elegidos.map((c) => ({
        code: generateCode(),
        nombre: c.nombre,
        email: c.email,
        expires_at: expires.toISOString(),
        acceso: accesoValue ?? "grupos",
        client_id: c.id,
      }));
      const { data, error } = await supabase.from("client_invitations").insert(rows).select("code,nombre,email");
      if (error) throw error;
      return (data ?? []).map((inv) => ({
        cliente: inv.nombre ?? "Cliente",
        email: inv.email,
        url: `${window.location.origin}/invitacion/${inv.code}`,
        enviado: false,
      })) satisfies Resultado[];
    },
    onSuccess: (res) => {
      setResultados(res);
      setSeleccionados([]);
      lastSelectedIdRef.current = null;
      qc.invalidateQueries({ queryKey: ["client_invitations"] });
      qc.invalidateQueries({ queryKey: ["clientes_sin_acceso"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  function reiniciar() {
    setResultados(null);
    setSeleccionados([]);
    setBusqueda("");
    setFServicio("todos");
    setAcceso([]);
    lastSelectedIdRef.current = null;
  }

  const enviadosPorEmail = resultados?.filter((r) => r.enviado).length ?? 0;
  const sinContacto = useMemo(
    () =>
      clientes.filter(
        (c) => seleccionados.includes(c.id) && !c.email?.trim() && !c.telefono?.trim(),
      ),
    [clientes, seleccionados],
  );

  function intentarEnviar() {
    if (sinContacto.length > 0) {
      setSinContactoOpen(true);
      return;
    }
    enviar.mutate();
  }
  const pendientes = resultados ? resultados.length - enviadosPorEmail : 0;

  return (
    <div className="space-y-4">
      {resultados ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="default" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {enviadosPorEmail} enviadas por email
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <MailX className="h-3.5 w-3.5" /> {pendientes} pendientes de envío manual
            </Badge>
          </div>
          <ScrollArea className="h-56">
            <div className="space-y-2 pr-3">
              {resultados.map((r) => (
                <div
                  key={r.url}
                  className="flex items-center justify-between gap-3 rounded-md border p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.cliente}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.enviado ? `Enviado a ${r.email}` : r.email || "Sin email registrado"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => copiar(r.url)}>
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex justify-end">
            <Button onClick={reiniciar}>Nueva selección</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Servicio</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={fServicio === "todos" ? "default" : "outline"}
                size="sm"
                onClick={() => setFServicio("todos")}
              >
                Todos
              </Button>
              {servicios.map((s) => (
                <Button
                  key={s.id}
                  variant={fServicio === s.slug ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFServicio(s.slug)}
                >
                  {s.nombre}
                </Button>
              ))}
              <Button
                variant={fServicio === "sin" ? "default" : "outline"}
                size="sm"
                onClick={() => setFServicio("sin")}
              >
                Sin bono
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ExpandableSearch
                value={busqueda}
                onChange={setBusqueda}
                placeholder="Buscar cliente..."
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={todosSeleccionados}
                  onCheckedChange={(v) => setSeleccionados(v === true ? clientesFiltrados.map((c) => c.id) : [])}
                />
                Seleccionar todos
              </label>
            </div>
            <span className="text-xs text-muted-foreground">{seleccionados.length} seleccionados</span>
          </div>

          <ScrollArea className="h-56 rounded-md border">
            <div className="divide-y">
              {isLoading && <p className="p-3 text-sm text-muted-foreground">Cargando…</p>}
              {!isLoading && clientesFiltrados.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  {busqueda.trim() ? "No hay clientes que coincidan con la búsqueda." : "No hay clientes que coincidan con este filtro."}
                </p>
              )}
              {clientesFiltrados.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 p-2.5 select-none"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSeleccion(c.id, e);
                  }}
                >
                  <Checkbox
                    checked={seleccionados.includes(c.id)}
                    onClick={(e) => e.preventDefault()}
                  />
                  <span className="min-w-0 flex-1 pointer-events-none">
                    <span className="block truncate text-sm font-medium">
                      {c.nombre}
                      {!c.activo && (
                        <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground align-middle">
                          Inactivo
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.email || "Sin email registrado"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1 pointer-events-none">
                    {(serviciosPorCliente.get(c.id) ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : (
                      (serviciosPorCliente.get(c.id) ?? []).map((slug) => (
                        <span
                          key={slug}
                          className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border whitespace-nowrap"
                        >
                          {nombreServicio(slug)}
                        </span>
                      ))
                    )}
                  </span>
                </label>
              ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end">
            <Button
              className="gap-1.5"
              disabled={seleccionados.length === 0 || !accesoValue || enviar.isPending}
              onClick={intentarEnviar}
            >
              <Send className="h-4 w-4" /> Invitar seleccionados
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={sinContactoOpen} onOpenChange={setSinContactoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clientes sin email ni teléfono</AlertDialogTitle>
            <AlertDialogDescription>
              {sinContacto.length === 1
                ? "1 cliente seleccionado no tiene email ni teléfono registrado, por lo que no se le podrá enviar la invitación."
                : `${sinContacto.length} clientes seleccionados no tienen email ni teléfono registrado, por lo que no se les podrá enviar la invitación.`}{" "}
              Se generará igualmente un enlace desde el que podrán acceder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto text-sm">
            <ul className="list-disc space-y-0.5 pl-5">
              {sinContacto.map((c) => (
                <li key={c.id}>{c.nombre}</li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSinContactoOpen(false);
                enviar.mutate();
              }}
            >
              Generar enlaces
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
