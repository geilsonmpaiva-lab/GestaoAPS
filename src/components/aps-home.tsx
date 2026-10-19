import Link from 'next/link';
import { ArrowRight, ClipboardPenLine, Clock3, ChartNoAxesCombined, BookOpenText } from 'lucide-react';
import type { WorkspaceContext } from '@/lib/server/workspace';
import { apsCoreActions, apsWorkPage, loadApsWorkspace } from '@/lib/server/aps-workspace';
import { localEsfDate } from '@/lib/esf/production';
import { ApsCardLink, ApsErrors, ApsPageHeader } from './aps-ui';
import { ApsLocalWork } from './aps-local-work';

export async function ApsHome({ workspace }: { workspace: WorkspaceContext }) {
  const data = await loadApsWorkspace(workspace, { month: localEsfDate().slice(0, 7), area: '', page: 1, search: '', status: '' });
  const tasks = apsWorkPage(data, { page: 1, search: '', status: '' }).items.filter(item => item.status !== 'Fechado');
  const canRegister = data.production.data?.canCreate || data.areas.some(a => a.teams.some(t => t.write));
  return <div className="aps-page">
    <ApsPageHeader eyebrow="Seu espaço de trabalho" title={`Olá, ${workspace.userName.trim().split(/\s+/)[0]}.`} description="Registre o trabalho da equipe e acompanhe o que precisa de atenção." />
    <section className="aps-home-grid">
      <div className="aps-hero"><span className="aps-task-icon"><ClipboardPenLine size={26} aria-hidden /></span><p className="aps-eyebrow">Rotina da equipe</p><h2>{canRegister ? 'O que vamos registrar hoje?' : 'Acompanhe o trabalho da equipe'}</h2><p>{canRegister ? 'Encontre a atividade, confira sua equipe e preencha os dados.' : 'Consulte as atividades e os resultados disponíveis no seu acesso.'}</p><Link className="v2-button" href="/registrar">{canRegister ? 'Registrar dados' : 'Consultar registros'} <ArrowRight size={18} aria-hidden /></Link></div>
      <div className="aps-panel"><h2>Continue seu trabalho</h2><ApsLocalWork workspace={workspace} /><Link className="aps-inline-action" href="/pendencias"><Clock3 size={19} aria-hidden />Consultar envios e devoluções<ArrowRight size={16} aria-hidden /></Link>{apsCoreActions(workspace).map(a => <Link key={a.href} className="aps-inline-action" href={a.href}>{a.title}<ArrowRight size={16} aria-hidden /></Link>)}</div>
    </section>
    <ApsErrors errors={[...data.errors, ...data.areas.filter(a => a.error).map(a => `${a.title}: ${a.error}`)]} />
    <section className="aps-panel"><div className="aps-section-heading"><div><h2>Entregas da competência</h2><p>{data.month.split('-').reverse().join('/')} · Equipes e áreas autorizadas nesta UBS</p></div><Link href="/pendencias">Ver todas <ArrowRight size={16} aria-hidden /></Link></div>{!workspace.unitId ? <p>Escolha uma UBS no cabeçalho para consultar as entregas das equipes.</p> : tasks.length ? <ul className="aps-work-list">{tasks.slice(0, 5).map(item => <li key={item.id}><div><strong>{item.title}</strong><p>{item.team} · {item.status}</p></div><Link className="v2-secondary" href={item.href}>{item.nextAction}<ArrowRight size={15} aria-hidden /></Link></li>)}</ul> : <p>Nenhuma entrega aberta foi encontrada nas fontes consultadas. Consulte as áreas para iniciar um registro ou conferir competências anteriores.</p>}</section>
    <section className="aps-task-grid"><ApsCardLink href="/resultados" title="Resultados da equipe" description="Consulte consolidados, mapas e relatórios do seu recorte." icon={<ChartNoAxesCombined size={22} />} /><ApsCardLink href="/organizacao" title="Qualidade e organização" description="Encontre orientações, protocolos, planos e reuniões autorizados." icon={<BookOpenText size={22} />} /></section>
  </div>;
}
