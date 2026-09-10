import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { esfTemplates, productionProcedures } from './catalog';
import { annualProductionRows, consolidateProduction, dateSchema, localEsfDate, monthSchema, monthlyCommandSchema, nextMonthlyStatus, productionSchema, teamSchema, type ProductionRecord } from './production';
const uuid = '00000000-0000-4000-8000-000000000001';
const base = { operationId: uuid, entityId: uuid, organizationId: uuid, unitId: uuid };
const record: ProductionRecord = { id: uuid, team_id: uuid, occurred_on: '2026-09-01', procedure_id: 'med-consulta', quantity: 0, version: 1 };
describe('ESF dictionary and production contracts', () => {
  it('maps all ten pages with draft approval and explicit pending issues', () => {
    expect(esfTemplates.map(t => t.page)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    for (const template of esfTemplates) {
      expect(template.approval).toBe('DRAFT'); expect(template.pending.length).toBeGreaterThan(0);
      expect(new Set(template.fields.map(f => f.key)).size).toBe(template.fields.length);
      expect(template.fields.every(f => f.sourceLabel && f.group)).toBe(true);
    }
  });
  it('keeps 25 separate rows even for identical procedure codes', () => {
    expect(productionProcedures).toHaveLength(25);
    expect(new Set(productionProcedures.map(p => p.id)).size).toBe(25);
    expect(productionProcedures.filter(p => p.code === '101010010')).toHaveLength(4);
    const sql = readFileSync('supabase/migrations/202609090033_esf_production.sql', 'utf8');
    for (const p of productionProcedures) expect(sql).toContain(`'${p.id}'`);
  });
  it('does not turn missing production into zero', () => {
    const totals = consolidateProduction([record], '2026-09', uuid);
    expect(totals.find(r => r.procedureId === 'med-consulta')?.quantity).toBe(0);
    expect(totals.find(r => r.procedureId === 'educ-med')?.quantity).toBeNull();
  });
  it('separates team, month and year and sums daily entries', () => {
    const totals = consolidateProduction([{ ...record, quantity: 2 }, { ...record, quantity: 3, occurred_on: '2026-09-02' }, { ...record, quantity: 100, team_id: 'other' }, { ...record, quantity: 200, occurred_on: '2025-09-01' }], '2026-09', uuid);
    expect(totals.find(r => r.procedureId === 'med-consulta')?.quantity).toBe(5);
  });
  it('validates actual dates, leap years and bounded competencies', () => {
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(dateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(monthSchema.safeParse('2026-13').success).toBe(false);
    expect(monthSchema.safeParse('2101-01').success).toBe(false);
    expect(localEsfDate(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09-30');
  });
  it('accepts zero but rejects decimals, negatives, unknown procedures and patient fields', () => {
    const input = { ...base, teamId: uuid, expectedVersion: 0, occurredOn: '2026-09-01', procedureId: 'med-consulta', quantity: 0 };
    expect(productionSchema.safeParse(input).success).toBe(true);
    for (const override of [{ quantity: -1 }, { quantity: 1.5 }, { quantity: '' }, { patientName: 'Must not collect' }, { procedureId: '301010064' }]) expect(productionSchema.safeParse({ ...input, ...override }).success).toBe(false);
  });
  it('accepts non-CNES institutional team codes without numeric conversion', () => {
    expect(teamSchema.parse({ ...base, name: 'Equipe A', code: '001-A', area: '' }).code).toBe('001-A');
  });
  it('enforces review before closure and explicit reopening', () => {
    expect(nextMonthlyStatus('OPEN', 'submit')).toBe('IN_REVIEW');
    expect(nextMonthlyStatus('IN_REVIEW', 'return')).toBe('OPEN');
    expect(nextMonthlyStatus('IN_REVIEW', 'close')).toBe('CLOSED');
    expect(nextMonthlyStatus('CLOSED', 'reopen')).toBe('OPEN');
    expect(() => nextMonthlyStatus('OPEN', 'close')).toThrow();
    expect(() => nextMonthlyStatus('CLOSED', 'submit')).toThrow();
  });
  it('requires a justification for return and reopen', () => {
    const input = { operationId: uuid, organizationId: uuid, unitId: uuid, teamId: uuid, competency: '2026-09', expectedVersion: 2, action: 'reopen', reason: '' };
    expect(monthlyCommandSchema.safeParse(input).success).toBe(false);
    expect(monthlyCommandSchema.safeParse({ ...input, reason: 'Correção aprovada pelo gerente' }).success).toBe(true);
  });
  it('distinguishes partial annual totals and preserves explicit zero months', () => {
    const rows = annualProductionRows([{ competency: '2026-01', procedureId: 'med-consulta', quantity: 0 }, { competency: '2026-09', procedureId: 'med-consulta', quantity: 4 }, { competency: '2025-09', procedureId: 'med-consulta', quantity: 99 }], '2026');
    expect(rows[0].months[0]).toBe(0); expect(rows[0].months[1]).toBeNull(); expect(rows[0].total).toBe(4); expect(rows[0].partial).toBe(true); expect(rows[1].total).toBeNull();
  });
});
