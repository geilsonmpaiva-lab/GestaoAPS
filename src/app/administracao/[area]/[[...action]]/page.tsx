import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AdminRegistration } from "@/components/admin-registration";
import { loadAdminCatalog } from "@/lib/server/admin-registration";
import { loadWorkspaceContext } from "@/lib/server/workspace";

export default async function AdminPage({ params }: { params: Promise<{ area: string; action?: string[] }> }) {
  const { area, action } = await params;
  if (!["usuarios", "unidades"].includes(area) || (action && (action.length !== 1 || action[0] !== "novo"))) notFound();
  const workspace = await loadWorkspaceContext();
  const { catalog, error } = await loadAdminCatalog(workspace);
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">
    {catalog ? <AdminRegistration area={area as "usuarios" | "unidades"} creating={action?.[0] === "novo"} workspace={workspace} catalog={catalog} /> : <section className="v2-panel"><h1>Cadastros administrativos</h1><p role="alert">{error}</p><Link className="v2-secondary" href={`/administracao/${area}`}>Tentar novamente</Link> <Link className="v2-secondary" href="/administracao">Voltar à Administração</Link></section>}
  </div></div></AppShell>;
}
