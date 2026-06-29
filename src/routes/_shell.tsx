import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Calendar, Users, Dumbbell, Wallet, ClipboardList, Receipt, BarChart3 } from "lucide-react";
import { MiniCalendar } from "@/components/mini-calendar";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { AgendaDateProvider, useAgendaDate } from "@/lib/agenda-context";

export const Route = createFileRoute("/_shell")({
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
          Uso interno · acceso sin login
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}