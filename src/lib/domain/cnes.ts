import { z } from 'zod';

export const brazilStates = { AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17' } as const;
export const ufSchema = z.enum(Object.keys(brazilStates) as [keyof typeof brazilStates, ...(keyof typeof brazilStates)[]]);
export const cnesSearchSchema = z.object({ uf: ufSchema, municipality: z.string().regex(/^\d{6}$/), type: z.enum(['1', '2']).default('2'), offset: z.coerce.number().int().min(0).max(1980).multipleOf(20).default(0), cnes: z.string().regex(/^\d{7}$/).optional() }).strict().refine(v => v.municipality.startsWith(brazilStates[v.uf]), { message: 'Município incompatível com a UF.' });
export const cnesImportSchema = z.object({ organizationId: z.uuid(), operationId: z.uuid(), uf: ufSchema, municipality: z.string().regex(/^\d{6}$/), type: z.enum(['1', '2']), selection: z.array(z.string().regex(/^\d{7}$/)).min(1).max(20) }).strict()
  .refine(v => new Set(v.selection).size === v.selection.length, { message: 'Seleção repetida.' })
  .refine(v => v.municipality.startsWith(brazilStates[v.uf]), { message: 'Município incompatível com a UF.' });
export type CnesMunicipality = { code: string; name: string; uf: keyof typeof brazilStates };
export type CnesUnit = { cnes: string; name: string; municipality: string; type: '1' | '2'; sourceUpdatedAt: string | null;
  address: { street: string; city: string; state: string; postalCode: string; neighborhood: string }; alreadyRegistered?: boolean };
export type CnesImportResult = { created: { cnes: string; id: string; name: string }[]; skipped: { cnes: string; id: string; name: string }[]; mode?: 'demo' };

const rawUnit = z.object({
  codigo_cnes: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,7}$/)]),
  nome_fantasia: z.string().trim().min(2).max(160), codigo_municipio: z.union([z.string(), z.number().int()]), codigo_uf: z.union([z.string(), z.number().int()]),
  codigo_tipo_unidade: z.union([z.string(), z.number().int()]),
  endereco_estabelecimento: z.string().nullable().optional(), numero_estabelecimento: z.string().nullable().optional(),
  bairro_estabelecimento: z.string().nullable().optional(), codigo_cep_estabelecimento: z.union([z.string(), z.number().int()]).nullable().optional(),
  data_atualizacao: z.string().nullable().optional(),
});
export function normalizeCnesUnit(value: unknown, municipality: CnesMunicipality, type: '1' | '2'): CnesUnit {
  const raw = rawUnit.parse(value);
  const cnes = String(raw.codigo_cnes).padStart(7, '0');
  if (!/^\d{7}$/.test(cnes) || String(raw.codigo_municipio) !== municipality.code || String(raw.codigo_uf) !== brazilStates[municipality.uf] || String(raw.codigo_tipo_unidade) !== type) throw new Error('A fonte retornou estabelecimento fora do filtro solicitado.');
  const postal = raw.codigo_cep_estabelecimento == null ? '' : String(raw.codigo_cep_estabelecimento).replace(/\D/g, '').padStart(8, '0');
  if (postal && !/^\d{8}$/.test(postal)) throw new Error('CEP inválido na fonte CNES.');
  const street = [raw.endereco_estabelecimento?.trim(), raw.numero_estabelecimento?.trim()].filter(Boolean).join(', ');
  if (street.length > 240 || (raw.bairro_estabelecimento?.length ?? 0) > 160) throw new Error('Endereço acima do limite de cadastro.');
  return { cnes, name: raw.nome_fantasia, municipality: municipality.code, type,
    sourceUpdatedAt: raw.data_atualizacao && z.iso.date().safeParse(raw.data_atualizacao).success ? raw.data_atualizacao : null,
    address: { street, city: municipality.name, state: municipality.uf, postalCode: postal, neighborhood: raw.bairro_estabelecimento?.trim() ?? '' } };
}
