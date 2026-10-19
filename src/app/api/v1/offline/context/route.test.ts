import {beforeEach,describe,expect,it,vi} from 'vitest';
import {RESTRICTED_OFFLINE_ORGANIZATION} from '@/lib/offline/authorization';
const mocks=vi.hoisted(()=>({actor:vi.fn(),workspace:vi.fn(),demo:vi.fn(),rpc:vi.fn(),profile:vi.fn()}));
vi.mock('@/lib/server/supabase',()=>({requireActor:mocks.actor,isDemoMode:mocks.demo,createSupabaseServerClient:async()=>({rpc:mocks.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.profile})})})})}));
vi.mock('@/lib/server/workspace',()=>({loadWorkspaceContext:mocks.workspace}));
import {GET} from './route';
const authorization={version:1,userId:'actor',organizationId:RESTRICTED_OFFLINE_ORGANIZATION,digest:'a'.repeat(64)};
beforeEach(()=>{
  vi.clearAllMocks();mocks.actor.mockResolvedValue({id:'actor'});mocks.demo.mockReturnValue(false);
  mocks.workspace.mockResolvedValue({userId:'actor',organizationId:RESTRICTED_OFFLINE_ORGANIZATION,enabledModules:['vigilancia']});
  mocks.profile.mockResolvedValue({data:{status:'ACTIVE'},error:null});mocks.rpc.mockResolvedValue({data:authorization,error:null});
});
describe('own restricted offline context',()=>{
  it('requires authentication and active profile',async()=>{
    mocks.actor.mockResolvedValue(null);expect((await GET()).status).toBe(401);
    mocks.actor.mockResolvedValue({id:'actor'});mocks.profile.mockResolvedValue({data:{status:'SUSPENDED'},error:null});
    expect((await GET()).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it('does not load context when the profile cannot be verified',async()=>{
    mocks.profile.mockResolvedValue({data:null,error:{code:'57014'}});
    expect((await GET()).status).toBe(503);expect(mocks.workspace).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requests only own actor metadata for the server-selected organization',async()=>{
    mocks.rpc.mockResolvedValue({data:{...authorization,grants:[{nominal:true}],patients:['forbidden']},error:null});
    const response=await GET();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.rpc).toHaveBeenCalledWith('staging_own_offline_authorization_v1',{p_organization_id:RESTRICTED_OFFLINE_ORGANIZATION});
    expect((await response.json()).offlineAuthorization).toEqual(authorization);
  });
  it('does not change institutional or demonstration authorization',async()=>{
    mocks.workspace.mockResolvedValue({userId:'actor',organizationId:'institution'});expect((await GET()).status).toBe(200);
    mocks.demo.mockReturnValue(true);mocks.workspace.mockResolvedValue({userId:'demo',organizationId:'demo'});expect((await GET()).status).toBe(200);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{code:'42501',status:403},{code:'PGRST202',status:503},{code:'57014',status:503}])('fails closed for RPC $code',async({code,status})=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code}});const response=await GET();expect(response.status).toBe(status);expect((await response.json()).offlineAuthorization).toBeUndefined();
  });
  it.each([{userId:'other'},{organizationId:'other'},{digest:'invalid'},{version:2}])('rejects unverifiable metadata %j',async change=>{
    mocks.rpc.mockResolvedValue({data:{...authorization,...change},error:null});expect((await GET()).status).toBe(503);
  });
  it('reports unavailable service without issuing a usable authorization',async()=>{
    mocks.rpc.mockRejectedValue(new Error('network'));expect((await GET()).status).toBe(503);
  });
});
