import {describe,expect,it,vi} from 'vitest';
import {OfflineVault} from './vault';
import {OFFLINE_AUTHORIZATION_KEY,RESTRICTED_OFFLINE_ORGANIZATION} from './authorization';

// Small transaction double: staged changes commit together, abort discards all.
function memoryDatabase(blocked=false){
  const stores:Record<string,Map<IDBValidKey,unknown>>={meta:new Map([['vault',{id:'vault',userId:'actor',organizationId:RESTRICTED_OFFLINE_ORGANIZATION,verifiedAt:0,blocked}]]),records:new Map([['__verifier',{id:'__verifier'}]]),queue:new Map()};
  const db={transaction(names:string|string[]){
    const included=typeof names==='string'?[names]:names;
    const staged=Object.fromEntries(included.map(name=>[name,new Map(stores[name])]));
    let pending=0,aborted=false,settled=false;
    const tx={oncomplete:null as null|(()=>void),onabort:null as null|(()=>void),onerror:null as null|(()=>void),error:null,
      abort(){aborted=true;queueMicrotask(()=>tx.onabort?.());},
      objectStore(name:string){
        const request=(run:()=>unknown)=>{
          const req={result:undefined as unknown,onsuccess:null as null|(()=>void),onerror:null};pending++;
          queueMicrotask(()=>{if(aborted)return;req.result=run();req.onsuccess?.();pending--;queueMicrotask(()=>{if(!pending&&!aborted&&!settled){settled=true;for(const store of included)stores[store]=staged[store];tx.oncomplete?.();}});});return req;
        };
        return {get:(key:IDBValidKey)=>request(()=>staged[name].get(key)),getAllKeys:()=>request(()=>[...staged[name].keys()]),count:()=>request(()=>staged[name].size),put:(value:{id:IDBValidKey})=>request(()=>{staged[name].set(value.id,value);return value.id;})};
      }};
    return tx;
  }};
  return {db:db as unknown as IDBDatabase,stores};
}
async function fixture(blocked=false){
  const memory=memoryDatabase(blocked);
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const vault=Object.assign(Object.create(OfflineVault.prototype),{db:memory.db,key,deviceId:'device',identity:{userId:'actor',organizationId:RESTRICTED_OFFLINE_ORGANIZATION}}) as OfflineVault;
  return {...memory,vault};
}
const authorization={version:1 as const,userId:'actor',organizationId:RESTRICTED_OFFLINE_ORGANIZATION,digest:'a'.repeat(64)};
describe('reserved offline authorization persistence',()=>{
  it('commits encrypted baseline and renewed expiry in one transaction',async()=>{
    const {vault,stores}=await fixture();const verifiedAt=new Date().toISOString();
    await vault.markOnlineVerification(verifiedAt,authorization);
    expect(stores.meta.get('vault')).toMatchObject({verifiedAt:Date.parse(verifiedAt)});
    expect(JSON.stringify(stores.records.get(OFFLINE_AUTHORIZATION_KEY))).not.toContain(authorization.digest);
    expect(await vault.verificationContext(OFFLINE_AUTHORIZATION_KEY)).toEqual(authorization);
  });
  it('keeps the reserved baseline when ordinary workspace is replaced',async()=>{
    const {vault}=await fixture();vi.stubGlobal('window',{dispatchEvent:vi.fn()});
    await vault.markOnlineVerification(new Date().toISOString(),authorization);
    await vault.putRecord('workspace',{userId:'actor',permissions:[]});
    expect(await vault.verificationContext()).toEqual({userId:'actor',permissions:[]});
    expect(await vault.verificationContext(OFFLINE_AUTHORIZATION_KEY)).toEqual(authorization);vi.unstubAllGlobals();
  });
  it('does not decrypt arbitrary expired records through the verification accessor',async()=>{
    const {vault}=await fixture();
    await expect(vault.verificationContext('draft:nominal' as 'workspace')).rejects.toThrow('inválido');
  });
  it('detects old records or queues even without a workspace snapshot',async()=>{
    const {vault,stores}=await fixture();expect(await vault.hasStoredVerificationData()).toBe(false);
    stores.records.set('draft:old',{id:'draft:old',value:'encrypted'});expect(await vault.hasStoredVerificationData()).toBe(true);
    stores.records.delete('draft:old');stores.queue.set('pending',{id:'pending'});expect(await vault.hasStoredVerificationData()).toBe(true);
  });
  it('does not classify a previously verified empty vault as genuinely new',async()=>{
    const {vault,stores}=await fixture();stores.meta.set('vault',{id:'vault',verifiedAt:1});
    expect(await vault.hasStoredVerificationData()).toBe(true);
  });
  it('never unquarantines a blocked vault or writes a new baseline',async()=>{
    const {vault,stores}=await fixture(true);
    await expect(vault.markOnlineVerification(new Date().toISOString(),authorization)).rejects.toThrow('quarentena');
    expect(stores.meta.get('vault')).toMatchObject({verifiedAt:0,blocked:true});expect(stores.records.has(OFFLINE_AUTHORIZATION_KEY)).toBe(false);
  });
  it('rejects another identity and arbitrary replacement or deletion of the baseline',async()=>{
    const {vault}=await fixture();
    await expect(vault.markOnlineVerification(new Date().toISOString(),{...authorization,userId:'other'})).rejects.toThrow('outro contexto');
    await expect(vault.putRecord(OFFLINE_AUTHORIZATION_KEY,authorization)).rejects.toThrow('reservado');
    await expect(vault.removeRecord(OFFLINE_AUTHORIZATION_KEY)).rejects.toThrow('reservado');
  });
});
