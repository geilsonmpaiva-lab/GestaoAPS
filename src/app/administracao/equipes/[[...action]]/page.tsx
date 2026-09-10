import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { EsfTeams } from '@/components/esf-teams';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { loadEsfTeams } from '@/lib/server/esf';
import { loadAdminCatalog } from '@/lib/server/admin-registration';
import { isDemoMode } from '@/lib/server/supabase';
import type { EsfTeam } from '@/lib/esf/production';

export default async function EsfTeamsPage({ params }: { params: Promise<{ action?: string[] }> }) {
  const { action } = await params;
  if (action && (action.length !== 1 || action[0] !== 'novo')) notFound();
  const workspace = await loadWorkspaceContext();
  let teams: EsfTeam[] = []; let canCreate = false; let error = false;
  try {
    teams = await loadEsfTeams(workspace);
    const { catalog } = await loadAdminCatalog(workspace);
    canCreate = !!workspace.unitId && !!catalog?.grants.some(g => (g.unitId === null || g.unitId === workspace.unitId) && (g.domains.includes('*') || g.domains.includes('administracao')) && (g.operations.includes('criar') || g.role === 'ADMIN_SISTEMA'));
  } catch { error = true; }
  const content = error ? <section className="v2-panel"><h1>Equipes ESF</h1><p role="alert">Não foi possível carregar as equipes. A migration ESF precisa estar aplicada no ambiente.</p><Link className="v2-secondary" href="/administracao/equipes">Tentar novamente</Link></section> : <EsfTeams teams={teams} workspace={workspace} creating={action?.[0] === 'novo'} canCreate={canCreate} demo={isDemoMode()} />;
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">{content}</div></div></AppShell>;
}
