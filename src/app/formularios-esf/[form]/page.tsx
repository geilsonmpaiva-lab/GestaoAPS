import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { EsfProduction } from '@/components/esf-production';
import { commonEsfFields, esfTemplates } from '@/lib/esf/catalog';
import { canViewEsf, loadEsfProduction, productionFiltersSchema } from '@/lib/server/esf';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import type { EsfProductionData } from '@/lib/esf/production';

export default async function EsfFormPage({ params, searchParams }: { params: Promise<{ form: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { form } = await params;
  const template = esfTemplates.find(t => t.id === form);
  if (!template) notFound();
  const workspace = await loadWorkspaceContext();
  const query = await searchParams;
  const parsed = productionFiltersSchema.safeParse(query);
  let data: EsfProductionData | undefined; let error = '';
  if (form === 'producao' && canViewEsf(workspace) && parsed.success) {
    try { data = await loadEsfProduction(workspace, parsed.data); }
    catch (e) { error = e instanceof Error ? e.message : 'Falha na consulta.'; }
  }
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">
    <Link href="/formularios-esf" className="v2-back">← Formulários ESF</Link>
    <header className="module-heading"><div><p className="eyebrow">ESF-.pdf · página {template.page} · modelo v{template.version}</p><h1 className="page-title">{template.title}</h1></div></header>
    {!canViewEsf(workspace) ? <p role="alert">Acesso não autorizado.</p> : <>
    {form === 'producao' && (data && parsed.success ? <EsfProduction key={`${workspace.organizationId}:${workspace.unitId}:${JSON.stringify(parsed.data)}`} workspace={workspace} initial={data} filters={parsed.data} /> : <section className="v2-panel"><p role="alert">{error || 'Filtros inválidos. Escolha mês e equipe válidos.'}</p><Link href="/formularios-esf/producao" className="v2-secondary">Tentar novamente</Link></section>)}
    <details className="v2-panel v2-section" open={form !== 'producao'}><summary>Dicionário do modelo e pendências de aprovação</summary>
      <p className="v2-alert">{template.sensitive ? 'Modelo restrito: entrada de dados nominais não habilitada.' : 'Referência documental em rascunho; não representa catálogo institucional aprovado.'}</p>
      <ul>{template.pending.map(item => <li key={item}>{item}</li>)}</ul>
      <div className="esf-dictionary">{[...commonEsfFields, ...template.fields].map(field => <article key={`${field.group}:${field.key}`}><span className="eyebrow">{field.group}</span><h3>{field.label}</h3><p className="v2-muted">{({ text: 'Texto', date: 'Data', integer: 'Quantidade inteira', decimal: 'Número com unidade', select: 'Seleção estruturada', reference: 'Cadastro vinculado', attachment: 'Anexo privado', calculated: 'Preenchimento automático' })[field.type]}{field.unit ? ` · ${field.unit}` : ''}</p>{field.review && <p>{field.review}</p>}{field.options && <p>{field.options.join(' · ')}</p>}</article>)}</div>
    </details></>}
  </div></div></AppShell>;
}
