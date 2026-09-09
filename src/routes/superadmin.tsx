import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyRoles } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/superadmin")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const roles = await fetchMyRoles();
    if (!roles.includes("superadmin")) throw redirect({ to: "/auth" });
  },
  component: SuperadminLayout,
});

function SuperadminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <ShieldCheck className="h-5 w-5" />
          <Link to="/superadmin" className="font-display text-sm font-semibold tracking-tight">
            Panel de gestión de plataforma
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button variant="secondary" size="sm" className="gap-2" onClick={handleSignOut}>
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
