import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCatalog } from "@/lib/domain/admin-registration";
import type { WorkspaceContext } from "./workspace";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), demo: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ isDemoMode: mocks.demo, createSupabaseServerClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
import { loadAdminCatalog } from "./admin-registration";

const workspace = { organizationId: "org-a", uxV3: true, enabledModules: ["administracao"] } as WorkspaceContext;
const catalog: AdminCatalog = { units: [], grants: [], canCreateUnits: false, users: [{ id: "membership-a", name: "Pessoa sintética", email: "synthetic@example.invalid", role: "LEITOR", status: "ACTIVE", unitId: "unit-a" }] };
const row = { id: "membership-a", user_id: "person-a", unit_id: "unit-a", role: "LEITOR", domains: ["protocolos"], operations: ["visualizar"], starts_at: "2026-01-01T00:00:00Z", ends_at: null };
function query(rows: unknown[], error: unknown = null) {
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(async () => ({ data: rows, error })) };
  return chain;
}
beforeEach(() => { vi.clearAllMocks(); mocks.demo.mockReturnValue(false); mocks.rpc.mockResolvedValue({ data: structuredClone(catalog), error: null }); });

describe("authorized membership details", () => {
  it("reads only IDs approved by the admin RPC, constrained to the active organization", async () => {
    const chain = query([row, { ...row, id: "unlisted", user_id: "other-person" }]); mocks.from.mockReturnValue(chain);
    const result = await loadAdminCatalog(workspace);
    expect(mocks.rpc).toHaveBeenCalledWith("read_admin_catalog", { p_organization_id: "org-a" });
    expect(mocks.from).toHaveBeenCalledWith("memberships");
    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(chain.in).toHaveBeenCalledWith("id", ["membership-a"]);
    expect(result.catalog?.users).toHaveLength(1);
    expect(result.catalog?.users[0]).toMatchObject({ userId: "person-a", domains: ["protocolos"], operations: ["visualizar"] });
    expect(result.catalog?.membershipDetails).toBe("available");
  });
  it("does not infer missing access from a role when RLS omits a row", async () => {
    mocks.from.mockReturnValue(query([]));
    const result = await loadAdminCatalog(workspace);
    expect(result.catalog?.membershipDetails).toBe("unavailable");
    expect(result.catalog?.users[0].domains).toBeUndefined();
    expect(result.catalog?.users[0].userId).toBeUndefined();
  });
  it("keeps query failures explicit and preserves the authorized catalog", async () => {
    mocks.from.mockReturnValue(query([], { code: "42501" }));
    const result = await loadAdminCatalog(workspace);
    expect(result.catalog?.membershipDetails).toBe("unavailable");
    expect(result.catalog?.users).toEqual(catalog.users);
  });
  it("does not mix a changed scope into the older catalog snapshot", async () => {
    mocks.from.mockReturnValue(query([{ ...row, unit_id: "unit-b" }]));
    expect((await loadAdminCatalog(workspace)).catalog?.membershipDetails).toBe("unavailable");
  });
  it("does not query memberships when the catalog RPC denies access", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await loadAdminCatalog(workspace)).catalog).toBeUndefined();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("preserves the V2 contract without extra reads", async () => {
    expect((await loadAdminCatalog({ ...workspace, uxV3: false })).catalog).toEqual(catalog);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
