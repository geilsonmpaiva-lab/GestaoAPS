import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { CnesUnitImport } from '@/components/cnes-unit-import';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { loadAdminCatalog } from '@/lib/server/admin-registration';

export default async function CnesImportPage() {
  const workspace = await loadWorkspaceContext();
  const { catalog, error } = await loadAdminCatalog(workspace);
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">
    <Link href="/administracao/unidades" className="v2-back">← Voltar às unidades</Link>
    <header className="v2-page-header"><div><p className="v2-eyebrow">{workspace.organizationName}</p><h1>Buscar unidades no CNES</h1><p>Escolha o município, selecione as unidades e revise antes de cadastrar.</p></div></header>
    {catalog?.canCreateUnits ? <CnesUnitImport key={workspace.organizationId} organizationId={workspace.organizationId} organizationName={workspace.organizationName} demo={Boolean(catalog.demo)} /> : <p className="v2-alert" role="alert">{error || 'Seu perfil não permite cadastrar unidades na organização.'}</p>}
  </div></div></AppShell>;
}
