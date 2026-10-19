import Link from 'next/link';
import { notFound } from 'next/navigation';
import { epiAreas, epiStates } from '@/lib/epidemiology';
import { epiCoverage, epiReportFilters, epiReportValue, type EpiMonthReport } from '@/lib/epidemiology-monthly';
import { epidemiologyEnabled, epidemiologyMonthlyRpc } from '@/lib/server/epidemiology';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { EpidemiologyPrintButton } from '@/components/epidemiology-print-button';
import './report.css';
export const dynamic = 'force-dynamic';
export default async function EpidemiologyReport({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await loadWorkspaceContext();
  if (!epidemiologyEnabled(workspace)) notFound();
  const query = epiReportFilters.safeParse(await searchParams);
  if (!query.success) return <main className="epi-report"><h1>Recorte inválido</h1><Link href="/vigilancia">Voltar à Vigilância</Link></main>;
  const { data, error } = await epidemiologyMonthlyRpc(workspace, { ...query.data, action: 'report' });
  if (error) return <main className="epi-report"><h1>Relatório indisponível</h1><p role="alert">Não foi possível carregar a revisão autorizada. Nenhum dado foi substituído por zero.</p><Link href="/vigilancia">Voltar à Vigilância</Link></main>;
  const report = data as EpiMonthReport; const definition = epiAreas.find(a => a.id === report.area)!;
  return <main className="epi-report">
    <nav className="epi-report-tools"><Link href={'/vigilancia?' + new URLSearchParams({ area: report.area, month: report.month })}>Voltar à Vigilância</Link><EpidemiologyPrintButton /></nav>
    <header><p>SGC-UBS · Homologação com dados sintéticos</p><h1>Vigilância Epidemiológica</h1><h2>{definition.title.replace(/[—–]/g, '-')} · {report.month}</h2><p>{report.organizationName}</p><strong>{report.definitive ? 'REVISÕES FECHADAS NO RECORTE AUTORIZADO' : 'PRÉVIA PROVISÓRIA - NÃO DEFINITIVO'}</strong><p>{epiCoverage(report)}.</p><p>{report.scope === 'municipal' ? 'Consolidado municipal autorizado' : report.scope === 'unit' ? 'Consolidado da UBS autorizado' : 'Relatório da equipe'} · {report.nominal ? 'Nominal restrito' : 'Sem dados nominais'} · Modelo v1</p><p>Gerado em {new Date(report.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília). Revisões históricas continuam válidas como histórico após reabertura.</p></header>
    <section><h2>Consolidado · {report.total} registros</h2><p>Contagem por identificador interno, não incidência nem casos confirmados. Sem lançamentos não comprova ausência de casos. O recorte inclui somente equipes autorizadas, sem o filtro de situação da lista.</p>
      <table><thead><tr><th>UBS / equipe</th><th>Revisão mensal</th><th>Registros</th><th>Sem validação</th></tr></thead><tbody>{report.teams.map(t => <tr key={t.teamId}><td>{t.unitName}<br />{t.teamName}</td><td>{t.status === 'CLOSED' ? `Fechada · revisão ${t.revision}` : 'Em preenchimento'}{t.noActivity ? ' · Ausência declarada' : !t.total ? ' · Não declarada' : ''}</td><td>{t.total}</td><td>{t.pending}</td></tr>)}</tbody></table>
    </section>
    {report.teams.filter(t => t.status === 'CLOSED').map(t => <section className="epi-report-responsibility" key={t.teamId}><h3>{t.teamName} · revisão {t.revision}</h3><p>Fechado em {new Date(t.closedAt!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília). Responsável (ID): {t.closedBy}.</p>{report.nominal && t.reason && <p>Justificativa: {t.reason}</p>}</section>)}
    {report.nominal && <section><h2>Registros nominais restritos</h2>{report.teams.flatMap(t => (t.records ?? []).map((r, i) => <article className="epi-report-record" key={r.id}><h3>{i + 1}. {t.teamName} · {epiStates[r.status]} · versão {r.version}</h3><p>Identificador interno: {r.id}</p><table><tbody>{definition.fields.map(f => <tr key={f.key}><th>{f.label.replace(/[—–]/g, '-')}</th><td>{epiReportValue(r.payload[f.key])}</td></tr>)}</tbody></table></article>))}</section>}
    <section><h2>Interpretações pendentes</h2><p>Origem: EPIDEMIOLOGIA 2026 (1).xlsx, aba {definition.source}. Modelos ainda em revisão institucional.</p><ul>{definition.pending.map(note => <li key={note}>{note}</li>)}</ul></section>
  </main>;
}
