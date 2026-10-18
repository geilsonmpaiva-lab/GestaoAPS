import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ requireActor: mocks.actor }));
vi.mock("@/lib/server/workspace", () => ({ loadWorkspaceContext: mocks.workspace, scopeCookie: "sgc-workspace-scope" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
import { POST } from "./route";
const organizationId = "00000000-0000-4000-8000-000000000010";
const unitId = "00000000-0000-4000-8000-000000000011";
const request = (body: unknown, origin = "https://sgc.test") => new Request("https://sgc.test/api/v1/workspace/scope", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
describe("workspace scope selection", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: "user" }); mocks.workspace.mockResolvedValue({ scopes: [{ organizationId, unitId }] }); });
  it("rejects a forged unit and does not set a preference", async () => { const result = await POST(request({ organizationId, unitId: "00000000-0000-4000-8000-000000000099" })); expect(result.status).toBe(403); expect(mocks.set).not.toHaveBeenCalled(); });
  it("does not turn a unit membership into organization scope", async () => { expect((await POST(request({ organizationId, unitId: null }))).status).toBe(403); expect(mocks.set).not.toHaveBeenCalled(); });
  it("requires authentication", async () => { mocks.actor.mockResolvedValue(null); expect((await POST(request({ organizationId, unitId }))).status).toBe(401); });
  it("rejects cross-origin changes", async () => { expect((await POST(request({ organizationId, unitId }, "https://other.test"))).status).toBe(403); expect(mocks.set).not.toHaveBeenCalled(); });
  it("accepts the actual loopback HTTP host when Next reconstructs localhost", async () => {
    const input = new Request("http://localhost:3103/api/v1/workspace/scope", { method: "POST", headers: { host: "127.0.0.1:3103", origin: "http://127.0.0.1:3103", "content-type": "application/json" }, body: JSON.stringify({ organizationId, unitId }) });
    expect((await POST(input)).status).toBe(200);
  });
  it.each(["http://evil.test:3103", "https://127.0.0.1:3103", "http://127.0.0.1:3104"])("rejects a mismatched origin %s even with a Host header", async origin => {
    const input = new Request("http://localhost:3103/api/v1/workspace/scope", { method: "POST", headers: { host: "127.0.0.1:3103", origin, "content-type": "application/json" }, body: JSON.stringify({ organizationId, unitId }) });
    expect((await POST(input)).status).toBe(403);
  });
  it("stores only an authorized scope in a secure httpOnly cookie", async () => { expect((await POST(request({ organizationId, unitId }))).status).toBe(200); expect(mocks.set).toHaveBeenCalledWith("sgc-workspace-scope", JSON.stringify({ organizationId, unitId }), expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax" })); });
});
