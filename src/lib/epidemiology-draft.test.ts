import { describe, expect, it } from 'vitest';
import { readEpidemiologyDraft, type EpidemiologyDraftContext } from './epidemiology-draft';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const expected: EpidemiologyDraftContext = { userId: id(1), organizationId: id(2), unitId: id(3), teamId: id(4), area: 'hanseniase', competency: '2026-10', entityId: id(5), expectedVersion: 2 };
const saved = { ...expected, entityId: id(5), expectedVersion: '2', payload: JSON.stringify({ name: '[SINTÉTICO] Pessoa', sinan: '00001', contacts: 0 }), pending: '', reason: '' };
describe('rascunhos cifrados da Vigilância', () => {
  it('recupera zero e código textual sem gerar um comando', () => {
    expect(readEpidemiologyDraft(saved, expected)).toMatchObject({ versionMatches: true, payload: { contacts: 0, sinan: '00001' }, pending: null });
  });
  it('aceita rascunho incompleto, ainda não apto para envio', () => {
    expect(readEpidemiologyDraft({ ...saved, payload: '{}' }, expected).payload).toEqual({});
  });
  it('recusa outra conta, organização, UBS, equipe, assunto, mês ou registro', () => {
    for (const key of ['userId', 'organizationId', 'unitId', 'teamId', 'entityId'] as const) expect(() => readEpidemiologyDraft({ ...saved, [key]: id(99) }, expected)).toThrow('outro registro ou contexto');
    expect(() => readEpidemiologyDraft({ ...saved, area: 'tuberculose' }, expected)).toThrow('outro registro ou contexto');
    expect(() => readEpidemiologyDraft({ ...saved, competency: '2026-11' }, expected)).toThrow('outro registro ou contexto');
  });
  it('separa versão divergente para comparação, sem autorizar aplicação', () => {
    const result = readEpidemiologyDraft({ ...saved, expectedVersion: '1' }, expected);
    expect(result.versionMatches).toBe(false); expect(result.payload.contacts).toBe(0);
  });
  it('preserva UUID e operação de ficha nova após uma resposta perdida', () => {
    const command = { action: 'save', area: saved.area, competency: saved.competency, teamId: saved.teamId, entityId: saved.entityId, expectedVersion: 0, operationId: id(6), deviceId: id(7), localTimestamp: '2026-10-19T15:00:00.000Z', synthetic: true, payload: JSON.parse(saved.payload), reason: '' };
    const pending = { action: 'save', body: JSON.stringify(command) };
    const result = readEpidemiologyDraft({ ...saved, expectedVersion: '0', pending: JSON.stringify(pending) }, { ...expected, entityId: null, expectedVersion: 0 });
    expect(result).toMatchObject({ entityId: id(5), versionMatches: true, pending });
    expect(() => readEpidemiologyDraft({ ...saved, expectedVersion: '0', pending: JSON.stringify({ ...pending, body: JSON.stringify({ ...command, teamId: id(99) }) }) }, { ...expected, entityId: null, expectedVersion: 0 })).toThrow('validar');
  });
  it('recusa campos desconhecidos e quantidades inválidas preservando a cópia', () => {
    for (const payload of [{ unknown: 'x' }, { contacts: -1 }, { contacts: '0' }, { date: 'ontem' }]) expect(() => readEpidemiologyDraft({ ...saved, payload: JSON.stringify(payload) }, expected)).toThrow('cópia cifrada foi preservada');
  });
});
