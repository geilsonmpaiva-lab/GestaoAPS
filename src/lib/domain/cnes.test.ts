import { describe, expect, it } from 'vitest';
import { cnesImportSchema, cnesSearchSchema, normalizeCnesUnit } from './cnes';
const municipality = { code: '230020', name: 'ACARAU', uf: 'CE' as const };
const raw = { codigo_cnes: 808792, nome_fantasia: 'UBS TESTE', codigo_municipio: 230020, codigo_uf: 23, codigo_tipo_unidade: 2, data_atualizacao: '2025-09-03', codigo_cep_estabelecimento: '62580000', endereco_estabelecimento: 'RUA A', numero_estabelecimento: '1' };
describe('CNES contracts', () => {
  it('preserves leading zeroes and only minimum registration fields', () => {
    const row = normalizeCnesUnit({ ...raw, email_estabelecimento: 'not-retained@example.invalid' }, municipality, '2');
    expect(row.cnes).toBe('0808792'); expect(row.address.street).toBe('RUA A, 1');
    expect(JSON.stringify(row)).not.toContain('not-retained'); expect(row.sourceUpdatedAt).toBe('2025-09-03');
  });
  it.each([{ codigo_municipio: 230030 }, { codigo_uf: 35 }, { codigo_tipo_unidade: 5 }, { codigo_cnes: 12345678 }])('rejects inconsistent scope or identification %j', override => {
    expect(() => normalizeCnesUnit({ ...raw, ...override }, municipality, '2')).toThrow();
  });
  it('does not invent a source update date', () => expect(normalizeCnesUnit({ ...raw, data_atualizacao: 'invalid' }, municipality, '2').sourceUpdatedAt).toBeNull());
  it('uses row offsets and enforces UF municipality correspondence', () => {
    expect(cnesSearchSchema.safeParse({ uf: 'CE', municipality: '230020', offset: 20 }).success).toBe(true);
    expect(cnesSearchSchema.safeParse({ uf: 'CE', municipality: '230020', offset: 1 }).success).toBe(false);
    expect(cnesSearchSchema.safeParse({ uf: 'SP', municipality: '230020' }).success).toBe(false);
  });
  it('limits batches and rejects duplicate selection or caller-supplied names', () => {
    const input = { organizationId: '00000000-0000-4000-8000-000000000001', operationId: '00000000-0000-4000-8000-000000000002', uf: 'CE', municipality: '230020', type: '2', selection: ['0808792'] };
    expect(cnesImportSchema.safeParse(input).success).toBe(true);
    expect(cnesImportSchema.safeParse({ ...input, selection: ['0808792', '0808792'] }).success).toBe(false);
    expect(cnesImportSchema.safeParse({ ...input, name: 'Injected' }).success).toBe(false);
    expect(cnesImportSchema.safeParse({ ...input, selection: Array.from({ length: 21 }, (_, i) => String(i).padStart(7, '0')) }).success).toBe(false);
  });
});
