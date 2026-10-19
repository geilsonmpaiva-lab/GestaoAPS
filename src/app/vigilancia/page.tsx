import Link from 'next/link';
import './epidemiology.css';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppShell } from '@/components/app-shell';
import { Epidemiology } from '@/components/epidemiology';
import { epiFilters, type EpiData } from '@/lib/epidemiology';
import { epidemiologyEnabled, epidemiologyRpc, epidemiologyStageEnabled, epidemiologyMonthlyRpc } from '@/lib/server/epidemiology';
import type { EpiMonthReport } from '@/lib/epidemiology-monthly';
import { loadWorkspaceContext } from '@/lib/server/workspace';

export const dynamic = 'force-dynamic';
export default async function EpidemiologyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await loadWorkspaceContext();
  if (!epidemiologyStageEnabled(workspace)) notFound();
  if (!epidemiologyEnabled(workspace)) return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page"><h1 className="page-title">Vigilância Epidemiológica</h1><section className="v2-panel"><h2>Selecione uma UBS para continuar</h2><p>Use “Unidade de trabalho” no cabeçalho. Os formulários pertencem às equipes da UBS selecionada; o consolidado municipal aparece somente para quem tem permissão específica.</p><p className="v2-muted">Homologação com dados sintéticos. Nenhum registro nominal é carregado nesta tela.</p></section></div></div></AppShell>;
  const access = await epidemiologyRpc(workspace, { action: 'discover' });
  const areas = !access.error && Array.isArray(access.data) ? access.data as string[] : [];
  const { view, create, ...params } = await searchParams;
  const presentation = z.object({ view: z.enum(['records', 'summary', 'monthly']).default('records'), create: z.literal('1').optional() }).safeParse({ view, create });
  const activeView = presentation.success ? presentation.data.view : 'records';
  const filters = epiFilters.safeParse({ ...params, team: params.team || undefined, status: params.status || undefined, ...(workspace.uxV3 && activeView !== 'records' ? { record: undefined } : {}), area: params.area ?? areas[0] ?? 'hanseniase', month: params.month ?? new Date().toISOString().slice(0, 7) });
  let data: EpiData | undefined;
  let monthly: EpiMonthReport | undefined;
  if (presentation.success && filters.success && areas.includes(filters.data.area)) {
    const result = await epidemiologyRpc(workspace, { action: 'load', ...filters.data });
    if (!result.error) data = result.data as EpiData;
    const monthResult = await epidemiologyMonthlyRpc(workspace, { action: 'load', area: filters.data.area, month: filters.data.month, scope: 'unit' });
    if (!monthResult.error) monthly = monthResult.data as EpiMonthReport;
  }
  return <AppShell workspace={workspace}><div className="ux-v2"><div className={`v2-page epi-page${workspace.uxV3 ? ' epi-page-v3' : ''}`}>
    <header className="module-heading"><div><p className="eyebrow">Equipe → UBS → Município</p><h1 className="page-title">Vigilância Epidemiológica</h1><p className="v2-muted">Acompanhamento por área, com escopo e revisão identificados.</p></div></header>
    <p className="v2-alert">Homologação exclusiva com dados sintéticos. Modelos v1 em revisão; não inserir nomes ou dados reais. Registros, fechamentos e relatórios exigem conexão. O offline da Vigilância ainda não está liberado.</p>
    {workspace.uxV3 && filters.success && ['hanseniase', 'tuberculose'].includes(filters.data.area) && <section className="v2-panel"><h2>Entrada única longitudinal</h2><p>Esta tela preserva os registros anteriores. Para registrar uma competência nova do mesmo caso e gerar o formulário ESF, use a entrada longitudinal.</p><Link className="v2-button" href={'/vigilancia/acompanhamentos?' + new URLSearchParams({ area: filters.data.area, month: filters.data.month, ...(filters.data.team ? { team: filters.data.team } : {}) })}>Abrir casos e acompanhamentos</Link></section>}
    {data && filters.success && presentation.success ? <Epidemiology key={`${workspace.unitId}:${JSON.stringify(filters.data)}:${workspace.uxV3 ? `${activeView}:${create ?? ''}` : 'v2'}`} initial={data} filters={filters.data} areas={areas} monthly={monthly} workspace={workspace} uxV3={workspace.uxV3} view={activeView} createNew={presentation.data.create === '1'} /> : <section className="v2-panel"><h2>Consulta indisponível</h2><p role="alert">{areas.length ? 'Revise os filtros ou tente novamente. Nenhum resultado foi substituído por zero.' : 'Seu perfil ainda não tem permissão específica nesta área ou a estrutura não está disponível.'}</p><Link href="/vigilancia" className="v2-secondary">Tentar novamente</Link></section>}
  </div></div></AppShell>;
}
