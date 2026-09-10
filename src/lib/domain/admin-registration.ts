import { z } from "zod";

export const roleLabels = {
  ADMIN_SISTEMA: "Administrador do sistema", GESTOR_ORGANIZACAO: "Gestor da organização",
  GERENTE_UBS: "Gerente de UBS", RESPONSAVEL_DOMINIO: "Responsável de domínio",
  EXECUTOR: "Executor", AUDITOR: "Auditor", LEITOR: "Leitor",
} as const;
export type AdminRole = keyof typeof roleLabels;
export const domainLabels = { conhecimento: "Conhecimento", protocolos: "Protocolos", indicadores: "Indicadores e metas", melhoria: "Melhoria contínua", reunioes: "Reuniões", administracao: "Administração", 'esf.producao': 'Produção ESF' };
export const operationLabels = { visualizar: "Visualizar", criar: "Criar", editar: "Editar", excluir_logicamente: "Arquivar", aprovar: "Aprovar", publicar: "Publicar", executar: "Executar", encerrar: "Encerrar", reabrir: "Reabrir", exportar: "Exportar" };
export type AdminGrant = { unitId: string | null; role: AdminRole; domains: string[]; operations: string[] };
export function mayDelegate(grant: AdminGrant, unitId: string | null, role: AdminRole, domains: string[], operations: string[]) {
  if (grant.unitId !== null && grant.unitId !== unitId) return false;
  if (!["ADMIN_SISTEMA", "GESTOR_ORGANIZACAO", "GERENTE_UBS"].includes(grant.role)) return false;
  if (!grant.domains.some(d => d === "*" || d === "administracao")) return false;
  if (!grant.operations.includes("criar") && grant.role !== "ADMIN_SISTEMA") return false;
  if (role === "ADMIN_SISTEMA" && grant.role !== "ADMIN_SISTEMA") return false;
  if (grant.role === "GERENTE_UBS" && ["ADMIN_SISTEMA", "GESTOR_ORGANIZACAO", "GERENTE_UBS"].includes(role)) return false;
  if (unitId === null && grant.role === "GERENTE_UBS") return false;
  return domains.length > 0 && operations.length > 0 && domains.every(d => grant.domains.includes("*") || grant.domains.includes(d)) && operations.every(o => grant.role === "ADMIN_SISTEMA" || grant.operations.includes(o));
}
export const inviteSchema = z.object({
  email: z.email().max(254), name: z.string().trim().min(2).max(160), organizationId: z.uuid(), unitId: z.uuid().nullable(),
  role: z.enum(Object.keys(roleLabels) as [AdminRole, ...AdminRole[]]),
  domains: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  operations: z.array(z.enum(Object.keys(operationLabels) as [keyof typeof operationLabels, ...(keyof typeof operationLabels)[]])).min(1).max(10),
});
export const unitSchema = z.object({
  operationId: z.uuid(), organizationId: z.uuid(), name: z.string().trim().min(2).max(160), cnes: z.string().regex(/^\d{7}$/, "Informe os 7 dígitos do CNES."),
  address: z.object({ street: z.string().trim().max(240), city: z.string().trim().max(120), state: z.string().regex(/^$|^[A-Z]{2}$/), postalCode: z.string().regex(/^$|^\d{8}$/) }),
});
export type AdminCatalog = {
  units: { id: string; name: string; cnes: string | null; status: string }[];
  users: { id: string; name: string; email: string; status: string; unitId: string | null; role: AdminRole }[];
  grants: AdminGrant[]; canCreateUnits: boolean; demo?: boolean;
};
