import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ClipboardPenLine, UsersRound, Library, CalendarDays, BarChart3, FileCheck2 } from 'lucide-react';
import { AppShell } from './app-shell';
import { ApsCardLink, ApsEmpty, ApsErrors, ApsPageHeader } from './aps-ui';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { apsFilters, apsWorkPage, loadApsWorkspace } from '@/lib/server/aps-workspace';
import { esfTemplates } from '@/lib/esf/catalog';
import { syntheticMapsEnabled } from '@/lib/server/esf-maps';
import { ApsScopeLink } from './aps-scope-link';

export type ApsHubKind = 'register' | 'pending' | 'results' | 'organization';
const headings = {
  register: ['Rotina da equipe', 'Registrar dados', 'Escolha a atividade. A UBS selecionada acompanha todos os registros.'],
  pending: ['Acompanhe seu trabalho', 'Pendências e entregas', 'Confira o preenchimento, a revisão e o fechamento de cada equipe.'],
  results: ['Equipe → UBS → Município', 'Resultados e relatórios', 'Consulte a cobertura e abra os mapas do recorte autorizado.'],
  organization: ['Organize o trabalho', 'Qualidade e organização', 'Orientações, protocolos e decisões conectados à rotina da unidade.'],
};
export async function ApsHub({ kind, searchParams }: { kind: ApsHubKind; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await loadWorkspaceContext();
  if (!workspace.uxV3) notFound();
  const [eyebrow, title, description] = headings[kind];
  if (kind === 'organization') return <AppShell workspace={workspace}><div className="aps-page"><ApsPageHeader eyebrow={eyebrow} title={title} description={description} /><div className="aps-task-grid">{[
    { module: 'conhecimento', title: 'Biblioteca institucional', description: 'Consulte orientações e conteúdos publicados.', icon: <Library size={22} /> },
    { module: 'protocolos', title: 'Protocolos e execuções', description: 'Execute atividades guiadas e acompanhe suas evidências.', icon: <FileCheck2 size={22} /> },
    { module: 'melhoria', title: 'Planos e ações', description: 'Organize melhorias com responsáveis e prazos.', icon: <ClipboardPenLine size={22} /> },
    { module: 'reunioes', title: 'Reuniões', description: 'Prepare pautas e acompanhe decisões e encaminhamentos.', icon: <CalendarDays size={22} /> },
    { module: 'indicadores', title: 'Indicadores e metas', description: 'Compare resultados e registre análises.', icon: <BarChart3 size={22} /> },
  ].filter(a => workspace.enabledModules.includes(a.module)).map(a => <ApsCardLink key={a.module} href={`/${a.module}`} title={a.title} description={a.description} icon={a.icon} />)}</div></div></AppShell>;
  const raw = await searchParams;
  const parsed = apsFilters.safeParse({ ...raw, area: raw.area || '', team: raw.team || undefined });
  if (!parsed.success) return <AppShell workspace={workspace}><div className="aps-page"><ApsPageHeader eyebrow={eyebrow} title={title} description={description} /><ApsErrors errors={['Revise a competência, a área e a equipe informadas.']} /><Link href={kind === 'register' ? '/registrar' : kind === 'pending' ? '/pendencias' : '/resultados'}>Limpar filtros</Link></div></AppShell>;
  const filters = parsed.data;
  const data = await loadApsWorkspace(workspace, filters);
  const work = apsWorkPage(data, filters);
  const items = work.items;
  function pageHref(page: number) { const query = new URLSearchParams({ month: data.month, area: filters.area, search: filters.search, status: filters.status, page: String(page), ...(filters.team ? { team: filters.team } : {}) }); return `${kind === 'pending' ? '/pendencias' : '/resultados'}?${query}`; }
  const path = kind === 'register' ? '/registrar' : kind === 'pending' ? '/pendencias' : '/resultados';
  return <AppShell workspace={workspace}><div className="aps-page"><ApsPageHeader eyebrow={eyebrow} title={title} description={description} />
    {!workspace.unitId && kind !== 'results' ? <ApsEmpty title="Escolha a unidade de trabalho"><p>Selecione uma UBS no cabeçalho para consultar as equipes e atividades autorizadas. A visão municipal não permite lançar em uma equipe sem escolher a UBS.</p></ApsEmpty> : <>
    <form action={path} className="aps-filter-bar">{filters.team && <input type="hidden" name="team" value={filters.team} />}<input type="hidden" name="search" value={filters.search} /><input type="hidden" name="status" value={filters.status} /><label className="v2-field">Competência<input type="month" name="month" defaultValue={data.month} required min="2000-01" max="2099-12" /></label><label className="v2-field">Área<select name="area" defaultValue={parsed.data.area}><option value="">Todas as áreas autorizadas</option>{data.availableAreas.map(a => <option value={a.id} key={a.id}>{a.title}</option>)}</select></label><button className="v2-secondary">Aplicar filtros</button><Link href={path}>Limpar</Link></form>
    {kind !== 'register' && <form className="aps-filter-bar" action={path}><input type="hidden" name="month" value={data.month} /><input type="hidden" name="area" value={parsed.data.area} />{filters.team && <input type="hidden" name="team" value={filters.team} />}<label className="v2-field">Pesquisar entrega<input name="search" defaultValue={parsed.data.search} maxLength={100} placeholder="Área ou equipe" /></label><label className="v2-field">Situação<select name="status" defaultValue={parsed.data.status}><option value="">Todas</option>{['Fechado', 'Sem declaração', 'Com pendências', 'Pronto para fechamento', 'Em preenchimento', 'Aguardando revisão'].map(status => <option key={status}>{status}</option>)}</select></label><button className="v2-secondary">Pesquisar</button></form>}
    <ApsErrors errors={[...data.errors, ...data.areas.filter(a => a.error).map(a => `${a.title}: ${a.error}`)]} />
    {kind === 'register' ? <>
      <div className="aps-task-grid">
        {workspace.enabledModules.includes('formularios-esf') && <div className="aps-task-card"><span className="aps-task-icon"><ClipboardPenLine size={22} aria-hidden /></span><h2>Produção diária</h2><p>Informe data, procedimento e quantidade. O mapa mensal é calculado a partir dos lançamentos.</p>{data.production.data ? <Link className="v2-button" href={`/formularios-esf/producao?month=${data.month}&view=new`}>{data.production.data.canCreate ? 'Registrar produção' : 'Consultar produção'}<ArrowRight size={16} aria-hidden /></Link> : <p className="aps-unavailable">{data.production.reason || 'Nenhuma equipe de produção disponível neste recorte.'}</p>}</div>}
        {data.areas.map(area => {
          const writeTeams = area.teams.filter(t => t.write);
          return <ApsCardLink key={area.id} href={`/vigilancia?${new URLSearchParams({ area: area.id, month: data.month, view: 'records', ...(writeTeams.length ? { create: '1', team: writeTeams[0].id } : {}) })}`} title={area.title} description={writeTeams.length ? 'Preencha o registro e acompanhe a revisão da unidade.' : 'Consulte os consolidados permitidos ao seu perfil.'} label={writeTeams.length ? 'Registrar acompanhamento' : 'Consultar área'} icon={<UsersRound size={22} />} />;
        })}
      </div>
      {syntheticMapsEnabled(workspace) && workspace.enabledModules.includes('formularios-esf') && <section className="aps-panel"><h2>Outras rotinas da equipe</h2><p>Mapas preenchíveis disponíveis na homologação. Hanseníase e tuberculose têm entrada única em acompanhamento; seus modelos anteriores permanecem no arquivo.</p><div className="aps-task-grid">{esfTemplates.filter(t => !['producao', 'hanseniase', 'tuberculose'].includes(t.id)).map(t => <ApsCardLink key={t.id} href={`/formularios-esf/${t.id}`} title={t.title} description={t.sensitive ? 'Informações individuais com acesso restrito.' : 'Preencha o mapa e consulte o relatório calculado.'} />)}</div></section>}
    </> : <section className="aps-panel"><div className="aps-section-heading"><div><h2>{kind === 'pending' ? 'Situação das entregas' : 'Cobertura e relatórios'}</h2><p>Competência {data.month.split('-').reverse().join('/')} · {work.total} entrega(s) no recorte consultado</p></div></div>{items.length ? <ul className="aps-work-list">{items.map(item => {
      const href = kind === 'results' && item.area !== 'producao' ? `/vigilancia?${new URLSearchParams({ area: item.area, month: data.month, view: 'monthly', team: item.id.slice(item.area.length + 1) })}` : item.href;
      return <li key={item.id}><div><strong>{item.title}</strong><p>{!workspace.unitId && item.unitName ? `${item.unitName} · ` : ''}{item.team}</p><p><span className="aps-status">{item.status}</span>{item.total !== null && <> · {item.total} registro(s)</>}{item.pending !== null && <> · {item.pending} aguardando validação</>}</p></div>{!workspace.unitId && item.unitId ? <ApsScopeLink organizationId={workspace.organizationId} unitId={item.unitId} href={href} /> : <Link className="v2-secondary" href={href}>{kind === 'results' ? 'Abrir relatório' : item.nextAction}<ArrowRight size={16} aria-hidden /></Link>}</li>;
    })}</ul> : <ApsEmpty title="Nenhuma entrega disponível"><p>Selecione outra competência ou consulte as áreas autorizadas. Ausência de declaração não comprova ausência de atividade.</p></ApsEmpty>}
    {work.total > 25 && <nav className="v2-pagination" aria-label="Paginação das entregas">{work.page > 1 ? <Link className="v2-secondary" href={pageHref(work.page - 1)}>Anterior</Link> : <span />}<span>Página {work.page} de {Math.max(1, Math.ceil(work.total / 25))} · {work.total} entregas</span>{work.page * 25 < work.total ? <Link className="v2-secondary" href={pageHref(work.page + 1)}>Próxima</Link> : <span />}</nav>}
    {data.production.reason && <p className="aps-unavailable">{data.production.reason}</p>}
    </section>}
    {kind === 'results' && workspace.enabledModules.includes('indicadores') && <ApsCardLink href="/indicadores" title="Indicadores e metas" description="Consulte medições e comparações das unidades autorizadas." />}
    <p className="aps-footnote">Atualização: {new Date(data.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Informações restritas ao acesso vigente; dados nominais não aparecem neste painel.</p>
    </>}
  </div></AppShell>;
}
