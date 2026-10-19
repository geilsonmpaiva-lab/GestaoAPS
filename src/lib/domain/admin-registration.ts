import { z } from "zod";

export const roleLabels = {
  ADMIN_SISTEMA: "Administrador do sistema", GESTOR_ORGANIZACAO: "Gestor da organização",
  GERENTE_UBS: "Gerente de UBS", RESPONSAVEL_DOMINIO: "Responsável de domínio",
  EXECUTOR: "Executor", AUDITOR: "Auditor", LEITOR: "Leitor",
} as const;
export type AdminRole = keyof typeof roleLabels;
export const domainLabels = { conhecimento: "Conhecimento", protocolos: "Protocolos", indicadores: "Indicadores e metas", melhoria: "Melhoria contínua", reunioes: "Reuniões", administracao: "Administração", 'esf.producao': 'Produção ESF' };
export const operationLabels = { visualizar: "Visualizar", criar: "Criar", editar: "Editar", excluir_logicamente: "Arquivar", aprovar: "Aprovar", publicar: "Publicar", executar: "Executar", encerrar: "Encerrar", reabrir: "Reabrir", exportar: "Exportar" };
export const responsibilityLabels: Record<AdminRole, string> = {
  ADMIN_SISTEMA: "Administração do sistema", GESTOR_ORGANIZACAO: "Gestão municipal",
  GERENTE_UBS: "Gerência da UBS", RESPONSAVEL_DOMINIO: "Coordenação de uma área",
  EXECUTOR: "Trabalho da equipe", AUDITOR: "Auditoria", LEITOR: "Consulta",
};
export const responsibilityDescriptions: Record<AdminRole, string> = {
  ADMIN_SISTEMA: "Administra o sistema conforme seus vínculos existentes.",
  GESTOR_ORGANIZACAO: "Acompanha a gestão no território autorizado. Escolha abaixo as áreas e ações.",
  GERENTE_UBS: "Coordena o trabalho da UBS. Nas áreas ESF autorizadas, pode abranger as equipes da unidade.",
  RESPONSAVEL_DOMINIO: "Atua em uma área de trabalho, com as ações que forem selecionadas.",
  EXECUTOR: "Registra e acompanha o trabalho nas unidades e equipes autorizadas.",
  AUDITOR: "Examina registros nas áreas autorizadas. Exportações exigem seleção específica.",
  LEITOR: "Consulta as áreas autorizadas. As ações adicionais devem ser selecionadas explicitamente.",
};
export function isAdminDomainEnabled(domain: string, enabledModules: string[]) {
  return enabledModules.includes(domain === "esf.producao" ? "formularios-esf" : domain);
}
export function adminDomainLabel(domain: string) {
  if (domain === "*") return "Todas as áreas do vínculo";
  return domainLabels[domain as keyof typeof domainLabels] ?? (domain.startsWith("vigilancia.") ? `Vigilância · ${domain.slice(11)}` : domain.startsWith("esf.") ? `Formulários ESF · ${domain.slice(4)}` : domain);
}
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
  users: AdminUserMembership[];
  grants: AdminGrant[]; canCreateUnits: boolean; demo?: boolean;
  membershipDetails?: "available" | "partial" | "unavailable";
  accessLifecycleEnabled?: boolean;
};
export type AdminUserMembership = {
  id: string; userId?: string; name: string; email: string; status: string; unitId: string | null; role: AdminRole;
  domains?: string[]; operations?: string[]; startsAt?: string; endsAt?: string | null;
};
export type AdminPerson = { id: string; name: string; email: string; status: string; memberships: AdminUserMembership[] };
export function groupAdminPeople(memberships: AdminUserMembership[]): AdminPerson[] {
  const people = new Map<string, AdminPerson>();
  for (const membership of memberships) {
    // Identity comes from the authorized database response, never from matching names or e-mails.
    const identity = membership.userId ?? membership.id;
    const person = people.get(identity) ?? { id: identity, name: membership.name, email: membership.email, status: membership.status, memberships: [] };
    person.memberships.push(membership);
    people.set(identity, person);
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
export function inviteAccessPreview(domains: string[], operations: string[]) {
  return domains.map(domain => ({ domain, label: adminDomainLabel(domain), actions: operations.map(operation => operationLabels[operation as keyof typeof operationLabels] ?? operation) }));
}
export function suggestInviteOperations(role: AdminRole, domains: string[], grants: AdminGrant[], unitId: string | null) {
  const suggested: Record<AdminRole, string[]> = {
    ADMIN_SISTEMA: ["visualizar"], GESTOR_ORGANIZACAO: ["visualizar"],
    GERENTE_UBS: ["visualizar", "criar", "editar", "aprovar", "executar", "encerrar", "exportar"],
    RESPONSAVEL_DOMINIO: ["visualizar", "aprovar", "encerrar", "exportar"],
    EXECUTOR: ["visualizar", "criar", "editar", "executar"], AUDITOR: ["visualizar", "exportar"], LEITOR: ["visualizar"],
  };
  if (!domains.length) return ["visualizar"];
  const chosen: string[] = [];
  for (const operation of suggested[role]) {
    if (grants.some(grant => mayDelegate(grant, unitId, role, domains, [...chosen, operation]))) chosen.push(operation);
  }
  return chosen;
}
export const endMembershipSchema = z.object({
  operationId: z.uuid(), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expectedEndsAt: z.iso.datetime({ offset: true }).nullable(), reason: z.string().trim().min(10).max(500),
  deviceId: z.uuid(), localTimestamp: z.iso.datetime({ offset: true }),
}).strict();
export type EndMembershipPreview = {
  membershipId: string; userId: string; unitId: string | null; unitName: string | null;
  role: AdminRole; domains: string[]; operations: string[]; startsAt: string;
  expectedFingerprint: string; expectedEndsAt: string | null;
};
export function mayEndMembership(grants: AdminGrant[], member: AdminUserMembership, actorId: string) {
  const { domains, operations } = member;
  return !!member.userId && member.userId !== actorId && !!domains && !!operations
    && grants.some(grant => mayDelegate(grant, member.unitId, member.role, domains, operations));
}

// These are explicit assignments, not a role-derived effective permission matrix.
// Unknown fields are stripped so this DTO cannot forward clinical payloads.
export const specificAccessSchema = z.object({
  userId: z.uuid(), accountActive: z.boolean(), canManageGrants: z.literal(false),
  teams: z.array(z.object({
    id: z.uuid(), unitId: z.uuid(), unitName: z.string(), teamId: z.uuid(), teamName: z.string(), teamStatus: z.string(),
  })),
  epidemiology: z.array(z.object({
    id: z.uuid(), unitId: z.uuid().nullable(), unitName: z.string().nullable(), teamId: z.uuid().nullable(), teamName: z.string().nullable(),
    areas: z.array(z.string()), enabled: z.boolean(), nominal: z.boolean(), canWrite: z.boolean(), canReview: z.boolean(),
    canValidate: z.boolean(), canClose: z.boolean(), municipal: z.boolean(),
  })),
});
export type SpecificAccess = z.infer<typeof specificAccessSchema>;
export type SpecificAccessResult = { access?: SpecificAccess; error?: string; status?: number };
