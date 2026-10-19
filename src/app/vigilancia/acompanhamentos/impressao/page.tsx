import Link from 'next/link';
import { notFound } from 'next/navigation';
import { longReportFilters, longitudinalPaper, longitudinalDoubts, type LongReport } from '@/lib/epidemiology-longitudinal';
import { longitudinalEnabled, longitudinalRpc } from '@/lib/server/epidemiology-longitudinal';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { EsfPaperReport } from '@/components/esf-paper-report';
import { EsfPrintControls } from '@/components/esf-print-controls';
import '../../relatorio/report.css';
import './print.css';
export const dynamic = 'force-dynamic';
export default async function LongPrint({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await loadWorkspaceContext(); if (!longitudinalEnabled(workspace)) notFound();
  const filters = longReportFilters.safeParse(await searchParams); if (!filters.success) notFound();
  const result = await longitudinalRpc(workspace, { ...filters.data, action: 'report' });
  if (result.error) return <main className="epi-report"><h1>Relatório não autorizado ou indisponível</h1><p>Nenhum dado foi substituído por zero.</p><Link href="/vigilancia/acompanhamentos">Voltar</Link></main>;
  const report = result.data as LongReport;
  if (report.nominal) {
    const team = report.teams[0];
    return <main className="esf-print-page esf-faithful-print longitudinal-print"><EsfPrintControls /><EsfPaperReport document={longitudinalPaper(report, { organization: report.organizationName, unit: team.unitName, team: team.teamName })} /></main>;
  }
  return <main className="epi-report"><EsfPrintControls /><h1>Consolidação longitudinal · {report.area}</h1><p>{report.organizationName} · {report.month} · {report.scope === 'municipal' ? 'Município' : report.scope === 'unit' ? 'UBS' : 'Equipe'} · Sem dados nominais</p><p>{report.definitive ? 'REVISÕES FECHADAS NO RECORTE' : 'PRÉVIA PROVISÓRIA'}</p><table><thead><tr><th>UBS</th><th>Equipe</th><th>Registros</th><th>Pendências</th><th>Revisão</th></tr></thead><tbody>{report.teams.map(t => <tr key={t.teamId}><td>{t.unitName}</td><td>{t.teamName}</td><td>{t.total}</td><td>{t.pending}</td><td>{t.status === 'CLOSED' ? `Fechada ${t.revision}` : 'Em preenchimento'}</td></tr>)}</tbody></table><p>Contagens por identificador; não incidência. Ausência de lançamento não comprova ausência de atividade.</p><ul>{longitudinalDoubts.map(s => <li key={s}>{s}</li>)}</ul></main>;
}
