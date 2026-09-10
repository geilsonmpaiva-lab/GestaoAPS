import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), demo: vi.fn(), workspace: vi.fn(), from: vi.fn(), rpc: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/modules", () => ({ modules: {} }));
vi.mock("@/lib/server/supabase", () => ({ requireActor: mocks.actor, isDemoMode: mocks.demo, createSupabaseServerClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/lib/server/workspace", () => ({ loadWorkspaceContext: mocks.workspace }));
import { GET, POST } from "./route";
const org = "00000000-0000-4000-8000-000000000010";
const otherOrg = "00000000-0000-4000-8000-000000000020";
const unitA = "00000000-0000-4000-8000-000000000011";
const unitB = "00000000-0000-4000-8000-000000000012";
const actorId = "00000000-0000-4000-8000-000000000001";
type Row = Record<string, unknown>;
function query(data: Row[]) {
  let rows = [...data]; let start = 0; let end = Infinity;
  const chain = { select: () => chain, range: (from: number, to: number) => { start = from; end = to; return chain; }, eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return chain; }, insert: (payload: unknown) => { mocks.insert(payload); return chain; }, single: async () => ({ data: rows[0] ?? { id: "new-record" }, error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows.slice(start, end + 1), count: rows.length, error: null }).then(resolve) };
  return chain;
}
const context = (resource: string) => ({ params: Promise.resolve({ resource }) });
const getRequest = (resource: string, search = "") => new NextRequest(`https://sgc.test/api/v1/${resource}${search}`);
const postRequest = (resource: string, body: unknown) => new NextRequest(`https://sgc.test/api/v1/${resource}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const workspace = { organizationId: org, unitId: unitA, userId: actorId, enabledModules: ["conhecimento", "administracao"], scopes: [{ organizationId: org, unitId: null }, { organizationId: org, unitId: unitA }, { organizationId: org, unitId: unitB }] };
const knowledge = { organizationId: org, unitId: unitA, title: "Documento institucional", type: "MANUAL", domain: "QUALIDADE" };
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: actorId }); mocks.demo.mockReturnValue(false); mocks.workspace.mockResolvedValue(workspace); mocks.from.mockImplementation(() => query([])); mocks.rpc.mockResolvedValue({ data: { id: "created-id" }, error: null }); });
describe("generic API scope and gates", () => {
  it("rejects reads and writes when the module is disabled", async () => {
    expect((await GET(getRequest("meetings"), context("meetings"))).status).toBe(403);
    expect((await POST(postRequest("meetings", { organizationId: org, unitId: unitA, title: "Reunião da equipe", startsAt: "2026-09-09T15:00:00Z" }), context("meetings"))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects a different unit or tenant even if the actor has multiple scopes", async () => {
    expect((await GET(getRequest("knowledge", `?unitId=${unitB}`), context("knowledge"))).status).toBe(403);
    expect((await GET(getRequest("knowledge", `?organizationId=${otherOrg}`), context("knowledge"))).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("defaults reads to the selected organization and UBS", async () => {
    mocks.from.mockImplementation(() => query([{ id: "a", organization_id: org, unit_id: unitA }, { id: "b", organization_id: org, unit_id: unitB }, { id: "foreign", organization_id: otherOrg, unit_id: unitA }]));
    const result = await GET(getRequest("knowledge"), context("knowledge"));
    expect((await result.json()).data.map((row: Row) => row.id)).toEqual(["a"]);
  });
  it("uses organization id and unit id fields without nonexistent unit_id filters", async () => {
    mocks.from.mockImplementation((table: string) => query(table === "organizations" ? [{ id: org }, { id: otherOrg }] : [{ id: unitA, organization_id: org }, { id: unitB, organization_id: org }]));
    expect((await (await GET(getRequest("organizations"), context("organizations"))).json()).data).toEqual([{ id: org }]);
    expect((await (await GET(getRequest("units"), context("units"))).json()).data).toEqual([{ id: unitA, organization_id: org }]);
  });
  it("limits notifications to the actor even when RLS permits admin-wide reads", async () => {
    mocks.from.mockImplementation(() => query([{ id: "own", organization_id: org, unit_id: unitA, user_id: actorId }, { id: "other", organization_id: org, unit_id: unitA, user_id: "colleague" }]));
    expect((await (await GET(getRequest("notifications"), context("notifications"))).json()).data.map((row: Row) => row.id)).toEqual(["own"]);
  });
  it("rejects cross-unit and organization-wide writes from selected UBS", async () => {
    for (const scope of [{ organizationId: org, unitId: unitB }, { organizationId: org, unitId: null }, { organizationId: otherOrg, unitId: unitA }]) expect((await POST(postRequest("knowledge", { ...knowledge, ...scope }), context("knowledge"))).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("permits aggregate creation only into explicitly authorized scopes", async () => {
    mocks.workspace.mockResolvedValue({ ...workspace, unitId: null });
    const operationId = "00000000-0000-4000-8000-000000000099";
    expect((await POST(postRequest("knowledge", { ...knowledge, unitId: unitB, operationId }), context("knowledge"))).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("create_mvp_record", expect.objectContaining({ p_operation_id: operationId, p_input: expect.objectContaining({ organizationId: org, unitId: unitB }) }));
    expect((await POST(postRequest("knowledge", { ...knowledge, unitId: "00000000-0000-4000-8000-000000000098" }), context("knowledge"))).status).toBe(403);
  });
  it("preserves demo without requiring hosted workspace metadata", async () => {
    mocks.demo.mockReturnValue(true);
    expect((await POST(postRequest("knowledge", knowledge), context("knowledge"))).status).toBe(201);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("rejects malformed pagination before any query", async () => { expect((await GET(getRequest("knowledge", "?page=NaN"), context("knowledge"))).status).toBe(422); expect(mocks.from).not.toHaveBeenCalled(); });
  it("requires authentication", async () => { mocks.actor.mockResolvedValue(null); expect((await GET(getRequest("knowledge"), context("knowledge"))).status).toBe(401); expect((await POST(postRequest("knowledge", knowledge), context("knowledge"))).status).toBe(401); });
});
