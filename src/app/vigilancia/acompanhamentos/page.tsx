import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { EpidemiologyLongitudinal } from '@/components/epidemiology-longitudinal';
import { longFilters, type LongData, type LongReport } from '@/lib/epidemiology-longitudinal';
import { longitudinalEnabled, longitudinalRpc } from '@/lib/server/epidemiology-longitudinal';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import '../epidemiology.css';
export const dynamic = 'force-dynamic';
export default async function LongitudinalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const workspace = await loadWorkspaceContext();
  if (!longitudinalEnabled(workspace)) notFound();
  const raw = await searchParams;
  const parsed = longFilters.safeParse({ ...raw, area: raw.area ?? 'hanseniase', month: raw.month ?? new Date().toISOString().slice(0, 7), team: raw.team || undefined });
  const result = parsed.success ? await longitudinalRpc(workspace, { ...parsed.data, action: 'load' }) : null;
  const data = result && !result.error ? result.data as LongData : null;
  const report = parsed.success && data ? await longitudinalRpc(workspace, { area: parsed.data.area, month: parsed.data.month, scope: 'unit', action: 'summary', nominal: false }) : null;
  return <AppShell workspace={workspace}><div className="ux-v2"><div className="v2-page epi-page"><header className="module-heading"><div><p className="eyebrow">Entrada única · Equipe → UBS → Município</p><h1 className="page-title">Casos e acompanhamentos longitudinais</h1><p className="v2-muted">Identificação permanente, acompanhamento por competência e formulários ESF derivados.</p></div></header>
    {data && parsed.success ? <EpidemiologyLongitudinal key={`${workspace.unitId}:${JSON.stringify(parsed.data)}:${data.visit?.version ?? 0}:${JSON.stringify(report?.data?.teams?.map((t: { version: number }) => t.version))}`} workspace={workspace} data={data} report={report && !report.error ? report.data as LongReport : null} filters={parsed.data} /> : <section className="v2-panel"><h2>Consulta indisponível</h2><p role="alert">Confira a UBS, equipe e permissões, ou tente novamente. Nenhum dado foi substituído por zero.</p><Link href="/vigilancia/acompanhamentos">Tentar novamente</Link></section>}
  </div></div></AppShell>;
}
