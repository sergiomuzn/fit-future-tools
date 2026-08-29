import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyRoles } from "@/lib/roles";
import { getMyPortalProfile, getMiResumen } from "@/lib/client-portal.functions";
import { PerfilForm } from "@/components/cliente/perfil-form";
import { Button } from "@/components/ui/button";
import { useCenterName } from "@/lib/center-schedule";

export const Route = createFileRoute("/perfil")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mi perfil · Portal de cliente" },
      { name: "description", content: "Consulta tus datos de acceso y cambia tu correo o contraseña." },
      { property: "og:title", content: "Mi perfil · Portal de cliente" },
      {
        property: "og:description",
        content: "Consulta tus datos de acceso y cambia tu correo o contraseña.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const roles = await fetchMyRoles();
    if (roles.includes("admin") && !roles.includes("cliente")) throw redirect({ to: "/" });
  },
  component: PerfilPage,
});

function PerfilPage() {
  const centroNombre = useCenterName();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyPortalProfile);
  const fetchResumen = useServerFn(getMiResumen);

  const { data: profile } = useQuery({
    queryKey: ["portal-profile"],
    queryFn: () => fetchProfile({ data: undefined }),
  });
  const { data: resumen } = useQuery({
    queryKey: ["portal-resumen"],
    queryFn: () => fetchResumen({ data: undefined }),
  });

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button asChild variant="ghost" size="icon" aria-label="Volver">
              <Link to="/cliente">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold leading-tight">Mi perfil</h1>
              <p className="truncate text-xs text-muted-foreground">{centroNombre}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <PerfilForm
          nombre={resumen?.nombre ?? profile?.nombre ?? ""}
          email={resumen?.email ?? profile?.email ?? ""}
          telefono={resumen?.telefono ?? null}
        />
        <Button variant="outline" onClick={handleSignOut} className="w-full gap-1.5 sm:w-auto">
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </main>
    </div>
  );
}