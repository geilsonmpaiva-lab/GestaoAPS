import { describe, expect, it } from "vitest";
import { canAccess, type AccessContext } from "./rbac";

const manager: AccessContext = {
  role: "GERENTE_UBS", organizationId: "org-a", unitIds: ["ubs-a"], domains: ["protocolos", "melhoria"], operations: ["visualizar", "criar", "editar", "executar"]
};

describe("RBAC scope", () => {
  it("allows an authorized operation in the linked UBS", () => {
    expect(canAccess(manager, { organizationId: "org-a", unitId: "ubs-a", domain: "protocolos" }, "executar")).toBe(true);
  });

  it("denies cross-unit and cross-organization access", () => {
    expect(canAccess(manager, { organizationId: "org-a", unitId: "ubs-b", domain: "protocolos" }, "visualizar")).toBe(false);
    expect(canAccess(manager, { organizationId: "org-b", unitId: "ubs-a", domain: "protocolos" }, "visualizar")).toBe(false);
  });

  it("denies operations and domains not granted", () => {
    expect(canAccess(manager, { organizationId: "org-a", unitId: "ubs-a", domain: "ouvidoria" }, "visualizar")).toBe(false);
    expect(canAccess(manager, { organizationId: "org-a", unitId: "ubs-a", domain: "protocolos" }, "publicar")).toBe(false);
  });
});
