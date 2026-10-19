import { describe, expect, it } from "vitest";
import { endMembershipSchema, groupAdminPeople, inviteAccessPreview, isAdminDomainEnabled, mayDelegate, mayEndMembership, suggestInviteOperations, type AdminGrant, type AdminUserMembership } from "./admin-registration";

const member: AdminUserMembership = { id: "membership-a", userId: "person-a", name: "Pessoa sintética", email: "synthetic@example.invalid", status: "ACTIVE", unitId: "unit-a", role: "EXECUTOR", domains: ["protocolos"], operations: ["visualizar", "executar"] };

describe("human-readable administration", () => {
  it("maps production's permission domain to the ESF navigation module", () => {
    expect(isAdminDomainEnabled("esf.producao", ["formularios-esf"])).toBe(true);
    expect(isAdminDomainEnabled("esf.producao", ["administracao"])).toBe(false);
    expect(isAdminDomainEnabled("esf.insulinas", ["formularios-esf"])).toBe(false);
    expect(isAdminDomainEnabled("vigilancia.hanseniase", ["vigilancia"])).toBe(false);
  });
  it("shows one identity with distinct unit and role assignments, without merging their capabilities", () => {
    const people = groupAdminPeople([member, { ...member, id: "membership-b", role: "LEITOR", unitId: "unit-b", operations: ["visualizar"] }]);
    expect(people).toHaveLength(1);
    expect(people[0].memberships.map(item => [item.unitId, item.operations])).toEqual([["unit-a", ["visualizar", "executar"]], ["unit-b", ["visualizar"]]]);
  });
  it("never matches people by e-mail/name when authenticated identities differ or cannot be read", () => {
    expect(groupAdminPeople([member, { ...member, id: "membership-b", userId: "person-b" }])).toHaveLength(2);
    expect(groupAdminPeople([{ ...member, userId: undefined }, { ...member, id: "membership-b", userId: undefined }])).toHaveLength(2);
  });
  it("previews exactly the same explicit actions for each selected area", () => {
    expect(inviteAccessPreview(["protocolos", "esf.producao"], ["visualizar", "exportar"])).toEqual([
      { domain: "protocolos", label: "Protocolos", actions: ["Visualizar", "Exportar"] },
      { domain: "esf.producao", label: "Produção ESF", actions: ["Visualizar", "Exportar"] },
    ]);
  });
  it("making the ESF option visible does not grant the inviter delegation rights", () => {
    expect(mayDelegate({ unitId: "unit-a", role: "GERENTE_UBS", domains: ["administracao", "protocolos"], operations: ["criar", "visualizar"] }, "unit-a", "EXECUTOR", ["esf.producao"], ["visualizar"])).toBe(false);
  });
  it("suggests function actions only within one delegable scope and never selects a domain", () => {
    const grants: AdminGrant[] = [{ unitId: "unit-a", role: "GESTOR_ORGANIZACAO", domains: ["administracao", "protocolos"], operations: ["visualizar", "criar", "editar", "executar"] }];
    expect(suggestInviteOperations("EXECUTOR", ["protocolos"], grants, "unit-a")).toEqual(["visualizar", "criar", "editar", "executar"]);
    expect(suggestInviteOperations("GERENTE_UBS", ["protocolos"], grants, "unit-a")).toEqual(["visualizar", "criar", "editar", "executar"]);
    expect(suggestInviteOperations("AUDITOR", ["protocolos"], grants, "unit-a")).toEqual(["visualizar"]);
    expect(suggestInviteOperations("EXECUTOR", ["vigilancia.hanseniase"], grants, "unit-a")).toEqual([]);
    expect(suggestInviteOperations("EXECUTOR", ["protocolos"], grants, "unit-b")).toEqual([]);
  });
  it("does not combine partial inviter grants into a broader invitation", () => {
    const common = { unitId: "unit-a", role: "GESTOR_ORGANIZACAO" as const, domains: ["administracao", "protocolos"] };
    const grants = [{ ...common, operations: ["visualizar", "criar", "editar"] }, { ...common, operations: ["visualizar", "criar", "executar"] }];
    const result = suggestInviteOperations("EXECUTOR", ["protocolos"], grants, "unit-a");
    expect(grants.some(grant => mayDelegate(grant, "unit-a", "EXECUTOR", ["protocolos"], result))).toBe(true);
    expect(result).not.toContain("executar");
  });
  it("allows an end preview only for an identified, delegable other person's membership", () => {
    const grants: AdminGrant[] = [{ unitId: "unit-a", role: "GERENTE_UBS", domains: ["administracao", "protocolos"], operations: ["visualizar", "criar", "executar"] }];
    expect(mayEndMembership(grants, member, "other-actor")).toBe(true);
    expect(mayEndMembership(grants, member, "person-a")).toBe(false);
    expect(mayEndMembership(grants, { ...member, unitId: "unit-b" }, "other-actor")).toBe(false);
    expect(mayEndMembership(grants, { ...member, userId: undefined }, "other-actor")).toBe(false);
  });
  it("requires exact end-command metadata and a meaningful justification", () => {
    const input = { operationId: "95000000-0000-4000-8000-000000000001", expectedFingerprint: "a".repeat(64), expectedEndsAt: null, reason: "Encerrar vínculo de teste.", deviceId: "95000000-0000-4000-8000-000000000002", localTimestamp: "2026-10-19T10:00:00Z" };
    expect(endMembershipSchema.safeParse(input).success).toBe(true);
    expect(endMembershipSchema.safeParse({ ...input, organizationId: "other" }).success).toBe(false);
    expect(endMembershipSchema.safeParse({ ...input, expectedEndsAt: undefined }).success).toBe(false);
    expect(endMembershipSchema.safeParse({ ...input, reason: "curta" }).success).toBe(false);
  });
});
