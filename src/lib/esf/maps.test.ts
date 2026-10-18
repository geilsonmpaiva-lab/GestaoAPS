import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { blankMap, calculatedRow, displayMapValue, mapDefinition, mapIds, sumKnown, validateMap } from './maps';
import { esfReferenceItems } from './reference-items';
const envelope = (templateId = 'medicamentos', values: Record<string, string | number | null> = {}) => ({
  operationId: randomUUID(), entityId: randomUUID(), expectedVersion: 0, deviceId: randomUUID(), localTimestamp: new Date().toISOString(),
  templateId, competency: '2028-01', teamId: randomUUID(), action: 'save', synthetic: true, payload: { headers: {}, sections: { records: [{ id: randomUUID(), values }] } },
});
describe('reviewed ESF maps', () => {
  it('defines nine typed maps without enabling production catalogs', () => {
    expect(mapIds).toHaveLength(9);
    for (const id of mapIds) { const d = mapDefinition(id)!; expect(d.template.approval).toBe('DRAFT'); expect(Object.keys(blankMap(id).sections)).toEqual(d.sections.map(s => s.id)); }
  });
  it('preserves the documented 30 medications, 40 materials and 5 kits without inventing materials 1–48', () => {
    expect(esfReferenceItems.medicamentos).toHaveLength(30); expect(esfReferenceItems.materiais).toHaveLength(40); expect(esfReferenceItems['testes-rapidos']).toHaveLength(5);
    expect(esfReferenceItems.materiais[0].line).toBe('49'); expect(esfReferenceItems.materiais.at(-1)?.line).toBe('88');
  });
  it('calculates entries, exits, balance and demand independently of resupply authorization', () => {
    expect(calculatedRow('medicamentos', 'records', { previousBalance: 10, pharmacyEntry: 4, otherEntry: 1, dispensed: 2, transferred: 1, losses: 1, served: 2, unserved: 3, authorized: 999 })).toMatchObject({ entryTotal: 5, exitTotal: 4, currentBalance: 11, totalDemand: 5 });
    expect(calculatedRow('testes-rapidos', 'records', { previousBalance: 12, entry: 3, pregnancyUse: 2, otherUse: 1, losses: 1, resupply: 999 }).currentBalance).toBe(11);
  });
  it('never replaces missing or non-applicable amounts with zero', () => {
    expect(sumKnown([0, 0])).toBe(0); expect(sumKnown([0, null])).toBeNull(); expect(sumKnown([1, 'Não se aplica'])).toBeNull();
    expect(calculatedRow('materiais', 'records', { previousBalance: 10, entry: 1 }).currentBalance).toBeNull(); expect(displayMapValue(0)).toBe('0');
  });
  it('does not calculate doses or combine different presentations', () => {
    const row = { nphUnits: 10, regularUnits: 5, nphVialsDelivered: 1, nphPensDelivered: 2 };
    expect(calculatedRow('insulinas', 'deliveries', row)).toEqual(row);
  });
  it('rejects forged calculations, unknown fields, fractional tests and real nominal names', () => {
    expect(() => validateMap(envelope('materiais', { currentBalance: 5 }))).toThrow(); expect(() => validateMap(envelope('medicamentos', { fake: 1 }))).toThrow();
    expect(() => validateMap(envelope('testes-rapidos', { entry: 1.5 }))).toThrow(); expect(() => validateMap(envelope('hanseniase', { name: 'Pessoa real' }))).toThrow(/SINTÉTICO/);
  });
  it('supports adult birth dates, validates actual dates and separates occurrence from competency', () => {
    expect(() => validateMap(envelope('obitos', { name: '[SINTÉTICO] Pessoa', birthDate: '1950-01-01', deathDate: '2028-01-02' }))).not.toThrow();
    expect(() => validateMap(envelope('obitos', { deathDate: '2028-02-30' }))).toThrow(); expect(() => validateMap(envelope('materiais', { occurredOn: '2028-02-01' }))).toThrow();
    expect(() => validateMap(envelope('materiais', { occurredOn: 'Não se aplica' }))).not.toThrow();
  });
  it('validates alternate age, explicit weight unit and zero', () => {
    expect(() => validateMap(envelope('obitos', { birthDate: '1950-01-01', age: 78, ageUnit: 'Anos' }))).toThrow();
    expect(() => validateMap(envelope('obitos', { age: 0 }))).toThrow(); expect(() => validateMap(envelope('nascidos-vivos', { weight: 0 }))).toThrow();
    expect(() => validateMap(envelope('nascidos-vivos', { weight: 3000, weightUnit: 'g' }))).not.toThrow();
  });
  it('requires identity for submission and justification for reopening', () => {
    expect(() => validateMap({ ...envelope(), action: 'submit' })).toThrow(/Identifique/);
    expect(() => validateMap({ ...envelope(), action: 'reopen', reason: 'curta' })).toThrow(/Justificativa/);
  });
});
