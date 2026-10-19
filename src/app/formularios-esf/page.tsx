import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { esfTemplates } from '@/lib/esf/catalog';
import { canViewEsf } from '@/lib/server/esf';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { syntheticMapsEnabled } from '@/lib/server/esf-maps';

export default async function EsfCatalogPage() {
  const workspace = await loadWorkspaceContext();
  const mapsEnabled = syntheticMapsEnabled(workspace);
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page">
    <header className="module-heading"><div><p className="eyebrow">Rotina da atenção primária</p><h1 className="page-title">Formulários ESF</h1><p className="v2-muted">Do registro diário ao mapa mensal, com equipe, competência e revisão identificadas.</p></div></header>
    {!canViewEsf(workspace) ? <p role="alert">Seu perfil não permite acessar esta área.</p> : <>
      <section className="v2-panel v2-section"><h2>Implantação por fases</h2><p>{mapsEnabled ? 'Os 10 modelos estão em revisão institucional. Os mapas de teste recebem apenas dados sintéticos e geram relatórios preenchidos; isso não habilita dados reais.' : 'Os 10 modelos estão em revisão institucional. A produção tem um fluxo inicial para homologação; os demais formulários ainda não recebem dados.'}</p><p className="v2-muted">Comprovantes e offline integral aguardam homologação. Não insira dados reais sensíveis.</p><Link className="v2-secondary" href="/administracao/equipes">Consultar equipes ESF</Link></section>
      <div className="esf-catalog">{esfTemplates.map(template => workspace.uxV3 && ['hanseniase', 'tuberculose'].includes(template.id) ? <article className="v2-panel esf-template-card" key={template.id}><span className="eyebrow">Arquivo / modelo de origem</span><h2>{template.title}</h2><p className="v2-muted">Novos acompanhamentos ficam na Vigilância. Este modelo conserva os mapas e a impressão de origem; os históricos não foram unidos automaticamente.</p><div className="dialog-actions">{workspace.enabledModules.includes('vigilancia') && <Link className="v2-button" href={`/vigilancia/acompanhamentos?area=${template.id}&month=${new Date().toISOString().slice(0, 7)}`}>Abrir acompanhamentos</Link>}<Link className="v2-secondary" href={`/formularios-esf/${template.id}`}>Consultar modelo e mapas anteriores</Link></div></article> : <Link className="v2-panel esf-template-card" href={`/formularios-esf/${template.id}`} key={template.id}><span className="eyebrow">Página {template.page} · Fase {template.phase}</span><h2>{template.title}</h2><p className="v2-muted">{template.fields.length} campos de referência · {template.sensitive ? 'Acesso restrito' : 'Dados gerenciais'}</p><span className="v2-status" data-tone="amber">{template.id === 'producao' ? 'Fluxo em homologação' : mapsEnabled ? 'Mapa sintético em homologação' : 'Modelo em preparação'}</span><p>{template.id === 'producao' ? 'Abrir produção e mapa mensal →' : mapsEnabled ? 'Abrir mapa preenchível e PDF →' : 'Consultar campos e pendências →'}</p></Link>)}</div>
    </>}
  </div></div></AppShell>;
}
