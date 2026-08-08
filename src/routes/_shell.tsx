import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, Users, Layers, Dumbbell, Wallet, ClipboardList, Receipt, BarChart3, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyRoles } from "@/lib/roles";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MiniCalendar } from "@/components/mini-calendar";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/notifications-bell";
import { cn } from "@/lib/utils";
import { AgendaDateProvider, useAgendaDate } from "@/lib/agenda-context";
import { useCenterConfig } from "@/lib/center-schedule";
import { useInactivityLogout } from "@/hooks/use-inactivity-logout";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_shell")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const roles = await fetchMyRoles();
    if (!roles.includes("admin")) throw redirect({ to: "/cliente" });
  },
  component: ShellLayout,
});

const NAV = [
  { to: "/", label: "Agenda", icon: Calendar },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/grupos", label: "Servicios", icon: Layers },
  { to: "/entrenadores", label: "Entrenadores", icon: Dumbbell },
  { to: "/bonos", label: "Bonos", icon: Wallet },
  { to: "/sesiones", label: "Sesiones", icon: ClipboardList },
  { to: "/facturacion", label: "Facturación", icon: Receipt },
  { to: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
] as const;

function ShellLayout() {
  const isMobile = useIsMobile();
  return (
    <AgendaDateProvider>
      <SidebarProvider defaultOpen={!isMobile}>
        <ShellInner />
      </SidebarProvider>
    </AgendaDateProvider>
  );
}

function ShellInner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { date, setDate } = useAgendaDate();
  const [month, setMonth] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { nombre: centroNombre } = useCenterConfig();
  const collapsed = state === "collapsed" && !isMobile;
  useInactivityLogout();

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

  // Al cambiar de ruta, sube al inicio de la página
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.querySelectorAll<HTMLElement>("[data-shell-scroll]").forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b">
          <div className="flex items-center justify-between gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
            <div className="font-display font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              {centroNombre}
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <ThemeToggle />
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {!collapsed && (
            <div className="p-3 group-data-[collapsible=icon]:hidden">
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
          )}
          <SidebarMenu className="px-2">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                    <Link
                      to={item.to}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                      className={cn(
                        "flex items-center gap-2",
                        active && "font-medium",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            onClick={handleSignOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="group-data-[collapsible=icon]:hidden">Cerrar sesión</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 border-b bg-muted px-2 py-1.5">
          <SidebarTrigger />
          <span className="font-display text-sm font-semibold tracking-tight md:hidden">{centroNombre}</span>
          <div className="ml-auto">
            <NotificationsBell />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto" data-shell-scroll>
          <Outlet />
        </div>
      </main>
    </div>
  );
}