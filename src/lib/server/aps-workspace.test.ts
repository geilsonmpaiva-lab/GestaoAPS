import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { apsFilters, apsWorkItems, apsWorkPage, type ApsWorkspace } from './aps-workspace';
import type { EpiMonthTeam } from '@/lib/epidemiology-monthly';

function fixture(): ApsWorkspace {
  const team: EpiMonthTeam = { teamId: 'a', teamName: 'Equipe A', unitId: 'unit-a', unitName: 'UBS A', status: 'OPEN', currentStatus: 'OPEN', version: 1, revision: 0, total: 51, pending: 2, counts: { SUBMITTED: 2 }, noActivity: false, canClose: true, revisions: [], records: [{ id: 'secret', version: 1, status: 'DRAFT', payload: { name: 'NOME RESTRITO' } }] };
  return { month: '2026-10', updatedAt: '', errors: [], availableAreas: [], production: { enabled: false, data: null, reason: '' }, areas: [{ id: 'hanseniase', title: 'Hanseníase', municipal: false, teams: [{ id: 'a', name: 'Equipe A', view: true, write: true, review: true, validate: false, close: false }], report: { organizationName: '', area: 'hanseniase', month: '2026-10', scope: 'unit', nominal: false, generatedAt: '', definitive: false, total: 51, teams: [team, { ...team, teamId: 'b', teamName: 'Outra equipe' }] } }] };
}
describe('authorized work items', () => {
  it('routes longitudinal cases to the single entry without exposing names', () => {
    const data = fixture(); data.longitudinal = true;
    expect(apsWorkItems(data)[0].href).toBe('/vigilancia/acompanhamentos?area=hanseniase&month=2026-10&team=a');
  });
  it('paginates more than fifty authorized deliveries without losing the filtered total', () => {
    const data = fixture();
    const source = data.areas[0].report!.teams[0];
    data.areas[0].teams = Array.from({ length: 53 }, (_, i) => ({ ...data.areas[0].teams[0], id: `team-${i}` }));
    data.areas[0].report!.teams = data.areas[0].teams.map((t, i) => ({ ...source, teamId: t.id, teamName: `Equipe ${String(i).padStart(2, '0')}` }));
    const first = apsWorkPage(data, { page: 1, search: 'HANSENIASE', status: 'Com pendências' });
    const second = apsWorkPage(data, { page: 2, search: 'HANSENIASE', status: 'Com pendências' });
    const third = apsWorkPage(data, { page: 3, search: 'HANSENIASE', status: 'Com pendências' });
    expect(first.total).toBe(53);
    expect([first.items.length, second.items.length, third.items.length]).toEqual([25, 25, 3]);
    expect(new Set([...first.items, ...second.items, ...third.items].map(i => i.id)).size).toBe(53);
    expect(apsWorkPage(data, { page: 1, search: '', status: 'Fechado' }).total).toBe(0);
  });
  it('uses full monthly totals, scopes each team and excludes all nominal payloads', () => {
    const items = apsWorkItems(fixture());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ total: 51, pending: 2, nextAction: 'Revisar envios' });
    expect(items[0].href).toContain('status=SUBMITTED');
    expect(JSON.stringify(items)).not.toContain('NOME RESTRITO');
    expect(JSON.stringify(items)).not.toContain('Outra equipe');
  });
  it('preserves no declaration versus zero and never proposes closing without permission', () => {
    const data = fixture(); const team = data.areas[0].report!.teams[0];
    Object.assign(team, { total: 0, pending: 0, counts: {} });
    const [item] = apsWorkItems(data);
    expect(item.status).toBe('Sem declaração');
    expect(item.nextAction).toBe('Preencher registros');
    Object.assign(data.areas[0].teams[0], { write: false, review: false, validate: false, close: false });
    expect(apsWorkItems(data)[0].nextAction).toBe('Consultar consolidado');
  });
  it('opens a closed revision without offering a new write', () => {
    const data = fixture(); data.areas[0].report!.teams[0].status = 'CLOSED';
    expect(apsWorkItems(data)[0]).toMatchObject({ status: 'Fechado', nextAction: 'Consultar relatório' });
    expect(apsWorkItems(data)[0].href).toContain('view=monthly');
  });
  it('rejects scope injection and invalid dates/areas', () => {
    expect(apsFilters.safeParse({ organizationId: 'other' }).success).toBe(false);
    expect(apsFilters.safeParse({ month: '2026-13' }).success).toBe(false);
    expect(apsFilters.safeParse({ area: 'unrestricted' }).success).toBe(false);
  });
});
