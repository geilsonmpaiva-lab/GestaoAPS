import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { longCommand, longFilters, longReportFilters, longitudinalFields, longitudinalPaper, type LongReport } from './epidemiology-longitudinal';

const base = { action: 'save', area: 'hanseniase', month: '2028-02', teamId: randomUUID(), caseId: randomUUID(), entityId: randomUUID(), operationId: randomUUID(), expectedVersion: 0, deviceId: randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true, payload: { name: '[SINTÉTICO] Pessoa', sinan: '00001', contacts: 0 } };
describe('entrada longitudinal restrita', () => {
  it('preserva códigos textuais e zero sem converter os campos ambíguos', () => {
    expect(longCommand.parse(base).payload).toEqual(base.payload);
    const keys = longitudinalFields('hanseniase').map(f => f.key);
    for (const key of ['sinan', 'notificationNumber', 'classification', 'operationalClassification', 'contacts', 'examinedContacts']) expect(keys).toContain(key);
  });
  it('rejeita escopo injetado, nomes reais, datas impossíveis e campos desconhecidos', () => {
    for (const value of [{ ...base, organizationId: randomUUID() }, { ...base, payload: { name: 'Nome real' } }, { ...base, payload: { ...base.payload, notificationDate: '2028-02-31' } }, { ...base, payload: { ...base.payload, arbitrary: 'x' } }, { ...base, payload: { ...base.payload, contacts: -1 } }]) expect(longCommand.safeParse(value).success).toBe(false);
  });
  it('exige justificativa de reabertura e impede consolidados nominais', () => {
    expect(longCommand.safeParse({ ...base, action: 'reopen' }).success).toBe(false);
    expect(longCommand.safeParse({ ...base, action: 'reopen', reason: 'Correção sintética autorizada' }).success).toBe(true);
    expect(longReportFilters.safeParse({ area: 'hanseniase', month: '2028-02', scope: 'municipal', nominal: 'true' }).success).toBe(false);
    expect(longFilters.safeParse({ area: 'hanseniase', month: '2028-13' }).success).toBe(false);
  });
  it('projeta todos os acompanhamentos e conserva ambiguidades no apêndice', () => {
    const records = Array.from({ length: 51 }, (_, i) => ({ id: randomUUID(), version: 1, status: 'VALIDATED', payload: { name: `[SINTÉTICO] Pessoa ${i}`, classification: 'TIPO LEGADO', contacts: 0, notificationNumber: '00001' } }));
    const report: LongReport = { organizationName: 'Sintético', area: 'hanseniase', month: '2028-02', scope: 'team', nominal: true, generatedAt: '', definitive: false, total: 51, teams: [{ teamId: randomUUID(), teamName: 'Equipe', unitId: randomUUID(), unitName: 'UBS', status: 'OPEN', currentStatus: 'OPEN', version: 1, revision: 0, total: 51, pending: 0, counts: {}, noActivity: false, canClose: true, revisions: [], records }] };
    const paper = longitudinalPaper(report, { organization: 'Sintético', unit: 'UBS', team: 'Equipe' });
    expect(paper.pages.length).toBeGreaterThan(1);
    expect(paper.extras.filter(e => e.value === 'TIPO LEGADO')).toHaveLength(51);
    expect(paper.pages.flatMap(p => p.cells).some(c => c.value === '[SINTÉTICO] Pessoa 50')).toBe(true);
    expect(() => longitudinalPaper({ ...report, nominal: false }, paper.scope)).toThrow();
  });
});
