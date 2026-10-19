import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { EsfProduction } from '@/components/esf-production';
import { commonEsfFields, esfTemplates } from '@/lib/esf/catalog';
import { canViewEsf, loadEsfProduction, productionFiltersSchema, productionViewSchema, ProductionUnavailableError, type EsfProductionViewData } from '@/lib/server/esf';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { loadEsfMaps, syntheticMapsEnabled, type MapListData } from '@/lib/server/esf-maps';
import { EsfMapEditor } from '@/components/esf-map-editor';

export default async function EsfFormPage({ params, searchParams }: { params: Promise<{ form: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { form } = await params;
  const template = esfTemplates.find(t => t.id === form);
  if (!template) notFound();
  const workspace = await loadWorkspaceContext();
  const query = await searchParams;
  const { view, ...productionQuery } = query;
  const presentation = productionViewSchema.safeParse(view);
  const parsed = productionFiltersSchema.safeParse(productionQuery);
  let data: EsfProductionViewData | undefined; let error = ''; let unavailable: ProductionUnavailableError['reason'] | undefined;
  let maps: MapListData | undefined;
  if (form !== 'producao' && syntheticMapsEnabled(workspace)) {
    try { maps = await loadEsfMaps(workspace, form, typeof query.team === 'string' ? query.team : undefined, typeof query.map === 'string' ? query.map : undefined); }
    catch { error = 'Não foi possível abrir este mapa ou equipe. Verifique seu acesso ou tente novamente.'; }
  }
  if (form === 'producao' && (canViewEsf(workspace) || workspace.uxV3) && parsed.success && presentation.success) {
    try { data = await loadEsfProduction(workspace, parsed.data); }
    catch (e) { error = e instanceof Error ? e.message : 'Falha na consulta.'; unavailable = e instanceof ProductionUnavailableError ? e.reason : undefined; }
  }
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">
    <Link href="/formularios-esf" className="v2-back">← Formulários ESF</Link>
    <header className="module-heading"><div><p className="eyebrow">ESF-.pdf · página {template.page} · modelo v{template.version}</p><h1 className="page-title">{template.title}</h1></div></header>
    {!canViewEsf(workspace) && !(workspace.uxV3 && form === 'producao') ? <p role="alert">Acesso não autorizado.</p> : <>
    {form === 'producao' && (data && parsed.success && presentation.success ? <EsfProduction key={`${workspace.organizationId}:${workspace.unitId}:${JSON.stringify(parsed.data)}:${workspace.uxV3 ? presentation.data : 'v2'}`} workspace={workspace} initial={data} filters={parsed.data} view={presentation.data} /> : <section className="v2-panel v2-section"><h2>{unavailable === 'disabled' ? 'Produção ainda não habilitada' : unavailable === 'access' ? 'Acesso à produção necessário' : unavailable === 'scope' ? 'Selecione uma UBS' : 'Consulta indisponível'}</h2><p role="alert">{error || 'Filtros inválidos. Escolha mês, equipe e área de produção válidos.'}</p>{(!unavailable || unavailable === 'unavailable') && <Link href="/formularios-esf/producao" className="v2-secondary">Tentar novamente</Link>}<Link href="/formularios-esf" className="v2-secondary">Voltar aos formulários</Link></section>)}
    {maps && <EsfMapEditor key={`${form}:${workspace.unitId}:${maps.teamId}:${maps.current?.id ?? 'new'}`} form={form} initial={maps} workspace={workspace} />}
    {form !== 'producao' && error && <section className="v2-panel"><p role="alert">{error}</p><Link className="v2-secondary" href={`/formularios-esf/${form}`}>Tentar novamente</Link></section>}
    <details className="v2-panel v2-section" open={form !== 'producao' && !maps}><summary>Dicionário do modelo e pendências de aprovação</summary>
      <p className="v2-alert">{maps ? 'Modelo em homologação: somente dados sintéticos. Dados reais e aprovação institucional não habilitados.' : template.sensitive ? 'Modelo restrito: entrada de dados nominais não habilitada.' : 'Referência documental em rascunho; não representa catálogo institucional aprovado.'}</p>
      <ul>{template.pending.map(item => <li key={item}>{item}</li>)}</ul>
      <div className="esf-dictionary">{[...commonEsfFields, ...template.fields].map(field => <article key={`${field.group}:${field.key}`}><span className="eyebrow">{field.group}</span><h3>{field.label}</h3><p className="v2-muted">{({ text: 'Texto', date: 'Data', integer: 'Quantidade inteira', decimal: 'Número com unidade', select: 'Seleção estruturada', reference: 'Cadastro vinculado', attachment: 'Anexo privado', calculated: 'Preenchimento automático' })[field.type]}{field.unit ? ` · ${field.unit}` : ''}</p>{field.review && <p>{field.review}</p>}{field.options && <p>{field.options.join(' · ')}</p>}</article>)}</div>
    </details></>}
  </div></div></AppShell>;
}
