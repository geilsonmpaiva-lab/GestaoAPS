import { z } from 'zod';
import { epiAreaSchema, type EpiRecord } from './epidemiology';

const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const epiReportFilters = z.object({
  area: epiAreaSchema, month, scope: z.enum(['team', 'unit', 'municipal']).default('unit'),
  team: z.uuid().optional(), nominal: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  revision: z.coerce.number().int().min(1).max(100000).optional(),
}).strict().superRefine((v, ctx) => {
  if ((v.scope === 'team' && !v.team) || (v.scope !== 'team' && (v.team || v.nominal || v.revision))) ctx.addIssue({ code: 'custom', message: 'Dados nominais e revisão histórica exigem uma equipe específica.' });
});
export const epiMonthCommand = z.object({
  action: z.enum(['close', 'reopen']), area: epiAreaSchema, month, team: z.uuid(),
  operationId: z.uuid(), expectedVersion: z.number().int().min(0), deviceId: z.uuid(), localTimestamp: z.iso.datetime(),
  synthetic: z.literal(true), noActivity: z.boolean().default(false), reason: z.string().trim().max(500).default(''),
}).strict().superRefine((v, ctx) => {
  if ((v.action === 'reopen' || v.noActivity) && v.reason.length < 10) ctx.addIssue({ code: 'custom', message: 'Justifique com pelo menos 10 caracteres.' });
});
export type EpiMonthTeam = {
  teamId: string; teamName: string; unitId: string; unitName: string;
  status: 'OPEN' | 'CLOSED'; currentStatus: 'OPEN' | 'CLOSED'; version: number; revision: number;
  total: number; pending: number; counts: Record<string, number>; noActivity: boolean; canClose: boolean;
  closedAt?: string; closedBy?: string; reason?: string;
  revisions: { revision: number; closedAt: string; closedBy: string }[];
  records?: Pick<EpiRecord, 'id' | 'version' | 'status' | 'payload'>[];
};
export type EpiMonthReport = { organizationName: string; area: string; month: string; scope: string; nominal: boolean; generatedAt: string; definitive: boolean; total: number; teams: EpiMonthTeam[] };
export function epiCoverage(report: EpiMonthReport) {
  const closed = report.teams.filter(t => t.status === 'CLOSED').length;
  return `${closed} de ${report.teams.length} equipes com revisão fechada no recorte autorizado`;
}
export function epiReportValue(value: unknown): string | number {
  if (typeof value === 'number') return value;
  return value === undefined || value === null || value === '' ? 'Não informado' : String(value);
}
