import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), rpc: vi.fn(), demo: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ requireActor: mocks.actor, isDemoMode: mocks.demo, createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/server/workspace", () => ({ loadWorkspaceContext: mocks.workspace }));
import { GET } from "./route";
const organizationId = "362db1a9-bfdd-4334-9436-46b1c0117eab";
const id = "95000000-0000-4000-8000-000000000004";
const context = { params: Promise.resolve({ id }) };
const request = new Request(`https://sgc.test/api/v1/admin/users/${id}/access?organizationId=other`);
const grant = { id: "95000000-0000-4000-8000-000000000201", unitId: "95000000-0000-4000-8000-000000000011", unitName: "[SINTÉTICO] UBS A", teamId: null, teamName: null, areas: ["hanseniase"], enabled: true, nominal: false, canWrite: false, canReview: false, canValidate: false, canClose: false, municipal: false };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SGC_ENVIRONMENT", "staging"); vi.stubEnv("VERCEL_ENV", "preview");
  mocks.actor.mockResolvedValue({ id: "actor" }); mocks.demo.mockReturnValue(false);
  mocks.workspace.mockResolvedValue({ organizationId, uxV3: true, enabledModules: ["administracao"] });
  mocks.rpc.mockResolvedValue({ data: { userId: id, accountActive: true, canManageGrants: false, teams: [], epidemiology: [grant] }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("explicit access metadata boundary", () => {
  it("requires authentication and validates the person ID before loading access", async () => {
    mocks.actor.mockResolvedValue(null); expect((await GET(request, context)).status).toBe(401);
    mocks.actor.mockResolvedValue({ id: "actor" }); expect((await GET(request, { params: Promise.resolve({ id: "invalid" }) })).status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not run in production, demonstration, or an institutional organization", async () => {
    vi.stubEnv("VERCEL_ENV", "production"); expect((await GET(request, context)).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "preview"); mocks.demo.mockReturnValue(true); expect((await GET(request, context)).status).toBe(403);
    mocks.demo.mockReturnValue(false); mocks.workspace.mockResolvedValue({ organizationId: "institution", uxV3: true, enabledModules: ["administracao"] });
    expect((await GET(request, context)).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses server scope, preserves false grants, and never returns extra clinical fields", async () => {
    mocks.rpc.mockResolvedValue({ data: { userId: id, accountActive: true, canManageGrants: false, teams: [], epidemiology: [{ ...grant, patients: ["not permitted"] }], payload: { name: "not permitted" } }, error: null });
    const response = await GET(request, context); const body = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("staging_read_aps_access_v1", { p_request: { userId: id, organizationId } });
    expect(body.epidemiology).toEqual([grant]); expect(body.canManageGrants).toBe(false); expect(body.payload).toBeUndefined();
  });
  it("delegates every read to current database authorization and exposes denial", async () => {
    expect((await GET(request, context)).status).toBe(200);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await GET(request, context)).status).toBe(403); expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it.each([{ userId: "95000000-0000-4000-8000-000000000005" }, { canManageGrants: true }, { epidemiology: [{ ...grant, nominal: undefined }] }])("rejects unverifiable metadata %j", async change => {
    mocks.rpc.mockResolvedValue({ data: { userId: id, accountActive: true, canManageGrants: false, teams: [], epidemiology: [grant], ...change }, error: null });
    expect((await GET(request, context)).status).toBe(503);
  });
  it("does not present missing migrations or network failure as empty grants", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    let response = await GET(request, context); expect(response.status).toBe(503); expect((await response.json()).error).toBeTruthy();
    mocks.rpc.mockRejectedValue(new Error("network")); response = await GET(request, context);
    expect(response.status).toBe(503); expect((await response.json()).error).toContain("conexão");
  });
});
