import { describe, expect, it, vi, beforeEach } from 'vitest';
import { allowedOfflineCommand, queueWork, synchronizeWork, verifyVault } from './work';
import type { OfflineVault } from './vault';
import type { WorkspaceContext } from '@/lib/server/workspace';
const workspace={userId:'user',organizationId:'org',unitId:'unit',scopes:[{organizationId:'org',unitId:'unit'}],permissions:[{domain:'*',operations:['*']}]} as WorkspaceContext;
beforeEach(()=>{vi.unstubAllGlobals();vi.stubGlobal('navigator',{userAgent:'test'});});
describe('offline allowlist and retry integrity',()=>{
  it.each(['/api/v1/admin/invites','https://evil.test/api/v1/knowledge','/api/v1/safety-events','/api/v1/knowledge?extra=x','/api/v1/knowledge/../../admin/invites'])('rejects destination %s',endpoint=>expect(allowedOfflineCommand(endpoint,'POST')).toBe(false));
  it('rejects non-idempotent attendance writes and accepts explicit MVP commands',()=>{expect(allowedOfflineCommand('/api/v1/knowledge','PUT')).toBe(false);expect(allowedOfflineCommand('/api/v1/actions/00000000-0000-4000-8000-000000000001/update','POST')).toBe(true);});
  it('keeps critical transitions as drafts until their conflict adapters are qualified',()=>{expect(allowedOfflineCommand('/api/v1/protocols/00000000-0000-4000-8000-000000000001/publish','POST')).toBe(false);expect(allowedOfflineCommand('/api/v1/actions/00000000-0000-4000-8000-000000000001/complete','POST')).toBe(false);});
  it.each(['indicators/00000000-0000-4000-8000-000000000001/targets','action-plans/00000000-0000-4000-8000-000000000001/actions','meetings/00000000-0000-4000-8000-000000000001/agenda','meetings/00000000-0000-4000-8000-000000000001/referrals'])('keeps non-idempotent %s as drafts',path=>expect(allowedOfflineCommand(`/api/v1/${path}`,'POST')).toBe(false));
  it('does not replace an existing operation with different data',async()=>{
    const vault={assertIdentity:vi.fn(),getRecord:vi.fn().mockResolvedValue({body:{operationId:'same',title:'old'}}),putRecord:vi.fn()} as unknown as OfflineVault;
    await expect(queueWork(vault,workspace,'Create','/api/v1/knowledge','POST',{operationId:'same',title:'changed'})).rejects.toThrow('outros dados');
    expect(vault.putRecord).not.toHaveBeenCalled();
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
