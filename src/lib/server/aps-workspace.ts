import 'server-only';
import { z } from 'zod';
import { epiAreas, type EpiData } from '@/lib/epidemiology';
import type { EpiMonthReport } from '@/lib/epidemiology-monthly';
import { localEsfDate, type EsfProductionData } from '@/lib/esf/production';
import { mayOperate } from '@/lib/aps-policy';
import { createSupabaseServerClient, isDemoMode } from './supabase';
import { loadEsfProduction, loadEsfTeams } from './esf';
import { epidemiologyMonthlyRpc, epidemiologyRpc } from './epidemiology';
import type { WorkspaceContext } from './workspace';

export const apsFilters = z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).default(() => localEsfDate().slice(0, 7)), area: z.enum(['', ...epiAreas.map(a => a.id)] as [string, ...string[]]).default(''), team: z.uuid().optional(), page: z.coerce.number().int().min(1).max(100000).default(1), search: z.string().trim().max(100).default(''), status: z.enum(['', 'Fechado', 'Sem declaração', 'Com pendências', 'Pronto para fechamento', 'Em preenchimento', 'Aguardando revisão']).default('') }).strict();
export type ApsFilters = z.infer<typeof apsFilters>;
export type ApsArea = { id: string; title: string; teams: { id: string; name: string; view: boolean; write: boolean; review: boolean; validate: boolean; close: boolean }[]; municipal: boolean; report: EpiMonthReport | null; error?: string };
export type ApsWorkspace = {
  month: string; updatedAt: string; areas: ApsArea[]; availableAreas: { id: string; title: string }[]; errors: string[];
  production: { enabled: boolean; data: EsfProductionData | null; teamId?: string; deliveries?: { teamId: string; data: EsfProductionData }[]; reason: string };
};

/** Queries use the actor's JWT. Only authorized metadata leaves this service. */
export async function loadApsWorkspace(workspace: WorkspaceContext, filters: ApsFilters): Promise<ApsWorkspace> {
  const result: ApsWorkspace = { month: filters.month, updatedAt: new Date().toISOString(), areas: [], availableAreas: [], errors: [], production: { enabled: false, data: null, reason: '' } };
  if (!workspace.uxV3) throw new Error('Experiência não habilitada.');
  if (!workspace.unitId) {
    const scopes = workspace.scopes.filter(s => s.organizationId === workspace.organizationId && s.unitId);
    if (!scopes.length || !workspace.enabledModules.includes('vigilancia')) return result;
    const discovered = await Promise.all(scopes.map(async scope => ({ scope, result: await epidemiologyRpc({ ...workspace, ...scope }, { action: 'discover' }) })));
    if (discovered.some(d => d.result.error)) result.errors.push('Algumas UBS não puderam ser consultadas. A cobertura pode estar incompleta.');
    const areas = epiAreas.filter(a => discovered.some(d => !d.result.error && Array.isArray(d.result.data) && d.result.data.includes(a.id)));
    result.availableAreas = areas.map(a => ({ id: a.id, title: a.title }));
    result.areas = await Promise.all(areas.filter(a => !filters.area || a.id === filters.area).map(async area => {
      // Explicit municipal grants are checked by this RPC; organization membership alone is insufficient.
      const anchor = discovered.find(d => !d.result.error && Array.isArray(d.result.data) && d.result.data.includes(area.id))!.scope;
      const scoped = { ...workspace, ...anchor };
      const read = await epidemiologyMonthlyRpc(scoped, { action: 'load', area: area.id, month: filters.month, scope: 'municipal' });
      if (read.error) return { id: area.id, title: area.title, municipal: false, teams: [], report: null, error: 'Consolidação municipal não autorizada ou indisponível. Escolha uma UBS para consultar seu recorte.' };
      const report = read.data as EpiMonthReport;
      return { id: area.id, title: area.title, municipal: true, report, teams: report.teams.filter(t => !filters.team || t.teamId === filters.team).map(t => ({ id: t.teamId, name: t.teamName, view: false, write: false, review: false, validate: false, close: false })) };
    }));
    return result;
  }
  const production = async () => {
    if (!workspace.enabledModules.includes('formularios-esf') || filters.area) return;
    if (!isDemoMode()) {
      const client = await createSupabaseServerClient();
      const metadata = await client.rpc('read_workspace_metadata');
      if (metadata.error) { result.errors.push('Não foi possível conferir a disponibilidade da produção.'); return; }
      const flags = (metadata.data?.flags ?? []) as { key: string; organization_id: string; unit_id: string | null; enabled: boolean }[];
      const candidates = flags.filter(f => f.key === 'esf.producao' && f.organization_id === workspace.organizationId && (f.unit_id === null || f.unit_id === workspace.unitId));
      if (!(candidates.find(f => f.unit_id === workspace.unitId) ?? candidates.find(f => f.unit_id === null))?.enabled) {
        result.production.reason = 'Produção diária ainda não foi habilitada nesta UBS. Solicite a liberação ao responsável institucional.'; return;
      }
    }
    result.production.enabled = true;
    try {
      if (isDemoMode()) {
        result.production.data = await loadEsfProduction(workspace, { month: filters.month, team: filters.team, page: 1, procedure: '' });
        result.production.teamId = filters.team ?? result.production.data.teams[0]?.id;
        result.production.deliveries = result.production.teamId ? [{ teamId: result.production.teamId, data: result.production.data }] : [];
        return;
      }
      const teams = (await loadEsfTeams(workspace)).filter(t => t.status === 'ACTIVE' && (!filters.team || t.id === filters.team));
      const client = await createSupabaseServerClient();
      const reads = await Promise.all(teams.map(async team => {
        try {
          const read = await client.rpc('read_esf_production', { p_org: workspace.organizationId, p_unit: workspace.unitId, p_team: team.id, p_competency: filters.month, p_page: 1, p_search: '' });
          if (read.error) { if (read.error.code !== '42501') result.errors.push(`Produção de ${team.name} não pôde ser atualizada.`); return null; }
          return { teamId: team.id, data: read.data as EsfProductionData };
        } catch { result.errors.push(`Produção de ${team.name} não pôde ser atualizada.`); return null; }
      }));
      result.production.deliveries = reads.filter((r): r is NonNullable<typeof r> => r !== null);
      const readableTeams = teams.filter(t => result.production.deliveries!.some(d => d.teamId === t.id));
      for (const delivery of result.production.deliveries) delivery.data = { ...delivery.data, teams: readableTeams };
      result.production.data = result.production.deliveries[0]?.data ?? null;
      result.production.teamId = result.production.deliveries[0]?.teamId;
      if (!result.production.data) result.production.reason = 'Nenhuma equipe ativa com produção consultável neste recorte. Confira o vínculo com a equipe ou tente novamente.';
    }
    catch { result.production.reason = 'Produção habilitada, mas a consulta não foi autorizada ou não pôde ser concluída. Confira a equipe e o acesso com o administrador.'; }
  };
  const epidemiology = async () => {
    if (!workspace.enabledModules.includes('vigilancia')) return;
    const discover = await epidemiologyRpc(workspace, { action: 'discover' });
    if (discover.error) { result.errors.push('Não foi possível conferir as áreas de Vigilância.'); return; }
    const allowed = Array.isArray(discover.data) ? discover.data as string[] : [];
    result.availableAreas = epiAreas.filter(a => allowed.includes(a.id)).map(a => ({ id: a.id, title: a.title }));
    result.areas = await Promise.all(epiAreas.filter(a => allowed.includes(a.id) && (!filters.area || filters.area === a.id)).map(async area => {
      const [detail, monthly] = await Promise.all([
        epidemiologyRpc(workspace, { action: 'load', area: area.id, month: filters.month, ...(filters.team ? { team: filters.team } : {}), page: 1 }),
        epidemiologyMonthlyRpc(workspace, { action: 'load', area: area.id, month: filters.month, scope: 'unit' }),
      ]);
      if (detail.error) return { id: area.id, title: area.title, teams: [], municipal: false, report: null, error: 'Consulta indisponível. Verifique o recorte e tente novamente.' };
      const data = detail.data as EpiData;
      return { id: area.id, title: area.title, municipal: data.municipal, teams: data.teams.filter(t => !filters.team || t.id === filters.team).map(t => ({ id: t.id, name: t.name, view: t.permissions.view === true, write: t.permissions.save === true, review: t.permissions.review === true, validate: t.permissions.validate === true, close: t.permissions.close === true })), report: monthly.error ? null : monthly.data as EpiMonthReport, ...(monthly.error ? { error: 'O resumo mensal não pôde ser atualizado.' } : {}) };
    }));
  };
  const sources = await Promise.allSettled([production(), epidemiology()]);
  sources.forEach((source, i) => { if (source.status === 'rejected') result.errors.push(i === 0 ? 'A produção não pôde ser atualizada. Tente novamente.' : 'A Vigilância não pôde ser atualizada. Tente novamente.'); });
  return result;
}

export type ApsWorkItem = { id: string; title: string; team: string; area: string; unitId?: string; unitName?: string; status: string; nextAction: string; href: string; total: number | null; pending: number | null };
export function apsWorkItems(data: ApsWorkspace): ApsWorkItem[] {
  const items: ApsWorkItem[] = [];
  const deliveries = data.production.deliveries ?? (data.production.data && data.production.teamId ? [{ teamId: data.production.teamId, data: data.production.data }] : []);
  for (const delivery of deliveries) {
    const production = delivery.data;
    const team = production.teams.find(t => t.id === delivery.teamId);
    if (!team) continue;
    const status = production.monthly?.status ?? 'OPEN';
    items.push({ id: `production:${team.id}`, title: 'Produção diária', team: team.name, area: 'producao', status: status === 'CLOSED' ? 'Fechado' : status === 'IN_REVIEW' ? 'Aguardando revisão' : 'Em preenchimento', nextAction: status === 'CLOSED' ? 'Consultar mapa' : status === 'IN_REVIEW' && production.canReview ? 'Revisar entrega' : 'Continuar preenchimento', href: `/formularios-esf/producao?${new URLSearchParams({ month: data.month, team: team.id, view: status === 'OPEN' ? 'records' : 'monthly' })}`, total: production.total, pending: null });
  }
  for (const area of data.areas) for (const month of area.report?.teams ?? []) {
    const access = area.teams.find(t => t.id === month.teamId);
    if (!access) continue;
    const nextAction = month.status === 'CLOSED' ? 'Consultar relatório' : (month.counts.SUBMITTED ?? 0) > 0 && access.review ? 'Revisar envios' : (month.counts.REVIEWED ?? 0) > 0 && access.validate ? 'Validar registros' : month.total > 0 && month.pending === 0 && access.close ? 'Fechar competência' : access.write ? 'Preencher registros' : 'Consultar consolidado';
    const status = month.status === 'CLOSED' ? 'Fechado' : !month.total ? 'Sem declaração' : month.pending > 0 ? 'Com pendências' : 'Pronto para fechamento';
    const recordView = nextAction === 'Revisar envios' || nextAction === 'Validar registros' || nextAction === 'Preencher registros';
    items.push({ id: `${area.id}:${month.teamId}`, title: area.title, team: month.teamName, unitId: month.unitId, unitName: month.unitName, area: area.id, status, nextAction, href: `/vigilancia?${new URLSearchParams({ area: area.id, month: data.month, team: month.teamId, view: recordView ? 'records' : 'monthly', ...(nextAction === 'Revisar envios' ? { status: 'SUBMITTED' } : nextAction === 'Validar registros' ? { status: 'REVIEWED' } : {}) })}`, total: month.total, pending: month.pending });
  }
  return items;
}

export function apsWorkPage(data: ApsWorkspace, filters: Pick<ApsFilters, 'page' | 'search' | 'status'>) {
  const normalized = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const priority: Record<string, number> = { 'Com pendências': 0, 'Aguardando revisão': 1, 'Pronto para fechamento': 2, 'Em preenchimento': 3, 'Sem declaração': 4, Fechado: 5 };
  const items = apsWorkItems(data).filter(item => (!filters.status || item.status === filters.status) && (!filters.search || normalized(`${item.title} ${item.team}`).includes(normalized(filters.search)))).sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || a.team.localeCompare(b.team, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR'));
  return { total: items.length, page: filters.page, pageSize: 25, items: items.slice((filters.page - 1) * 25, filters.page * 25) };
}

export function apsCoreActions(workspace: WorkspaceContext) {
  return [
    { module: 'protocolos', domain: 'protocolos', operation: 'executar', title: 'Executar protocolo', href: '/protocolos' },
    { module: 'melhoria', domain: 'melhoria', operation: 'visualizar', title: 'Acompanhar planos e ações', href: '/melhoria?view=actions' },
    { module: 'reunioes', domain: 'reunioes', operation: 'visualizar', title: 'Consultar reuniões', href: '/reunioes' },
  ].filter(a => workspace.enabledModules.includes(a.module) && mayOperate(workspace.permissions, a.domain, a.operation));
}
