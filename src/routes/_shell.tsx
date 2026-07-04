import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, Users, Dumbbell, Wallet, ClipboardList, Receipt, BarChart3, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MiniCalendar } from "@/components/mini-calendar";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { AgendaDateProvider, useAgendaDate } from "@/lib/agenda-context";

export const Route = createFileRoute("/_shell")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: ShellLayout,
});

const NAV = [
  { to: "/", label: "Agenda", icon: Calendar },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/entrenadores", label: "Entrenadores", icon: Dumbbell },
  { to: "/bonos", label: "Bonos", icon: Wallet },
  { to: "/sesiones", label: "Sesiones", icon: ClipboardList },
  { to: "/facturacion", label: "Facturación", icon: Receipt },
  { to: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
] as const;

function ShellLayout() {
  return (
    <AgendaDateProvider>
      <ShellInner />
    </AgendaDateProvider>
  );
}

function ShellInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { date, setDate } = useAgendaDate();
  const [month, setMonth] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Mantén el mes visible del mini-calendario alineado con la fecha seleccionada
  useEffect(() => {
    if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-4 py-4 border-b flex items-center justify-between">
          <div className="font-display font-semibold tracking-tight">PT·Studio</div>
          <ThemeToggle />
        </div>
        <div className="p-3">
          <MiniCalendar
            selected={date}
            onSelect={(d) => {
              setDate(d);
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              if (pathname !== "/") navigate({ to: "/" });
            }}
            month={month}
            onMonthChange={setMonth}
          />
        </div>
        <nav className="px-2 py-2 flex flex-col gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-3 text-[10px] text-muted-foreground border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}