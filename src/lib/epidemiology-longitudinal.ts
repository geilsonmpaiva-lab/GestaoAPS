import { z } from 'zod';
import { mapDefinition, type EsfMap, type MapValue } from './esf/maps';
import { buildMapPaper, type PaperScope } from './esf/paper';
import type { EpiMonthReport } from './epidemiology-monthly';

export const longitudinalAreas = ['hanseniase', 'tuberculose'] as const;
export type LongArea = typeof longitudinalAreas[number];
export type LongField = { key: string; label: string; type: 'text' | 'date' | 'integer'; group: string };
const f = (key: string, label: string, group: string, type: LongField['type'] = 'text'): LongField => ({ key, label, group, type });
const identification = [f('caseReference', 'Referência do caso', 'Identificação'), f('name', 'Nome sintético', 'Identificação'), f('notificationDate', 'Data da notificação', 'Identificação', 'date')];
const origin = [f('sinan', 'SINAN da origem — significado pendente', 'Valores preservados da origem'), f('classification', 'Tipo informado na origem — não equivale à classificação operacional', 'Valores preservados da origem'), f('contacts', 'Contatos da origem — não presumir examinados', 'Valores preservados da origem', 'integer')];
export function longitudinalFields(area: LongArea): LongField[] {
  return [...identification, ...(area === 'hanseniase' ? [
    f('notificationNumber', 'Número da notificação confirmado para o formulário', 'Identificação'), f('residenceCity', 'Município de residência', 'Identificação'),
    f('lastAttendance', 'Último comparecimento informado', 'Acompanhamento', 'date'), f('examinedContacts', 'Contatos examinados', 'Acompanhamento', 'integer'),
    f('operationalClassification', 'Classificação operacional informada', 'Acompanhamento'), f('disability', 'Grau de incapacidade física informado', 'Acompanhamento'),
    f('assessmentDate', 'Data da avaliação de incapacidade', 'Acompanhamento', 'date'), f('dischargeType', 'Tipo de alta informado', 'Encerramento'), f('dischargeDate', 'Data da alta', 'Encerramento', 'date'),
  ] : [
    ...Array.from({ length: 6 }, (_, i) => f(`smear${i + 1}`, `Baciloscopia — ${i + 1}º mês de acompanhamento`, 'Exames informados')),
    f('treatmentChangedOn', 'Data de mudança de tratamento', 'Acompanhamento', 'date'), f('examinedContacts', 'Contatos examinados', 'Acompanhamento', 'integer'),
    f('status9', 'Situação no 9º mês de acompanhamento', 'Acompanhamento'), f('status12', 'Situação no 12º mês de acompanhamento', 'Acompanhamento'),
    f('closureStatus', 'Situação de encerramento informada', 'Encerramento'), f('closedOn', 'Data de encerramento', 'Encerramento', 'date'),
    f('sputumCulture', 'Cultura de escarro — resultado informado', 'Exames informados'), f('otherCulture', 'Cultura de outro material — resultado informado', 'Exames informados'),
    f('hiv', 'HIV — resultado informado', 'Exames informados'), f('histopathology', 'Histopatológico — resultado informado', 'Exames informados'), f('observedTreatment', 'TDO informado', 'Acompanhamento'),
  ]), f('followUpDate', 'Data deste acompanhamento', 'Acompanhamento', 'date'), ...origin];
}
export function longitudinalHeaders(area: LongArea): LongField[] {
  return [f('reportDate', 'Data do mapa', 'Cabeçalho', 'date'), f('filledBy', 'Responsável pelo preenchimento', 'Cabeçalho'), ...(area === 'hanseniase' ? [f('regional', 'CRES informada', 'Cabeçalho'), f('municipality', 'Município informado', 'Cabeçalho'), f('technicalOwner', 'Técnico responsável informado', 'Cabeçalho')] : [])];
}
export const longitudinalDoubts = ['SINAN, tipo e contatos da origem são preservados sem conversão semântica automática.', 'Classificações e resultados são transcrições informadas; opções e significado dependem de validação institucional.', 'Os meses 1–6, 9 e 12 são de acompanhamento, não meses do calendário. Nenhum prazo, diagnóstico ou tratamento é calculado.'];
export function longitudinalHref(area: string, month: string, team?: string) {
  return '/vigilancia/acompanhamentos?' + new URLSearchParams({ area, month, ...(team ? { team } : {}) });
}
export const longArea = z.enum(longitudinalAreas);
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const longFilters = z.object({ area: longArea, month, team: z.uuid().optional(), case: z.uuid().optional(), source: z.uuid().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export const longReportFilters = z.object({ area: longArea, month, scope: z.enum(['team', 'unit', 'municipal']).default('unit'), team: z.uuid().optional(), nominal: z.enum(['true', 'false']).default('false').transform(v => v === 'true'), revision: z.coerce.number().int().min(1).optional() }).strict().superRefine((v, ctx) => {
  if (v.scope === 'team' ? !v.team : v.team || v.nominal || v.revision) ctx.addIssue({ code: 'custom', message: 'Relatório nominal e revisão exigem uma equipe.' });
});
export const longCommand = z.object({ action: z.enum(['save', 'submit', 'review', 'validate', 'close', 'return', 'reopen', 'month-close', 'month-reopen']), area: longArea,
  month, teamId: z.uuid(), caseId: z.uuid(), entityId: z.uuid(), sourceId: z.uuid().optional(), operationId: z.uuid(), expectedVersion: z.number().int().min(0), deviceId: z.uuid(), localTimestamp: z.iso.datetime(), synthetic: z.literal(true),
  reason: z.string().trim().max(500).default(''), noActivity: z.boolean().default(false), payload: z.record(z.string(), z.union([z.string().max(1000), z.number().int().min(0).max(1000000)])).default({}), headers: z.record(z.string(), z.string().max(1000)).default({}),
}).strict().superRefine((v, ctx) => {
  if (['return', 'reopen', 'month-reopen'].includes(v.action) && v.reason.length < 10) ctx.addIssue({ code: 'custom', message: 'Justifique a devolução/reabertura.' });
  if (v.action !== 'save') return;
  for (const [values, fields] of [[v.payload, longitudinalFields(v.area)], [v.headers, longitudinalHeaders(v.area)]] as const) for (const [key, value] of Object.entries(values)) {
    const spec = fields.find(f => f.key === key);
    if (!spec || (spec.type === 'integer' ? typeof value !== 'number' : typeof value !== 'string') || spec.type === 'date' && !z.iso.date().safeParse(value).success) ctx.addIssue({ code: 'custom', message: 'Campo inválido.', path: ['payload', key] });
  }
  if (typeof v.payload.name !== 'string' || !v.payload.name.startsWith('[SINTÉTICO]')) ctx.addIssue({ code: 'custom', message: 'Use somente nome sintético identificado.' });
});
export type LongVisit = { id: string; case_id: string; competency: string; version: number; status: string; payload: Record<string, string | number>; headers: Record<string, string>; source_case_id?: string | null };
export type LongCase = { id: string; team_id: string; area: LongArea; initial: Record<string, string | number>; source_case_id?: string | null };
export type LongData = { teams: { id: string; name: string; permissions: Record<string, boolean> }[]; cases: LongCase[]; total: number; sources: { id: string; team_id: string; competency: string; payload: Record<string, string | number> }[]; sourceTotal: number; selected: LongCase | null; visit: LongVisit | null; history: LongVisit[]; revisions: { action: string; createdAt: string; reason: string; snapshot: LongVisit }[]; source: { id: string; team_id: string; payload: Record<string, string | number> } | null };
export type LongReport = Omit<EpiMonthReport, 'teams'> & { teams: (EpiMonthReport['teams'][number] & { headers?: Record<string, string>; headerConflict?: boolean; longitudinalVersion?: number })[] };

/** Projections do not create ESF copies or infer ambiguous clinical mappings. */
export function longitudinalPaper(report: LongReport, scope: PaperScope) {
  if (!report.nominal || report.scope !== 'team' || !longitudinalAreas.includes(report.area as LongArea) || report.teams.length !== 1) throw new Error('Formulário fiel exige relatório nominal autorizado de uma equipe.');
  const area = report.area as LongArea, team = report.teams[0];
  const known = new Set(mapDefinition(area)!.sections[0].fields.map(f => f.key));
  const records = team.records ?? [];
  const rows = records.map(r => {
    const values: Record<string, MapValue> = {};
    for (const [key, value] of Object.entries(r.payload)) if (known.has(key) && key !== 'classification') values[key] = value;
    // Only explicit operationalClassification maps to the paper column.
    if (r.payload.operationalClassification !== undefined) values.classification = r.payload.operationalClassification;
    // Legacy date has a documented notification meaning in these two areas.
    if (!values.notificationDate && typeof r.payload.date === 'string') values.notificationDate = r.payload.date;
    return { id: r.id, values };
  });
  const map: EsfMap = { id: team.teamId, template_id: area, team_id: team.teamId, competency: report.month, version: team.version, revision: team.revision, status: report.definitive ? 'CLOSED' : 'OPEN', payload: { headers: team.headers ?? {}, sections: { records: rows } } };
  const document = buildMapPaper(map, scope);
  if (team.closedAt) document.extras.push({ reference: 'Revisão mensal', label: 'Fechamento / responsável (ID)', value: `${team.closedAt} · ${team.closedBy ?? 'Não informado'}` });
  records.forEach((r, i) => {
    const detail = r as typeof r & { caseId?: string; origin?: string; headers?: Record<string, string> };
    document.extras.push({ reference: `Acompanhamento ${i + 1}`, label: 'Caso / acompanhamento / versão / origem', value: `${detail.caseId ?? r.id} · ${r.id} · v${r.version} · ${r.status} · ${detail.origin ?? 'Registro anterior'}` });
    for (const [key, value] of Object.entries(detail.headers ?? {})) if (team.headers?.[key] !== value) document.extras.push({ reference: `Acompanhamento ${i + 1}`, label: longitudinalHeaders(area).find(f => f.key === key)?.label ?? key, value });
    for (const [key, value] of Object.entries(r.payload)) if (!known.has(key) || key === 'classification') document.extras.push({ reference: `Acompanhamento ${i + 1}`, label: longitudinalFields(area).find(f => f.key === key)?.label ?? key, value: String(value) });
  });
  document.extras.push(...longitudinalDoubts.map(value => ({ reference: 'Interpretação pendente', label: 'Modelo em revisão', value })));
  return document;
}
