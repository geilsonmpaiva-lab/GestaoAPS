import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { loadEsfProduction, productionFiltersSchema } from '@/lib/server/esf';
import { esfMapRpc, loadEsfMaps, syntheticMapsEnabled } from '@/lib/server/esf-maps';
import { EsfMapReport } from '@/components/esf-map-report';
import { EsfProductionReport } from '@/components/esf-production-report';
import { EsfPrintControls } from '@/components/esf-print-controls';
import { mapDefinition, type EsfMap } from '@/lib/esf/maps';
import { z } from 'zod';

export default async function EsfPrintPage({ params, searchParams }: { params: Promise<{ form: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!await requireActor()) notFound();
  const { form } = await params, query = await searchParams;
  const workspace = await loadWorkspaceContext();
  let report;
  if (form === 'producao') {
    const filters = productionFiltersSchema.safeParse(query);
    if (!filters.success) notFound();
    const data = await loadEsfProduction(workspace, filters.data);
    if (!data.canExport) notFound();
    const team = data.teams.find(t => t.id === (filters.data.team ?? data.teams[0]?.id))?.name ?? 'Não informado';
    report = <EsfProductionReport data={data} month={filters.data.month} organization={workspace.organizationName} unit={workspace.unitName} team={team} />;
  } else {
    if (!mapDefinition(form) || !syntheticMapsEnabled(workspace) || !z.uuid().safeParse(query.map).success || !z.uuid().safeParse(query.team).success) notFound();
    const input = { templateId: form, teamId: query.team, entityId: query.map, action: 'export' };
    const result = await esfMapRpc(workspace, input);
    if (result.error || !result.data) notFound();
    const context = await loadEsfMaps(workspace, form, String(query.team));
    report = <EsfMapReport map={result.data as EsfMap} organization={workspace.organizationName} unit={workspace.unitName} team={context.teams.find(t => t.id === query.team)?.name ?? 'Não informado'} />;
  }
  return <main className="esf-print-page"><EsfPrintControls />{report}</main>;
}
