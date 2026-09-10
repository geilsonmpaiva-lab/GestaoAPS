import { describe, expect, it } from "vitest";
import { modulePagination, scopePermissions, selectAuthorizedScope } from "./workspace-policy";
describe("authorized workspace preferences", () => {
  const scopes = [{ organizationId: "org1", unitId: "unit1" }, { organizationId: "org1", unitId: "unit2" }];
  it("selects a second authorized UBS", () => expect(selectAuthorizedScope(scopes, JSON.stringify(scopes[1]))).toEqual(scopes[1]));
  it("rejects forged tenant, unit, and organization aggregate preferences", () => {
    for (const preference of [{ organizationId: "other", unitId: "unit1" }, { organizationId: "org1", unitId: "unknown" }, { organizationId: "org1", unitId: null }]) expect(selectAuthorizedScope(scopes, JSON.stringify(preference))).toEqual(scopes[0]);
  });
  it("tolerates invalid cookies and revoked scopes", () => { expect(selectAuthorizedScope(scopes, "invalid")).toEqual(scopes[0]); expect(selectAuthorizedScope([], JSON.stringify(scopes[1]))).toBeUndefined(); });
  it("unions permissions only within selected scope", () => {
    const memberships = [
      { organization_id: "org1", unit_id: null, domains: ["conhecimento"], operations: ["visualizar"] },
      { organization_id: "org1", unit_id: "unit1", domains: ["conhecimento"], operations: ["criar"] },
      { organization_id: "org1", unit_id: "unit2", domains: ["*"], operations: ["*"] },
      { organization_id: "other", unit_id: null, domains: ["*"], operations: ["*"] }
    ];
    expect(scopePermissions(memberships, scopes[0])).toEqual([{ domain: "conhecimento", operations: ["visualizar", "criar"] }]);
    expect(scopePermissions(memberships, { organizationId: "org1", unitId: null })).toEqual([{ domain: "conhecimento", operations: ["visualizar"] }]);
  });
});
describe("module pagination", () => {
  it("reaches records after the former 50 record ceiling", () => {
    const records = Array.from({ length: 61 }, (_, id) => id);
    const loaded = [1, 2, 3].flatMap((page) => { const range = modulePagination(String(page)); return records.slice(range.from, range.to + 1); });
    expect(loaded).toEqual(records);
    expect(new Set(loaded).size).toBe(61);
  });
  it("bounds invalid and negative page requests", () => {
    expect(modulePagination("garbage").page).toBe(1);
    expect(modulePagination("-10").from).toBe(0);
    expect(modulePagination("999999999").page).toBe(100000);
  });
});
