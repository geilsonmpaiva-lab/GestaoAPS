export const roles = ["ADMIN_SISTEMA", "GESTOR_ORGANIZACAO", "GERENTE_UBS", "RESPONSAVEL_DOMINIO", "EXECUTOR", "AUDITOR", "LEITOR"] as const;
export const operations = ["visualizar", "criar", "editar", "excluir_logicamente", "aprovar", "publicar", "executar", "encerrar", "reabrir", "exportar"] as const;

export type Role = (typeof roles)[number];
export type Operation = (typeof operations)[number];

export type AccessContext = {
  role: Role;
  organizationId: string;
  unitIds: string[];
  domains: string[];
  operations: Operation[];
};

export type ResourceScope = {
  organizationId: string;
  unitId: string | null;
  domain: string;
};

export function canAccess(context: AccessContext, resource: ResourceScope, operation: Operation): boolean {
  if (context.organizationId !== resource.organizationId) return false;
  if (resource.unitId && !context.unitIds.includes(resource.unitId) && context.role !== "GESTOR_ORGANIZACAO" && context.role !== "ADMIN_SISTEMA") return false;
  if (!context.domains.includes("*") && !context.domains.includes(resource.domain)) return false;
  return context.operations.includes(operation);
}
