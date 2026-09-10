import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { esfTemplates } from '@/lib/esf/catalog';
import { canViewEsf } from '@/lib/server/esf';
import { loadWorkspaceContext } from '@/lib/server/workspace';

export default async function EsfCatalogPage() {
  const workspace = await loadWorkspaceContext();
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">
    <header className="module-heading"><div><p className="eyebrow">Rotina da atenção primária</p><h1 className="page-title">Formulários ESF</h1><p className="v2-muted">Do registro diário ao mapa mensal, com equipe, competência e revisão identificadas.</p></div></header>
    {!canViewEsf(workspace) ? <p role="alert">Seu perfil não permite acessar esta área.</p> : <>
      <section className="v2-panel v2-section"><h2>Implantação por fases</h2><p>Os 10 modelos estão em revisão institucional. A produção tem um fluxo inicial para homologação; os demais formulários ainda não recebem dados.</p><p className="v2-muted">Fichas nominais, comprovantes e offline integral aguardam implementação e homologação. Não insira dados reais sensíveis.</p><Link className="v2-secondary" href="/administracao/equipes">Consultar equipes ESF</Link></section>
      <div className="esf-catalog">{esfTemplates.map(template => <Link className="v2-panel esf-template-card" href={`/formularios-esf/${template.id}`} key={template.id}><span className="eyebrow">Página {template.page} · Fase {template.phase}</span><h2>{template.title}</h2><p className="v2-muted">{template.fields.length} campos específicos · {template.sensitive ? 'Acesso restrito' : 'Dados gerenciais'}</p><span className="v2-status" data-tone="amber">{template.id === 'producao' ? 'Fluxo em homologação' : 'Modelo em preparação'}</span><p>{template.id === 'producao' ? 'Abrir produção e mapa mensal →' : 'Consultar campos e pendências →'}</p></Link>)}</div>
    </>}
  </div></div></AppShell>;
}
