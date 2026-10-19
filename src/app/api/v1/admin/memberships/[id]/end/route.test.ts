import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), rpc: vi.fn(), demo: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ requireActor: mocks.actor, isDemoMode: mocks.demo, createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/server/workspace", () => ({ loadWorkspaceContext: mocks.workspace }));
import { GET, POST } from "./route";
const organizationId = "362db1a9-bfdd-4334-9436-46b1c0117eab";
const id = "95000000-0000-4000-8000-000000000104";
const context = { params: Promise.resolve({ id }) };
const endpoint = `https://sgc.test/api/v1/admin/memberships/${id}/end`;
const input = { operationId: "95000000-0000-4000-8000-000000000099", expectedFingerprint: "a".repeat(64), expectedEndsAt: null, reason: "[SINTÉTICO] Encerramento solicitado.", deviceId: "95000000-0000-4000-8000-000000000098", localTimestamp: "2026-10-19T10:00:00Z" };
const post = (body: unknown = input, origin = "https://sgc.test") => new Request(endpoint, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SGC_ENVIRONMENT", "staging"); vi.stubEnv("VERCEL_ENV", "preview");
  mocks.actor.mockResolvedValue({ id: "actor" }); mocks.demo.mockReturnValue(false);
  mocks.workspace.mockResolvedValue({ organizationId, uxV3: true, enabledModules: ["administracao"] });
  mocks.rpc.mockResolvedValue({ data: { membershipId: id, status: "ENDED" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("synthetic membership ending boundary", () => {
  it("requires an authenticated actor before any RPC", async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await POST(post(), context)).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("prohibits the production environment, including the synthetic organization", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(post(), context)).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ organizationId: "institution" }, { uxV3: false }, { enabledModules: [] }])("rejects an unavailable context %j", async change => {
    mocks.workspace.mockResolvedValue({ organizationId, uxV3: true, enabledModules: ["administracao"], ...change });
    expect((await GET(new Request(endpoint), context)).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the server's organization and the route ID for a private read-only preview", async () => {
    const response = await GET(new Request(endpoint + "?organizationId=other"), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("staging_end_membership_v1", { p_request: { action: "preview", membershipId: id, organizationId } });
  });
  it("rejects cross-origin commands", async () => {
    expect((await POST(post(input, "https://other.test"), context)).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ organizationId: "other" }, { role: "ADMIN_SISTEMA" }, { reason: "curta" }, { expectedEndsAt: undefined }])("rejects invalid or privilege-changing input %j", async change => {
    expect((await POST(post({ ...input, ...change }), context)).status).toBe(422); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sends each retry through current SQL authorization without a local receipt cache", async () => {
    expect((await POST(post(), context)).status).toBe(200);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Vínculo revogado." } });
    expect((await POST(post(), context)).status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith("staging_end_membership_v1", { p_request: { ...input, action: "end", organizationId, membershipId: id } });
  });
  it("reports version conflicts and missing migration explicitly", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Vínculo alterado." } });
    expect((await POST(post(), context)).status).toBe(409);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect((await GET(new Request(endpoint), context)).status).toBe(503);
  });
});
