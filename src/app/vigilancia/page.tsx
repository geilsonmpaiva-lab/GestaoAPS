import Link from 'next/link';
import './epidemiology.css';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Epidemiology } from '@/components/epidemiology';
import { epiFilters, type EpiData } from '@/lib/epidemiology';
import { epidemiologyEnabled, epidemiologyRpc } from '@/lib/server/epidemiology';
import { loadWorkspaceContext } from '@/lib/server/workspace';

export const dynamic = 'force-dynamic';
export default async function EpidemiologyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await loadWorkspaceContext();
  if (!epidemiologyEnabled(workspace)) notFound();
  const access = await epidemiologyRpc(workspace, { action: 'discover' });
  const areas = !access.error && Array.isArray(access.data) ? access.data as string[] : [];
  const params = await searchParams;
  const filters = epiFilters.safeParse({ ...params, area: params.area ?? areas[0] ?? 'hanseniase', month: params.month ?? new Date().toISOString().slice(0, 7) });
  let data: EpiData | undefined;
  if (filters.success && areas.includes(filters.data.area)) {
    const result = await epidemiologyRpc(workspace, { action: 'load', ...filters.data });
    if (!result.error) data = result.data as EpiData;
  }
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">
    <header className="module-heading"><div><p className="eyebrow">Equipe → UBS → Município</p><h1 className="page-title">Vigilância Epidemiológica</h1><p className="v2-muted">Acompanhamento por área, com escopo e revisão identificados.</p></div></header>
    <p className="v2-alert">Homologação exclusiva com dados sintéticos. Modelos v1 em revisão; não inserir nomes ou dados reais. Esta entrega exige conexão. Offline, exportações e fechamento mensal aguardam homologação específica.</p>
    {data && filters.success ? <Epidemiology key={`${workspace.unitId}:${JSON.stringify(filters.data)}`} initial={data} filters={filters.data} areas={areas} /> : <section className="v2-panel"><h2>Consulta indisponível</h2><p role="alert">{areas.length ? 'Revise os filtros ou tente novamente. Nenhum resultado foi substituído por zero.' : 'Seu perfil ainda não tem permissão específica nesta área ou a estrutura não está disponível.'}</p><Link href="/vigilancia" className="v2-secondary">Tentar novamente</Link></section>}
  </div></div></AppShell>;
}
