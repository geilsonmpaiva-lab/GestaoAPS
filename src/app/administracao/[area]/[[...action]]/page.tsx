import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AdminRegistration } from "@/components/admin-registration";
import { loadAdminCatalog, loadSpecificAdminAccess } from "@/lib/server/admin-registration";
import { loadWorkspaceContext } from "@/lib/server/workspace";
import { groupAdminPeople } from "@/lib/domain/admin-registration";
import { z } from "zod";

export default async function AdminPage({ params }: { params: Promise<{ area: string; action?: string[] }> }) {
  const { area, action } = await params;
  const detailId = area === "usuarios" && action?.length === 1 && action[0] !== "novo" && z.uuid().safeParse(action[0]).success ? action[0] : undefined;
  if (!["usuarios", "unidades"].includes(area) || (action && (action.length !== 1 || (action[0] !== "novo" && !detailId)))) notFound();
  const workspace = await loadWorkspaceContext();
  if (detailId && !workspace.uxV3) notFound();
  const { catalog, error } = await loadAdminCatalog(workspace);
  if (catalog && detailId && !groupAdminPeople(catalog.users).some(person => person.id === detailId)) notFound();
  // Lists need no sensitive-grant query. Only an identified, authorized detail requests it.
  const specificAccess = detailId && catalog?.users.some(member => member.userId === detailId)
    ? await loadSpecificAdminAccess(workspace, detailId) : undefined;
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">
    {catalog ? <AdminRegistration area={area as "usuarios" | "unidades"} creating={action?.[0] === "novo"} detailId={detailId} workspace={workspace} catalog={catalog} specificAccess={specificAccess} /> : <section className="v2-panel"><h1>Cadastros administrativos</h1><p role="alert">{error}</p><Link className="v2-secondary" href={`/administracao/${area}`}>Tentar novamente</Link> <Link className="v2-secondary" href="/administracao">Voltar à Administração</Link></section>}
  </div></div></AppShell>;
}
