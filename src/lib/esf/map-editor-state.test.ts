import { describe, expect, it } from 'vitest';
import { blankMap } from './maps';
import { mapPayloadChanged } from './map-editor-state';

describe('ESF local edit tracking', () => {
  it('restores the clean state after an unwanted optional header is cleared', () => {
    const original = blankMap('medicamentos', '[SINTÉTICO] Responsável');
    const current = structuredClone(original);
    current.headers.managerId = 'conta@sgc-ubs.test';
    expect(mapPayloadChanged(original, current)).toBe(true);
    current.headers.managerId = '';
    expect(mapPayloadChanged(original, current)).toBe(false);
    current.headers.managerId = null;
    expect(mapPayloadChanged(original, current)).toBe(false);
  });
  it('preserves zero, explicit missingness, spaces and intentional edits', () => {
    const original = blankMap('medicamentos');
    for (const value of [0, 'Não informado', 'Não se aplica', ' ']) {
      expect(mapPayloadChanged(original, { ...original, headers: { ...original.headers, managerId: value } })).toBe(true);
    }
  });
  it('ignores header key order but never erases a saved value or added row', () => {
    const original = blankMap('medicamentos', '[SINTÉTICO] Responsável');
    original.headers.managerId = '[SINTÉTICO] Gerente';
    expect(mapPayloadChanged(original, { ...original, headers: Object.fromEntries(Object.entries(original.headers).reverse()) })).toBe(false);
    expect(mapPayloadChanged(original, { ...original, headers: { ...original.headers, managerId: '' } })).toBe(true);
    const current = structuredClone(original);
    current.sections.records.push({ id: 'synthetic-local-row', values: { previousBalance: 0 } });
    expect(mapPayloadChanged(original, current)).toBe(true);
    expect(original.sections.records).toHaveLength(0);
  });
});
