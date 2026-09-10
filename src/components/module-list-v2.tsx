'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowRight, Plus, Search } from 'lucide-react';
import type { ModuleDefinition } from '@/lib/modules';
import type { ModuleFilters, WorkspaceContext } from '@/lib/server/workspace';
import { uiLabel } from '@/lib/ui-labels';

const resources: Record<string, string> = { conhecimento: 'knowledge', protocolos: 'protocols', indicadores: 'indicators', melhoria: 'action-plans', reunioes: 'meetings' };
const states: Record<string, string[]> = { conhecimento: ['DRAFT','IN_REVIEW','APPROVED','PUBLISHED','SUSPENDED','OBSOLETE'], protocolos: ['RASCUNHO','EM_REVISAO','APROVADO','PUBLICADO','SUSPENSO','OBSOLETO'], indicadores: ['ACTIVE'], melhoria: ['OPEN','CLOSED'], reunioes: ['SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED'] };
export function ModuleListV2({ module, workspace, filters }: { module: ModuleDefinition; workspace: WorkspaceContext; filters: ModuleFilters }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const returnTo = `${pathname}${query.size ? `?${query}` : ''}`;
  const pageInfo = module.pageInfo ?? { page: 1, pageSize: 25, total: module.records.length };
  const hasFilters = Boolean(filters.search || filters.status || filters.domain || filters.responsibleId || filters.due);
  const domain = module.slug === 'indicadores' ? 'indicadores' : module.slug;
  const canCreate = workspace.permissions.some(p => (p.domain === '*' || p.domain === domain) && (p.operations.includes('criar') || p.operations.includes('*')));
  function href(changes: Record<string, string>) { const params = new URLSearchParams(query); for (const [key,value] of Object.entries(changes)) { if (value) params.set(key,value); else params.delete(key); } return `${pathname}?${params}`; }
  const tabs = module.slug === 'melhoria' ? [['','Não conformidades'],['plans','Planos'],['actions','Ações']] : module.slug === 'protocolos' ? [['','Protocolos'],['executions','Execuções']] : module.slug === 'indicadores' ? [['','Indicadores'],['measurements','Medições']] : [];
  const statusOptions = filters.view === 'plans' || filters.view === 'actions' || filters.view === 'overdue-actions' ? ['NAO_INICIADO','EM_ANDAMENTO','BLOQUEADO','CONCLUIDO','CANCELADO'] : filters.view === 'executions' || filters.view === 'completed-executions' ? ['OPEN','IN_PROGRESS','PENDING_SYNC','COMPLETED','CANCELLED'] : filters.view === 'measurements' || filters.view === 'outside' ? ['SEM_DADO','DENTRO_META','ATENCAO','FORA_META'] : states[module.slug] ?? [];
  const measurementView = ['measurements', 'outside'].includes(filters.view ?? '');
  const executionView = ['executions', 'completed-executions'].includes(filters.view ?? '');
  const supportsSearch = !measurementView && !executionView;
  const supportsResponsible = !measurementView && ['conhecimento', 'protocolos', 'indicadores', 'melhoria', 'reunioes'].includes(module.slug);
  const supportsDue = ['melhoria', 'reunioes'].includes(module.slug);
  return <div className="content v2-page">
    <header className="module-heading"><div><p className="eyebrow">{workspace.unitName}</p><h1 className="page-title">{module.title}</h1><p className="v2-muted">{module.description}</p></div>{resources[module.slug] && canCreate && module.status !== 'gated' && <Link className="v2-button" href={`/cadastros/${resources[module.slug]}?returnTo=${encodeURIComponent(returnTo)}`}><Plus size={18} />{module.primaryAction}</Link>}</header>
    {module.slug==='administracao' && <section className="v2-panel v2-section"><h2>Módulos indisponíveis neste contexto</h2><p className="v2-muted">Áreas sem habilitação ou permissão não aparecem na navegação operacional.</p><ul>{[['qualidade','Qualidade'],['pessoas','Pessoas'],['patrimonio','Patrimônio'],['estoque','Estoque'],['seguranca','Segurança do paciente'],['ouvidoria','Ouvidoria']].filter(([slug])=>!workspace.enabledModules.includes(slug)).map(([slug,label])=><li key={slug}>{label} — indisponível</li>)}</ul></section>}
    {module.slug === 'administracao' && module.status !== 'gated' && <section className="v2-grid v2-section" aria-label="Cadastros administrativos"><Link className="v2-panel" href="/administracao/usuarios"><h2>Usuários <ArrowRight size={18} aria-hidden /></h2><p className="v2-muted">Consulte vínculos e convide pessoas com perfil, unidade e permissões definidos.</p></Link><Link className="v2-panel" href="/administracao/unidades"><h2>Unidades <ArrowRight size={18} aria-hidden /></h2><p className="v2-muted">Consulte as UBS e cadastre nome, CNES e endereço.</p></Link></section>}
    {module.slug === 'administracao' && module.status !== 'gated' && <section className="v2-grid v2-section"><Link className="v2-panel" href="/administracao/equipes"><h2>Equipes ESF</h2><p className="v2-muted">Identificação, área e equipes vinculadas à UBS selecionada.</p></Link><Link className="v2-panel" href="/formularios-esf"><h2>Formulários ESF</h2><p className="v2-muted">Produção diária e catálogo dos dez modelos em implantação.</p></Link></section>}
    {module.status === 'gated' ? <section className="v2-panel v2-section"><h2>Módulo indisponível</h2><p>Esta área ainda não foi liberada para a unidade selecionada.</p></section> : <>
    {tabs.length > 0 && <nav className="v2-tabs" aria-label={`Áreas de ${module.title}`}>{tabs.map(([value,label]) => <Link key={label} href={href({view:value,page:'',status:'',search:''})} aria-current={(filters.view ?? '') === value ? 'page' : undefined}>{label}</Link>)}</nav>}
    <section className="v2-panel">
      <form className="v2-toolbar" action={pathname} role="search" key={query.toString()}>
        {filters.view && <input type="hidden" name="view" value={filters.view} />}
        {supportsSearch && <label className="v2-field"><span>Pesquisar</span><input name="search" defaultValue={filters.search} placeholder="Título, código ou descrição" maxLength={100} /></label>}
        {statusOptions.length > 0 && <label className="v2-field"><span>Situação</span><select name="status" defaultValue={filters.status ?? ''}><option value="">Todas</option>{statusOptions.map(s => <option key={s} value={s}>{uiLabel(s)}</option>)}</select></label>}
        {['conhecimento','protocolos','indicadores'].includes(module.slug) && !filters.view && <label className="v2-field"><span>Domínio</span><input name="domain" defaultValue={filters.domain} placeholder="Todos os domínios" maxLength={80} /></label>}
        {supportsResponsible && <label className="v2-field"><span>Responsável</span><select name="responsibleId" defaultValue={filters.responsibleId ?? ''}><option value="">Todos</option><option value={workspace.userId}>Atribuído a mim</option></select></label>}
        {supportsDue && <label className="v2-field"><span>Prazo</span><select name="due" defaultValue={filters.due ?? ''}><option value="">Todos</option><option value="overdue">Atrasados</option><option value="upcoming">Próximos</option></select></label>}
        <label className="v2-field"><span>Ordenação</span><select name="sort" defaultValue={filters.sort ?? 'updated_desc'}><option value="updated_desc">Mais recentes</option>{supportsSearch && <option value="title_asc">Título A–Z</option>}{supportsDue && <option value="due_asc">Prazo mais próximo</option>}</select></label>
        <button className="v2-button" type="submit"><Search size={18} />Aplicar filtros</button>{hasFilters && <Link className="v2-secondary" href={href({search:'',status:'',domain:'',responsibleId:'',page:'',due:''})}>Limpar filtros</Link>}
      </form>
      <p className="v2-muted v2-section" role="status">{pageInfo.total} registro(s) no recorte selecionado</p>
      <div className="v2-records">{module.records.map((record,index) => <article className="v2-record" key={record.id || index}>
        <div><h2>{record.href ? <Link href={`${record.href}${record.href.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(returnTo)}`}>{record.title}</Link> : record.title}</h2><p className="v2-muted">{record.meta}</p>{record.dueAt && <p className="v2-muted">Prazo: {new Date(record.dueAt).toLocaleDateString('pt-BR')}</p>}{record.responsibleName && <p className="v2-muted">{record.responsibleName}</p>}</div>
        <span className="v2-status" data-tone={record.tone}>{uiLabel(record.rawStatus ?? record.status)}</span>
        {record.href && <Link className="v2-secondary" aria-label={`Abrir ${record.title}`} href={`${record.href}${record.href.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(returnTo)}`}>Abrir <ArrowRight size={16} /></Link>}
      </article>)}</div>
      {module.records.length === 0 && <div className="empty-state"><Search size={28} /><h2>{hasFilters ? 'Nenhum resultado para estes filtros' : 'Comece por aqui'}</h2><p>{hasFilters ? 'Altere a busca ou limpe os filtros para ampliar a consulta.' : 'Os registros desta unidade aparecerão aqui após o primeiro cadastro.'}</p></div>}
      <nav className="v2-pagination" aria-label="Paginação">{pageInfo.page > 1 ? <Link className="v2-secondary" href={href({page:String(pageInfo.page-1)})}>Anterior</Link> : <span /> }<span>Página {pageInfo.page} de {Math.max(1,Math.ceil(pageInfo.total / pageInfo.pageSize))}</span>{pageInfo.page * pageInfo.pageSize < pageInfo.total ? <Link className="v2-secondary" href={href({page:String(pageInfo.page+1)})}>Próxima</Link> : <span />}</nav>
    </section></>}
  </div>;
}
