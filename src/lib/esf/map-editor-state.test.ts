import { describe, expect, it } from 'vitest';
import { blankMap, mapDefinition } from './maps';
import { mapPayloadChanged, mapRowTitle } from './map-editor-state';

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

describe('ESF item labels', () => {
  it('identifies the item instead of its document line or date', () => {
    const fields = mapDefinition('medicamentos')!.sections[0].fields;
    expect(mapRowTitle(fields, { sourceLine: '001', occurredOn: '2026-10-01', itemId: 'Item sintético A' }, 1)).toBe('Item sintético A');
    expect(mapRowTitle(fields, { sourceLine: '001', itemId: '00012' }, 1)).toBe('00012');
    expect(mapRowTitle(fields, { itemId: 0 }, 1)).toBe('0');
  });

  it('uses the named identifier from each authorized section', () => {
    const cases = [
      ['frequencia', 'records', 'professionalId'], ['nascidos-vivos', 'records', 'motherName'],
      ['hanseniase', 'records', 'name'], ['insulinas', 'deliveries', 'patientName'],
      ['insulinas', 'supplies', 'item'], ['insulinas', 'insulinStock', 'insulinType'],
    ];
    for (const [form, section, key] of cases) {
      const fields = mapDefinition(form)!.sections.find(s => s.id === section)!.fields;
      expect(mapRowTitle(fields, { [key]: '[SINTÉTICO] Identificação', sourceLine: '049' }, 3)).toBe('[SINTÉTICO] Identificação');
    }
  });

  it('does not expose fields outside the section and distinguishes missingness from identity', () => {
    const fields = mapDefinition('medicamentos')!.sections[0].fields;
    for (const itemId of [null, '', ' ', 'Não informado', 'Não se aplica']) {
      expect(mapRowTitle(fields, { itemId, patientName: '[SINTÉTICO] Campo estranho', attachmentId: 'secret', sourceLine: '049' }, 26)).toBe('Item 26 — identificação pendente');
    }
  });
});
