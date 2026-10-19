import { z } from 'zod';

export const epiOrganization = '362db1a9-bfdd-4334-9436-46b1c0117eab';
export type EpiField = { key: string; label: string; type?: 'date' | 'integer' | 'select'; options?: string[] };
const field = (key: string, label: string, type?: EpiField['type'], options?: string[]): EpiField => ({ key, label, type, options });
const notification = [field('sinan', 'SINAN — identificador informado (interpretação pendente)'), field('name', 'Nome sintético'), field('date', 'Data da notificação', 'date')];
const death = [field('name', 'Nome sintético'), field('date', 'Data informada do óbito', 'date'), field('age', 'Idade informada', 'integer'), field('ageUnit', 'Unidade da idade', 'select', ['Horas', 'Dias', 'Meses', 'Anos']), field('place', 'Local'), field('cause', 'Causa informada — transcrição, sem classificação automática')];
export const epiAreas: { id: string; title: string; source: string; fields: EpiField[]; pending: string[] }[] = [
  { id: 'hanseniase', title: 'Hanseníase', source: 'HANSENIASE', fields: [...notification, field('classification', 'Tipo informado'), field('contacts', 'Contatos — significado pendente', 'integer')], pending: ['Confirmar se SINAN é número oficial ou controle interno.', 'Definir se contatos são cadastrados, examinados ou outra medida.', 'Classificações ainda não aprovadas.'] },
  { id: 'tuberculose', title: 'Tuberculose', source: 'TUBERCULOS', fields: [...notification, field('classification', 'Tipo informado'), field('contacts', 'Contatos — significado pendente', 'integer')], pending: ['Contatos em branco não equivalem a zero.', 'Validar classificações e significado de SINAN.'] },
  { id: 'sifilis', title: 'Sífilis — classificação em revisão', source: 'SIFILIS', fields: [...notification, field('classification', 'Classificação literal da origem')], pending: ['A coluna de classificação não tem título na origem.', 'A origem mistura sífilis e toxoplasmose. Não reclassificar nem consolidar como sífilis confirmada até revisão técnica.'] },
  { id: 'hiv', title: 'HIV', source: 'HIV', fields: notification, pending: ['A aba vazia não comprova ausência de casos.', 'Confirmar critérios de acompanhamento e significado de SINAN.'] },
  { id: 'obitos-infantis', title: 'Óbitos menores de um ano', source: 'OBITOS MENOR DE UM ANO', fields: [field('sinan', 'Identificador documental — rótulo SINAN em revisão'), ...death], pending: ['Confirmar identificador documental e significado da data.', 'Não classificar automaticamente a idade ou a causa.'] },
  { id: 'obito-materno', title: 'Óbito materno', source: 'OBITO MATERNO', fields: death, pending: ['Validar data de referência, unidades e classificação institucional.'] },
  { id: 'obito-fetal', title: 'Óbito fetal', source: 'OBITO FETAL', fields: [field('name', 'Identificação sintética informada'), field('date', 'Data informada do óbito', 'date'), field('gestationalWeeks', 'Idade gestacional informada (semanas)', 'integer'), field('place', 'Local'), field('cause', 'Causa informada')], pending: ['Confirmar que IDADE representa semanas gestacionais.', 'Semanas não são idade materna. Não calcular automaticamente.'] },
  { id: 'leishmaniose', title: 'Leishmaniose', source: 'LEISHIMANIOSE', fields: [field('name', 'Nome sintético'), field('date', 'Data — evento ainda em validação', 'date'), field('notifyingService', 'Serviço notificante informado'), field('birthDate', 'Data de nascimento', 'date'), field('address', 'Endereço sintético'), field('result', 'Resultado literal informado')], pending: ['NOTIFICAÇÃO parece identificar o serviço, não o número da ficha.', 'Confirmar significado da data e vínculo equipe/UBS. Resultado não gera classificação automática.'] },
  { id: 'dengue', title: 'Dengue', source: 'DENGUE', fields: [field('name', 'Nome sintético'), field('date', 'Data — evento ainda em validação', 'date'), field('address', 'Endereço sintético'), field('sinan', 'SINAN — identificador informado')], pending: ['Confirmar significado da data e de SINAN.', 'A origem não informa equipe/UBS explicitamente. Vínculo deve ser validado.'] },
];
export const epiAreaSchema = z.enum(epiAreas.map(a => a.id) as [string, ...string[]]);
export const epiStates: Record<string, string> = { DRAFT: 'Rascunho', SUBMITTED: 'Enviado à UBS', REVIEWED: 'Revisado pela UBS', VALIDATED: 'Validado pela vigilância', CLOSED: 'Fechado' };
export const epiFilters = z.object({ area: epiAreaSchema.default('hanseniase'), month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), team: z.uuid().optional(), status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'VALIDATED', 'CLOSED']).optional(), page: z.coerce.number().int().min(1).max(100000).default(1), record: z.uuid().optional() }).strict();
export const epiCommand = z.object({ action: z.enum(['save', 'submit', 'review', 'validate', 'close', 'return', 'reopen']), area: epiAreaSchema, teamId: z.uuid(), entityId: z.uuid(), operationId: z.uuid(), expectedVersion: z.number().int().min(0), deviceId: z.uuid(), localTimestamp: z.iso.datetime(), competency: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), synthetic: z.literal(true), reason: z.string().max(500).default(''), payload: z.record(z.string(), z.union([z.string().max(1000), z.number().int().min(0).max(1000000)])).default({}) }).strict().superRefine((value, ctx) => {
  if (value.action !== 'save') return;
  const definition = epiAreas.find(a => a.id === value.area)!;
  for (const [key, entry] of Object.entries(value.payload)) {
    const spec = definition.fields.find(f => f.key === key);
    if (!spec || spec.type === 'integer' && typeof entry !== 'number' || spec?.type !== 'integer' && typeof entry !== 'string' || spec?.type === 'date' && !z.iso.date().safeParse(entry).success || spec?.options && !spec.options.includes(String(entry))) ctx.addIssue({ code: 'custom', message: 'Campo inválido.', path: ['payload', key] });
  }
  if (typeof value.payload.name !== 'string' || !value.payload.name.startsWith('[SINTÉTICO]')) ctx.addIssue({ code: 'custom', message: 'Use nome iniciado por [SINTÉTICO].', path: ['payload', 'name'] });
  if ((value.payload.age !== undefined) !== (value.payload.ageUnit !== undefined)) ctx.addIssue({ code: 'custom', message: 'Informe idade e unidade juntas.' });
});
export type EpiRecord = { id: string; team_id: string; area: string; competency: string; version: number; status: string; payload: Record<string, string | number>; updated_at: string };
export type EpiTeam = { id: string; name: string; permissions: Record<string, boolean> };
export type EpiSummary = { unitId: string; unitName: string; teamId: string; teamName: string; total: number; submitted: number; validated: number; closed: number };
export type EpiData = { teams: EpiTeam[]; municipal: boolean; records: EpiRecord[]; total: number; selected: EpiRecord | null; history: { action: string; created_at: string; version: number; reason: string }[]; unitSummary: EpiSummary[]; municipalSummary: EpiSummary[] };
