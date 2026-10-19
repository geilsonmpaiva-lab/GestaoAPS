import { describe, expect, it, vi, beforeEach } from 'vitest';
import { allowedOfflineCommand, queueWork, synchronizeWork, verifyVault } from './work';
import type { OfflineVault } from './vault';
import type { WorkspaceContext } from '@/lib/server/workspace';
import { OFFLINE_AUTHORIZATION_KEY, RESTRICTED_OFFLINE_ORGANIZATION } from './authorization';
const workspace={userId:'user',organizationId:'org',unitId:'unit',scopes:[{organizationId:'org',unitId:'unit'}],permissions:[{domain:'*',operations:['*']}]} as WorkspaceContext;
beforeEach(()=>{vi.unstubAllGlobals();vi.stubGlobal('navigator',{userAgent:'test'});});
describe('offline allowlist and retry integrity',()=>{
  it.each(['/api/v1/admin/invites','https://evil.test/api/v1/knowledge','/api/v1/safety-events','/api/v1/knowledge?extra=x','/api/v1/knowledge/../../admin/invites'])('rejects destination %s',endpoint=>expect(allowedOfflineCommand(endpoint,'POST')).toBe(false));
  it('rejects non-idempotent attendance writes and accepts explicit MVP commands',()=>{expect(allowedOfflineCommand('/api/v1/knowledge','PUT')).toBe(false);expect(allowedOfflineCommand('/api/v1/actions/00000000-0000-4000-8000-000000000001/update','POST')).toBe(true);});
  it('accepts only explicit critical transition adapters',()=>{expect(allowedOfflineCommand('/api/v1/protocols/00000000-0000-4000-8000-000000000001/publish','POST')).toBe(true);expect(allowedOfflineCommand('/api/v1/actions/00000000-0000-4000-8000-000000000001/complete','POST')).toBe(true);expect(allowedOfflineCommand('/api/v1/protocols/00000000-0000-4000-8000-000000000001/cancel','POST')).toBe(false);});
  it('requires a prepared snapshot before a critical operation can enter the queue',async()=>{
    const vault={deviceId:'device',assertIdentity:vi.fn(),getRecord:vi.fn().mockResolvedValue(null),putRecord:vi.fn()} as unknown as OfflineVault;
    await expect(queueWork(vault,workspace,'Publicar','/api/v1/protocols/00000000-0000-4000-8000-000000000001/publish','POST',{expectedVersion:1})).rejects.toThrow('Disponibilize o detalhe');
    expect(vault.putRecord).not.toHaveBeenCalled();
  });
  it('captures the prepared version and relations without executing the transition',async()=>{
    const id='00000000-0000-4000-8000-000000000001';
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const detail={resource:'protocol-versions',record:{id,status:'APROVADO',version_number:1},related:{forms:[{id:'form'}],bindings:[]}};
    const vault={deviceId:'device',assertIdentity:vi.fn(),getRecord:vi.fn((key:string)=>Promise.resolve(key.startsWith('snapshot:')?{detail}:null)),putRecord:vi.fn()} as unknown as OfflineVault;
    const queued=await queueWork(vault,workspace,'Publicar',`/api/v1/protocols/${id}/publish`,'POST',{expectedVersion:1});
    expect(queued.status).toBe('pending');expect(queued.transition?.expectedRecord).toEqual(detail.record);expect(queued.transition?.expectedRelated.forms).toEqual([{id:'form'}]);expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['conflict','rejected','confirmed'])('acknowledges critical receipts only when explicitly confirmed: %s',async status=>{
    let saved={id:'op',title:'Concluir',scope:{userId:'user',organizationId:'org',unitId:'unit'},endpoint:'/api/v1/actions/00000000-0000-4000-8000-000000000001/complete',method:'POST',body:{operationId:'op'},status:'pending',createdAt:'2026-01-01',transition:{operationId:'op'}} as unknown as import('./work').PendingWork;
    const fetcher=vi.fn(async(url:string)=>url.endsWith('/context')?Response.json(workspace):url.endsWith('/register')?Response.json({verifiedAt:new Date().toISOString()}):Response.json({status,server:{record:{id:'entity'},related:{}}},{status:status==='conflict'?409:200}));vi.stubGlobal('fetch',fetcher);
    const vault={deviceId:'device',identity:{organizationId:'org'},verificationContext:vi.fn().mockResolvedValue(workspace),assertIdentity:vi.fn(),markOnlineVerification:vi.fn(),listRecords:vi.fn(async()=>[{id:'key',value:saved}]),putRecord:vi.fn(async(_key:string,value:typeof saved)=>{saved=value;})} as unknown as OfflineVault;
    await synchronizeWork(vault,workspace);
    expect(fetcher).toHaveBeenCalledWith('/api/v1/offline/transitions',expect.anything());expect(saved.status).toBe(status==='confirmed'?'confirmed':status==='conflict'?'conflict':'failed');
  });
  it.each(['indicators/00000000-0000-4000-8000-000000000001/targets','action-plans/00000000-0000-4000-8000-000000000001/actions','meetings/00000000-0000-4000-8000-000000000001/agenda','meetings/00000000-0000-4000-8000-000000000001/referrals'])('accepts %s only through the snapshot-bound form adapter',path=>expect(allowedOfflineCommand(`/api/v1/${path}`,'POST')).toBe(true));
  it('blocks both protocol endpoint aliases when their version has a local conflict',async()=>{
    const id='00000000-0000-4000-8000-000000000001';
    const base={scope:{userId:'user',organizationId:'org',unitId:'unit'},method:'POST',body:{},createdAt:'2026-01-01'};
    const rows=[{id:'conflict',value:{...base,endpoint:`/api/v1/protocol-versions/${id}/submit-review`,status:'conflict'}},{id:'pending',value:{...base,endpoint:`/api/v1/protocols/${id}/publish`,status:'pending'}}];
    const fetcher=vi.fn(async(url:string)=>url.endsWith('/context')?Response.json(workspace):Response.json({verifiedAt:new Date().toISOString()}));vi.stubGlobal('fetch',fetcher);
    const vault={deviceId:'device',identity:{organizationId:'org'},verificationContext:vi.fn().mockResolvedValue(workspace),assertIdentity:vi.fn(),markOnlineVerification:vi.fn(),listRecords:vi.fn().mockResolvedValue(rows),putRecord:vi.fn()} as unknown as OfflineVault;
    await synchronizeWork(vault,workspace);
    expect(fetcher).toHaveBeenCalledTimes(2);expect(vault.putRecord).not.toHaveBeenCalled();
  });
  it('does not replace an existing operation with different data',async()=>{
    const vault={assertIdentity:vi.fn(),getRecord:vi.fn().mockResolvedValue({body:{operationId:'same',title:'old'}}),putRecord:vi.fn()} as unknown as OfflineVault;
    await expect(queueWork(vault,workspace,'Create','/api/v1/knowledge','POST',{operationId:'same',title:'changed'})).rejects.toThrow('outros dados');
    expect(vault.putRecord).not.toHaveBeenCalled();
  });
  it('captures attendance subject and snapshot version while retaining one operation id',async()=>{
    const id='00000000-0000-4000-8000-000000000001',operationId='00000000-0000-4000-8000-000000000002';
    const detail={resource:'meetings',record:{id,version:4},related:{agenda:[],participants:[],referrals:[]}};
    const vault={deviceId:'device',assertIdentity:vi.fn(),getRecord:vi.fn((key:string)=>Promise.resolve(key.startsWith('snapshot:')?{detail}:null)),putRecord:vi.fn()} as unknown as OfflineVault;
    const queued=await queueWork(vault,workspace,'Presença',`/api/v1/meetings/${id}/participants/${id}`,'PUT',{operationId,attended:false});
    expect(queued.transition).toMatchObject({operationId,expectedVersion:4,payload:{userId:id,attended:false}});
    expect(queued.body.operationId).toBe(operationId);
  });
  it('sends attendance to the additive gateway as POST, never an unsafe direct PUT',async()=>{
    const id='00000000-0000-4000-8000-000000000001';
    let item={id:'op',scope:{userId:'user',organizationId:'org',unitId:'unit'},endpoint:`/api/v1/meetings/${id}/participants/${id}`,method:'PUT',body:{},status:'pending',createdAt:'2026-01-01',transition:{operationId:'op'}} as unknown as import('./work').PendingWork;
    const fetcher=vi.fn(async(url:string)=>url.endsWith('/context')?Response.json(workspace):url.endsWith('/register')?Response.json({verifiedAt:new Date().toISOString()}):Response.json({status:'confirmed'}));vi.stubGlobal('fetch',fetcher);
    const vault={deviceId:'device',identity:{organizationId:'org'},verificationContext:vi.fn().mockResolvedValue(workspace),assertIdentity:vi.fn(),markOnlineVerification:vi.fn(),listRecords:vi.fn(async()=>[{id:'key',value:item}]),putRecord:vi.fn(async(_key:string,value:typeof item)=>{item=value;})} as unknown as OfflineVault;
    await synchronizeWork(vault,workspace);expect(fetcher).toHaveBeenCalledWith('/api/v1/offline/forms',expect.objectContaining({method:'POST'}));expect(item.status).toBe('confirmed');
  });
  it('revocation locks authorization and never acknowledges pending items',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
    const vault={identity:{organizationId:'org'},verificationContext:vi.fn(),invalidateAuthorization:vi.fn(),listRecords:vi.fn(),acknowledge:vi.fn()} as unknown as OfflineVault;
    await expect(synchronizeWork(vault,workspace)).rejects.toThrow('preservadas');
    expect(vault.invalidateAuthorization).toHaveBeenCalledOnce();expect(vault.listRecords).not.toHaveBeenCalled();expect(vault.acknowledge).not.toHaveBeenCalled();
  });
  it('does not overwrite cached permissions after an online downgrade',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...workspace,permissions:[]})));
    const vault={verificationContext:vi.fn().mockResolvedValue(workspace),invalidateAuthorization:vi.fn(),markOnlineVerification:vi.fn()} as unknown as OfflineVault;
    await expect(verifyVault(vault,{...workspace,permissions:[]})).rejects.toThrow('permissões mudaram');
    expect(vault.invalidateAuthorization).toHaveBeenCalledOnce();expect(vault.markOnlineVerification).not.toHaveBeenCalled();
  });
  it('requires the original active UBS without discarding pending work',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...workspace,unitId:'other-unit'})));
    const vault={verificationContext:vi.fn().mockResolvedValue(workspace),invalidateAuthorization:vi.fn(),markOnlineVerification:vi.fn()} as unknown as OfflineVault;
    await expect(verifyVault(vault)).rejects.toThrow('UBS original');
    expect(vault.invalidateAuthorization).not.toHaveBeenCalled();expect(vault.markOnlineVerification).not.toHaveBeenCalled();
  });
});

describe('restricted authorization before vault renewal',()=>{
  const authorization={version:1 as const,userId:'user',organizationId:RESTRICTED_OFFLINE_ORGANIZATION,digest:'a'.repeat(64)};
  const restricted={...workspace,organizationId:RESTRICTED_OFFLINE_ORGANIZATION,enabledModules:['vigilancia'],scopes:[{organizationId:RESTRICTED_OFFLINE_ORGANIZATION,unitId:'unit'}],offlineAuthorization:authorization} as WorkspaceContext;
  function vaultFor(stored:WorkspaceContext|null=restricted,baseline:unknown=authorization,hasData=false){
    return {deviceId:'device',identity:{userId:'user',organizationId:RESTRICTED_OFFLINE_ORGANIZATION},verificationContext:vi.fn(async(key?:string)=>key===OFFLINE_AUTHORIZATION_KEY?baseline:stored),hasStoredVerificationData:vi.fn().mockResolvedValue(hasData),invalidateAuthorization:vi.fn(),markOnlineVerification:vi.fn(),assertIdentity:vi.fn(),putRecord:vi.fn(),listRecords:vi.fn(),acknowledge:vi.fn()} as unknown as OfflineVault;
  }
  function responses(current=restricted){
    const fetcher=vi.fn(async(url:string)=>url.endsWith('/context')?Response.json(current):Response.json({verifiedAt:new Date().toISOString()}));vi.stubGlobal('fetch',fetcher);return fetcher;
  }
  it('checks the separately encrypted digest even if DraftTools overwrote workspace without it',async()=>{
    const vault=vaultFor({...restricted,offlineAuthorization:undefined});const fetcher=responses();
    await verifyVault(vault,{...restricted,offlineAuthorization:undefined});
    expect(vault.verificationContext).toHaveBeenCalledWith(OFFLINE_AUTHORIZATION_KEY);
    expect(vault.markOnlineVerification).toHaveBeenCalledWith(expect.any(String),authorization);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('quarantines specific grant changes even when membership permissions are identical',async()=>{
    const vault=vaultFor();const fetcher=responses({...restricted,offlineAuthorization:{...authorization,digest:'b'.repeat(64)}});
    await expect(synchronizeWork(vault,restricted)).rejects.toThrow('permissões específicas mudaram');
    expect(vault.invalidateAuthorization).toHaveBeenCalledOnce();expect(vault.markOnlineVerification).not.toHaveBeenCalled();expect(vault.listRecords).not.toHaveBeenCalled();expect(vault.acknowledge).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not adopt a new fingerprint for a legacy workspace, including an expired vault',async()=>{
    const vault=vaultFor({...restricted,offlineAuthorization:undefined},null);responses();
    await expect(verifyVault(vault,restricted)).rejects.toThrow('Cofre antigo');
    expect(vault.invalidateAuthorization).toHaveBeenCalledOnce();expect(vault.markOnlineVerification).not.toHaveBeenCalled();
  });
  it('does not treat absent workspace as a new vault when old drafts or queue records exist',async()=>{
    const vault=vaultFor(null,null,true);responses();
    await expect(verifyVault(vault,restricted)).rejects.toThrow('Cofre antigo');
    expect(vault.hasStoredVerificationData).toHaveBeenCalledOnce();expect(vault.markOnlineVerification).not.toHaveBeenCalled();
  });
  it('establishes the first baseline only for a genuinely empty vault after device verification',async()=>{
    const vault=vaultFor(null,null,false);responses();
    await verifyVault(vault,{...restricted,offlineAuthorization:undefined});
    expect(vault.markOnlineVerification).toHaveBeenCalledWith(expect.any(String),authorization);expect(vault.invalidateAuthorization).not.toHaveBeenCalled();
  });
  it.each([503,500])('does not invalidate or renew on context outage %s',async status=>{
    const vault=vaultFor();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));
    await expect(verifyVault(vault,restricted)).rejects.toThrow('conferir');
    expect(vault.invalidateAuthorization).not.toHaveBeenCalled();expect(vault.markOnlineVerification).not.toHaveBeenCalled();
  });
  it('does not renew when a digest is missing, malformed or bound to another actor',async()=>{
    for(const token of [undefined,{...authorization,digest:'invalid'},{...authorization,userId:'other'}]){
      const vault=vaultFor();responses({...restricted,offlineAuthorization:token});
      await expect(verifyVault(vault,restricted)).rejects.toThrow('não foi renovada');
      expect(vault.invalidateAuthorization).not.toHaveBeenCalled();expect(vault.markOnlineVerification).not.toHaveBeenCalled();
    }
  });
  it('never persists a first baseline after failed device verification',async()=>{
    const vault=vaultFor(null,null,false);vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/context')?Response.json(restricted):new Response('{}',{status:503})));
    await expect(verifyVault(vault,restricted)).rejects.toThrow('validar o dispositivo');expect(vault.markOnlineVerification).not.toHaveBeenCalled();
  });
});
