import { describe, expect, it } from 'vitest';
import { checklistFields } from './checklist-presentation';

describe('apresentação dos campos do checklist', () => {
  it('traduz os três formatos e distingue resposta obrigatória de opcional, mantendo a ordem', () => {
    expect(checklistFields({ fields: [
      { key: 'secret_key', label: ' Observação ', type: 'text', required: false },
      { key: 'valor', label: 'Quantidade verificada', type: 'number', required: true },
      { key: 'confere', label: 'Conferência realizada?', type: 'boolean', required: true },
    ] })).toEqual([
      { label: 'Observação', format: 'Texto', requirement: 'Resposta opcional' },
      { label: 'Quantidade verificada', format: 'Número', requirement: 'Resposta obrigatória' },
      { label: 'Conferência realizada?', format: 'Sim ou não', requirement: 'Resposta obrigatória' },
    ]);
  });
  it('não expõe propriedades técnicas nem transforma dados incompletos em aprovação', () => {
    const schema = { fields: [{ key: 'interno', type: 'script', internal: 'não exibir' }, null, { label: 'Legado', required: 'false' }] };
    const before = JSON.stringify(schema);
    expect(checklistFields(schema)).toEqual([
      { label: 'Campo 1', format: 'Formato não reconhecido', requirement: 'Obrigatoriedade não informada' },
      { label: 'Campo 2', format: 'Formato não informado', requirement: 'Obrigatoriedade não informada' },
      { label: 'Legado', format: 'Formato não informado', requirement: 'Obrigatoriedade não informada' },
    ]);
    expect(JSON.stringify(schema)).toBe(before);
    expect(JSON.stringify(checklistFields(schema))).not.toMatch(/interno|script|não exibir/);
  });
  it.each([null, undefined, '', [], {}, { fields: {} }, { fields: [] }])('trata esquema ausente ou inválido: %j', schema => {
    expect(checklistFields(schema)).toEqual([]);
  });
  it('não usa propriedades herdadas como formatos', () => {
    expect(checklistFields({ fields: [{ type: '__proto__' }, { type: 'constructor' }] }).map(field => field.format))
      .toEqual(['Formato não reconhecido', 'Formato não reconhecido']);
  });
});
