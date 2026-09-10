import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), rpc: vi.fn(), demo: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ requireActor: mocks.actor, isDemoMode: mocks.demo, createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/server/workspace", () => ({ loadWorkspaceContext: mocks.workspace }));
import { POST } from "./route";
const organizationId = "00000000-0000-4000-8000-000000000010";
const input = { organizationId, operationId: "00000000-0000-4000-8000-000000000099", name: "UBS Teste", cnes: "1234567", address: { street:"",city:"",state:"",postalCode:"" } };
const request = (body: unknown, origin = "https://sgc.test") => new Request("https://sgc.test/api/v1/admin/units", { method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body) });
describe("unit registration endpoint", () => {
  beforeEach(() => {vi.clearAllMocks();mocks.actor.mockResolvedValue({id:"actor"});mocks.workspace.mockResolvedValue({organizationId,enabledModules:["administracao"]});mocks.demo.mockReturnValue(false);mocks.rpc.mockResolvedValue({data:{id:"created"},error:null});});
  it("requires authentication",async()=>{mocks.actor.mockResolvedValue(null);expect((await POST(request(input))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();});
  it("rejects cross origin writes",async()=>{expect((await POST(request(input,"https://other.test"))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
  it("rejects another organization",async()=>{expect((await POST(request({...input,organizationId:"00000000-0000-4000-8000-000000000020"}))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
  it("validates CNES before a database mutation",async()=>{expect((await POST(request({...input,cnes:"123"}))).status).toBe(422);expect(mocks.rpc).not.toHaveBeenCalled();});
  it("uses the caller RPC and stable operation id",async()=>{expect((await POST(request(input))).status).toBe(201);expect(mocks.rpc).toHaveBeenCalledWith("register_admin_unit",{p_operation_id:input.operationId,p_input:expect.objectContaining({organizationId,cnes:"1234567"})});});
  it("does not bypass a PostgreSQL denial",async()=>{mocks.rpc.mockResolvedValue({error:{code:"42501",message:"Sem autorização"}});expect((await POST(request(input))).status).toBe(403);});
  it("marks demo writes as nonpersistent without calling the database",async()=>{mocks.demo.mockReturnValue(true);const response=await POST(request(input));expect((await response.json()).mode).toBe("demo");expect(mocks.rpc).not.toHaveBeenCalled();});
});
