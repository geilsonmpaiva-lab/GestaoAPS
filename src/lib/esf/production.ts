import { z } from 'zod';
import { productionProcedures } from './catalog';

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(v => Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100);
export const dateSchema = z.iso.date().refine(v => Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100);
const base = { operationId: z.uuid(), entityId: z.uuid(), organizationId: z.uuid(), unitId: z.uuid() };
export const teamSchema = z.object({ ...base, name: z.string().trim().min(2).max(160), code: z.string().trim().min(1).max(40), area: z.string().trim().max(160) }).strict();
export const productionSchema = z.object({ ...base, teamId: z.uuid(), occurredOn: dateSchema, expectedVersion: z.number().int().min(0),
  procedureId: z.string().refine(v => productionProcedures.some(p => p.id === v)), quantity: z.number().int().min(0).max(1_000_000),
}).strict();
export const monthlyCommandSchema = z.object({ operationId: z.uuid(), organizationId: z.uuid(), unitId: z.uuid(), teamId: z.uuid(), competency: monthSchema,
  expectedVersion: z.number().int().min(0), action: z.enum(['submit', 'return', 'close', 'reopen']), reason: z.string().trim().max(500).default(''),
}).strict().refine(v => !['return', 'reopen'].includes(v.action) || v.reason.length >= 10, { message: 'Informe uma justificativa com pelo menos 10 caracteres.', path: ['reason'] });
export type EsfTeam = { id: string; name: string; code: string; area: string; status: string };
export type ProductionRecord = { id: string; team_id: string; occurred_on: string; procedure_id: string; quantity: number; version: number };
export const monthlyStatusLabels = { OPEN: 'Em preenchimento', IN_REVIEW: 'Em revisão do gerente', CLOSED: 'Fechado' };
export type MonthlyStatus = keyof typeof monthlyStatusLabels;
export type MonthlyMap = { status: MonthlyStatus; version: number; revision: number; snapshot: { procedureId: string; quantity: number | null }[] | null; closed_at?: string; closed_by?: string };
export type AnnualProduction = { competency: string; procedureId: string; quantity: number }[];
export const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
export function annualProductionRows(annual: AnnualProduction, year: string) {
  return productionProcedures.map(p => {
    const months = monthNames.map((_, i) => annual.find(a => a.procedureId === p.id && a.competency === `${year}-${String(i + 1).padStart(2, '0')}`)?.quantity ?? null);
    const known = months.filter((v): v is number => v !== null);
    return { ...p, months, total: known.length ? known.reduce((a, b) => a + b, 0) : null, partial: known.length < 12 };
  });
}
export type EsfProductionData = { demo: boolean; teams: EsfTeam[]; records: ProductionRecord[]; total: number; summary: { procedureId: string; quantity: number | null }[];
  annual: AnnualProduction; monthly: MonthlyMap | null; canCreate: boolean; canEdit: boolean; canReview: boolean; canClose: boolean; canReopen: boolean; canExport: boolean };
export function consolidateProduction(records: ProductionRecord[], competency: string, teamId?: string) {
  monthSchema.parse(competency);
  return productionProcedures.map(p => {
    const entries = records.filter(r => r.procedure_id === p.id && r.occurred_on.slice(0, 7) === competency && (!teamId || r.team_id === teamId));
    return { procedureId: p.id, quantity: entries.length ? entries.reduce((sum, r) => sum + r.quantity, 0) : null };
  });
}
export function nextMonthlyStatus(status: MonthlyStatus, action: z.infer<typeof monthlyCommandSchema>['action']): MonthlyStatus {
  if (status === 'OPEN' && action === 'submit') return 'IN_REVIEW';
  if (status === 'IN_REVIEW' && action === 'return') return 'OPEN';
  if (status === 'IN_REVIEW' && action === 'close') return 'CLOSED';
  if (status === 'CLOSED' && action === 'reopen') return 'OPEN';
  throw new Error('Transição indisponível nesta situação.');
}
export function localEsfDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
