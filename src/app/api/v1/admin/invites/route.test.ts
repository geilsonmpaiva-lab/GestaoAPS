import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), catalog: vi.fn(), rpc: vi.fn(), invite: vi.fn(), demo: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ requireActor:mocks.actor,isDemoMode:mocks.demo,createSupabaseServerClient:async()=>({rpc:mocks.rpc}) }));
vi.mock("@/lib/server/workspace",()=>({loadWorkspaceContext:mocks.workspace}));
vi.mock("@/lib/server/admin-registration",()=>({loadAdminCatalog:mocks.catalog}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({auth:{admin:{inviteUserByEmail:mocks.invite}}})}));
import { POST } from "./route";
const organizationId="00000000-0000-4000-8000-000000000010",unitId="00000000-0000-4000-8000-000000000011";
const input={organizationId,unitId,name:"Pessoa Teste",email:"pessoa@example.invalid",role:"LEITOR",domains:["protocolos"],operations:["visualizar"]};
const request=(body:unknown)=>new Request("https://sgc.test/api/v1/admin/invites",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
describe("invitation boundary before sending email",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({id:"actor"});mocks.workspace.mockResolvedValue({organizationId});mocks.demo.mockReturnValue(false);mocks.catalog.mockResolvedValue({catalog:{units:[{id:unitId,status:"ACTIVE"}],grants:[{unitId,role:"GERENTE_UBS",domains:["administracao","protocolos"],operations:["visualizar","criar"]}]}});});
  it("rejects unauthenticated users",async()=>{mocks.actor.mockResolvedValue(null);expect((await POST(request(input))).status).toBe(401);expect(mocks.invite).not.toHaveBeenCalled();});
  it.each([{unitId:null},{unitId:"00000000-0000-4000-8000-000000000012"},{role:"ADMIN_SISTEMA"},{operations:["publicar"]},{domains:["indicadores"]}])("blocks unauthorized delegation %j",async change=>{expect((await POST(request({...input,...change}))).status).toBe(403);expect(mocks.invite).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();});
  it("checks PostgreSQL authorization before privileged Auth",async()=>{mocks.rpc.mockResolvedValue({error:{code:"42501",message:"Vínculo revogado"}});expect((await POST(request(input))).status).toBe(403);expect(mocks.rpc).toHaveBeenCalledWith("authorize_admin_invite",expect.any(Object));expect(mocks.invite).not.toHaveBeenCalled();});
  it("does not send real email in demonstration",async()=>{mocks.demo.mockReturnValue(true);const result=await POST(request(input));expect(result.status).toBe(201);expect((await result.json()).mode).toBe("demo");expect(mocks.invite).not.toHaveBeenCalled();});
});
