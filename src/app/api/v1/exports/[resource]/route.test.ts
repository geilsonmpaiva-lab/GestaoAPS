import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({actor:vi.fn(),demo:vi.fn(),workspace:vi.fn(),from:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/server/supabase",()=>({requireActor:mocks.actor,isDemoMode:mocks.demo,createSupabaseServerClient:async()=>({from:mocks.from,rpc:mocks.rpc})}));
vi.mock("@/lib/server/workspace",()=>({loadWorkspaceContext:mocks.workspace}));
import { GET } from "./route";
const org="00000000-0000-4000-8000-000000000010", unitA="00000000-0000-4000-8000-000000000011", unitB="00000000-0000-4000-8000-000000000012";
const workspace={organizationId:org,unitId:unitA,enabledModules:["protocolos"],permissions:[{domain:"protocolos",operations:["visualizar","exportar"]}],scopes:[{organizationId:org,unitId:unitA},{organizationId:org,unitId:unitB}]};
const request=(search="")=>new NextRequest(`https://sgc.test/api/v1/exports/protocols?format=csv${search}`);
const context={params:Promise.resolve({resource:"protocols"})};
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({id:"actor"});mocks.demo.mockReturnValue(false);mocks.workspace.mockResolvedValue(workspace);});
describe("authorized export scope",()=>{
  it("requires authentication",async()=>{mocks.actor.mockResolvedValue(null);expect((await GET(request(),context)).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();});
  it("rejects read-only users before querying",async()=>{mocks.workspace.mockResolvedValue({...workspace,permissions:[{domain:"protocolos",operations:["visualizar"]}]});expect((await GET(request(),context)).status).toBe(403);expect(mocks.from).not.toHaveBeenCalled();});
  it("rejects disabled modules",async()=>{mocks.workspace.mockResolvedValue({...workspace,enabledModules:[]});expect((await GET(request(),context)).status).toBe(403);expect(mocks.from).not.toHaveBeenCalled();});
  it("does not broaden the selected UBS even if another scope exists",async()=>{expect((await GET(request(`&unitId=${unitB}`),context)).status).toBe(403);expect(mocks.from).not.toHaveBeenCalled();});
  it("filters organization, selected UBS and soft-deleted rows",async()=>{
    const eq=vi.fn(),is=vi.fn();
    const chain={select:()=>chain,eq:(key:string,value:unknown)=>{eq(key,value);return chain;},is:(key:string,value:unknown)=>{is(key,value);return chain;},limit:()=>chain,then:(resolve:(result:unknown)=>unknown)=>Promise.resolve({data:[{id:"synthetic",title:"Documento sintético"}],error:null}).then(resolve)};
    mocks.from.mockReturnValue(chain);
    const response=await GET(request(),context);
    expect(response.status).toBe(200);expect(eq).toHaveBeenCalledWith("organization_id",org);expect(eq).toHaveBeenCalledWith("unit_id",unitA);expect(is).toHaveBeenCalledWith("deleted_at",null);expect(await response.text()).toContain("Documento sintético");
  });
  it("rejects unlisted UBS in organization-wide view",async()=>{mocks.workspace.mockResolvedValue({...workspace,unitId:null,scopes:[]});expect((await GET(request(`&unitId=${unitB}`),context)).status).toBe(403);expect(mocks.from).not.toHaveBeenCalled();});
});
