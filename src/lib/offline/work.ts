"use client";
import { OfflineVault } from "./vault";
import type { WorkspaceContext } from "@/lib/server/workspace";
import type {DetailData} from '@/lib/server/record-detail';
import {criticalTransition,transitionSnapshot,type TransitionEnvelope} from './transitions';
import {offlineForm,formSnapshot} from './forms';
import { OFFLINE_AUTHORIZATION_KEY, RESTRICTED_OFFLINE_ORGANIZATION, isOfflineAuthorization, type OfflineAuthorization } from './authorization';

export type PendingWork={id:string;title:string;scope:{userId:string;organizationId:string;unitId:string|null};endpoint:string;method:"POST"|"PUT";body:Record<string,unknown>;status:"pending"|"confirmed"|"failed"|"conflict";error?:string;server?:unknown;result?:Record<string,unknown>;createdAt:string;resolutionAttempt?:Record<string,unknown>;resolutionStrategy?:string;transition?:TransitionEnvelope};
// Enable queued mutations only after retry/conflict integration qualification.
// Other command forms keep encrypted drafts for explicit online confirmation.
const idempotentCommands:Record<string,string[]>={actions:['update']};
export function allowedOfflineCommand(endpoint:string,method:string){
  if(offlineForm(endpoint,method))return true;
  if(method!=='POST')return false;
  if(criticalTransition(endpoint))return true;
  if(/^\/api\/v1\/(knowledge|protocols|indicators|action-plans|meetings)$/.test(endpoint))return true;
  const match=endpoint.match(/^\/api\/v1\/([a-z-]+)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/([a-z-]+)$/i);
  return Boolean(match&&idempotentCommands[match[1]]?.includes(match[2]));
}
export function workPrefix(workspace:Pick<WorkspaceContext,'userId'|'organizationId'|'unitId'>){return `work:${workspace.userId}:${workspace.organizationId}:${workspace.unitId??'org'}:`;}
export function offlineFetch(input:string,init?:RequestInit){return fetch(input,{...init,signal:AbortSignal.timeout(20_000)});}
export function isNetworkFailure(error:unknown){return error instanceof TypeError||error instanceof DOMException&&['AbortError','TimeoutError'].includes(error.name);}
export async function verifyVault(vault:OfflineVault,workspace?:WorkspaceContext){
  // Never overwrite the former permission scope during a downgrade/revocation.
  // Pending data remains quarantined until institutional treatment or logout.
  const storedWorkspace=await vault.verificationContext<WorkspaceContext>();
  const cached=storedWorkspace??workspace;
  let verifiedAuthorization:OfflineAuthorization|undefined;
  if(cached){
    const currentResponse=await offlineFetch('/api/v1/offline/context');
    if(currentResponse.status===401||currentResponse.status===403){await vault.invalidateAuthorization();throw new Error('Sessão sem autorização. Pendências cifradas preservadas.');}
    if(!currentResponse.ok)throw new Error('Não foi possível conferir os vínculos atuais.');
    const current:WorkspaceContext=await currentResponse.json();
    const sameAccount=current.userId===cached.userId&&current.organizationId===cached.organizationId;
    if(sameAccount&&current.unitId!==cached.unitId)throw new Error('Selecione a UBS original online antes de acessar ou sincronizar este cofre. Pendências preservadas.');
    const scopeAllowed=current.scopes.some(s=>s.organizationId===cached.organizationId&&(s.unitId===cached.unitId||s.unitId===null))||current.scopes.length===0&&current.userId===cached.userId&&current.unitId===cached.unitId;
    const fingerprint=(w:WorkspaceContext)=>JSON.stringify(w.permissions.map(p=>({domain:p.domain,operations:[...p.operations].sort()})).sort((a,b)=>a.domain.localeCompare(b.domain)));
    if(!sameAccount||!scopeAllowed||fingerprint(current)!==fingerprint(cached)||cached.enabledModules?.some(module=>!current.enabledModules.includes(module))){
      await vault.invalidateAuthorization();throw new Error('Conta, vínculo ou permissões mudaram. O cofre foi bloqueado; pendências cifradas preservadas para tratamento autorizado.');
    }
    const requiresSpecificAuthorization=(context:WorkspaceContext)=>context.organizationId===RESTRICTED_OFFLINE_ORGANIZATION||context.enabledModules?.includes('vigilancia')||context.permissions.some(permission=>permission.domain.startsWith('vigilancia.'));
    if(requiresSpecificAuthorization(cached)||requiresSpecificAuthorization(current)||current.offlineAuthorization){
      const currentAuthorization=current.offlineAuthorization;
      // An unavailable/malformed digest is an outage: neither renew nor invalidate.
      if(!isOfflineAuthorization(currentAuthorization)||currentAuthorization.userId!==current.userId||currentAuthorization.organizationId!==current.organizationId)throw new Error('Não foi possível conferir as permissões específicas do cofre. A autorização anterior não foi renovada.');
      const baseline=await vault.verificationContext<OfflineAuthorization>(OFFLINE_AUTHORIZATION_KEY);
      if(baseline){
        if(!isOfflineAuthorization(baseline)||baseline.userId!==currentAuthorization.userId||baseline.organizationId!==currentAuthorization.organizationId||baseline.digest!==currentAuthorization.digest){
          await vault.invalidateAuthorization();throw new Error('As permissões específicas mudaram. O cofre está em quarentena; pendências cifradas preservadas para tratamento autorizado.');
        }
      }else if(storedWorkspace||await vault.hasStoredVerificationData()){
        // Never bless old data with a newly issued digest. Only an empty, new vault
        // can establish its first baseline; legacy data remains encrypted in place.
        await vault.invalidateAuthorization();throw new Error('Cofre antigo sem verificação das permissões específicas. Pendências cifradas preservadas em quarentena; solicite tratamento autorizado.');
      }
      verifiedAuthorization=currentAuthorization;
    }
  }else{
    throw new Error('Prepare o cofre online com o contexto da conta antes de continuar.');
  }
  const response=await offlineFetch('/api/v1/devices/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:vault.deviceId,organizationId:vault.identity.organizationId,label:'Dispositivo de trabalho',platform:navigator.userAgent.slice(0,240)})});
  if(response.status===401||response.status===403){await vault.invalidateAuthorization();throw new Error('Sessão ou dispositivo sem autorização. Entre novamente. Pendências cifradas preservadas.');}
  if(!response.ok)throw new Error('Não foi possível validar o dispositivo. Nenhum item foi descartado.');
  const result=await response.json();
  await vault.markOnlineVerification(result.verifiedAt,verifiedAuthorization);
  if(workspace)await vault.assertIdentity(workspace.userId,workspace.organizationId);
}
export async function queueWork(vault:OfflineVault,workspace:WorkspaceContext,title:string,endpoint:string,method:"POST"|"PUT",body:Record<string,unknown>){
  if(!allowedOfflineCommand(endpoint,method))throw new Error('Esta operação deve ser recuperada como rascunho e confirmada online.');
  await vault.assertIdentity(workspace.userId,workspace.organizationId);
  const id=typeof body.operationId==='string'?body.operationId:crypto.randomUUID();
  const key=workPrefix(workspace)+id;
  const existing=await vault.getRecord<PendingWork>(key);
  const pending:PendingWork={id,title,scope:{userId:workspace.userId,organizationId:workspace.organizationId,unitId:workspace.unitId},endpoint,method,body:{...body,operationId:id},status:'pending',createdAt:new Date().toISOString()};
  if(existing){if(JSON.stringify(existing.body)!==JSON.stringify(pending.body))throw new Error('A operação pendente tem outros dados. Preserve-a antes de preparar outra.');return existing;}
  const form=offlineForm(endpoint,method);
  const transition=criticalTransition(endpoint)??form;
  if(transition){
    const snapshot=await vault.getRecord<{detail:DetailData}>(`snapshot:${workspace.userId}:${workspace.organizationId}:${workspace.unitId??'org'}:${transition.resource}:${transition.entityId}`);
    if(!snapshot)throw new Error('Disponibilize o detalhe desta versão ou registro no dispositivo antes de preparar a operação.');
    const saved=form?formSnapshot(snapshot.detail):transitionSnapshot(snapshot.detail);
    const {operationId:bodyOperation,expectedVersion:bodyVersion,...fields}=pending.body;void bodyOperation;
    const parsed=form?form.schema.safeParse({...fields,...(form.userId?{userId:form.userId}:{})}):transition.schema.safeParse(pending.body);
    if(!parsed.success)throw new Error('Revise os campos obrigatórios desta operação antes de prepará-la.');
    const normalized=parsed.data as Record<string,unknown>;
    const {operationId,expectedVersion,...payload}=form?{operationId:id,expectedVersion:Number(bodyVersion??saved.record.version??saved.record.version_number),...normalized}:normalized;
    pending.transition={organizationId:workspace.organizationId,unitId:workspace.unitId,entityId:transition.entityId,resource:transition.resource,command:transition.command,operationId:String(operationId),expectedVersion:Number(expectedVersion),deviceId:vault.deviceId,expectedRecord:saved.record,expectedRelated:saved.related,payload};
  }
  await vault.putRecord(key,pending);return pending;
}
export async function synchronizeWork(vault:OfflineVault,workspace:WorkspaceContext){
  await verifyVault(vault,workspace);
  const rows=(await vault.listRecords<PendingWork>(workPrefix(workspace))).sort((a,b)=>a.value.createdAt.localeCompare(b.value.createdAt)||a.id.localeCompare(b.id));
  const entityKey=(item:PendingWork)=>{
    const transition=criticalTransition(item.endpoint)??offlineForm(item.endpoint,item.method);
    return transition?`/api/v1/${transition.resource}/${transition.entityId}`:item.endpoint.match(/^\/api\/v1\/[^/]+\/[0-9a-f-]{36}/i)?.[0];
  };
  const blocked=new Set(rows.filter(row=>row.value.status==='conflict').map(row=>entityKey(row.value)).filter(Boolean));
  for(const {id:key,value:item} of rows){
    if(item.status==='confirmed'||item.status==='conflict')continue;
    if(entityKey(item)&&blocked.has(entityKey(item)))continue;
    await vault.assertIdentity(workspace.userId,workspace.organizationId);
    if(item.scope.unitId!==workspace.unitId||item.scope.userId!==workspace.userId||!allowedOfflineCommand(item.endpoint,item.method))throw new Error('Operação fora do contexto autorizado.');
    // Keep the exact operation/body on every retry, including a lost response.
    if((criticalTransition(item.endpoint)||offlineForm(item.endpoint,item.method))&&!item.transition)throw new Error('Operação antiga sem snapshot. Recupere o rascunho e prepare uma operação com a versão autorizada.');
    const response=await offlineFetch(item.transition?offlineForm(item.endpoint,item.method)?'/api/v1/offline/forms':'/api/v1/offline/transitions':item.endpoint,{method:item.transition?'POST':item.method,headers:{'content-type':'application/json','x-device-id':vault.deviceId},body:JSON.stringify(item.transition??item.body)});
    const result=await response.json();
    if(response.status===401||response.status===403){await vault.invalidateAuthorization();throw new Error('Acesso não autorizado. Fila cifrada preservada; entre novamente para revisar suas permissões.');}
    if(response.status===409){
      blocked.add(entityKey(item));
      const match=item.endpoint.match(/^\/api\/v1\/([^/]+)\/([^/]+)\//);
      let server:unknown=result.server??null;
      if(!item.transition&&match){const current=await offlineFetch(`/api/v1/${match[1]}/${match[2]}`);if(current.ok)server=await current.json();}
      await vault.putRecord(key,{...item,status:'conflict',error:'Conflito: compare as duas versões antes de preparar uma nova operação.',server,result});
      continue;
    }
    // Demo acknowledgements must never claim durable confirmation.
    const confirmed=response.ok&&result.mode!=='demo'&&(!item.transition||['confirmed','resolved'].includes(result.status));
    await vault.putRecord(key,{...item,status:confirmed?'confirmed':'failed',result,error:confirmed?undefined:result.mode==='demo'?'Demonstração: nenhum dado foi gravado.':'Falha de envio. Dados preservados para nova tentativa.'});
    if(!response.ok&&response.status>=500)break;
  }
  return vault.listRecords<PendingWork>(workPrefix(workspace));
}

export async function resolveTransitionWork(vault:OfflineVault,workspace:WorkspaceContext,item:PendingWork,decision:'KEEP_SERVER'|'RETRY',justification:string){
 await verifyVault(vault,workspace);
 if(item.status!=='conflict'||!item.transition)throw new Error('Conflito de transição não encontrado.');
 const server=item.server as {record?:Record<string,unknown>;related?:Record<string,Record<string,unknown>[]>}|undefined;
 if(!server?.record||!server.related)throw new Error('Snapshot do servidor indisponível. Reconecte para revisar.');
 const attempt=item.resolutionAttempt??{...item.transition,operationId:crypto.randomUUID(),sourceOperationId:item.result?.operationId??item.id,decision,justification,expectedRecord:server.record,expectedRelated:server.related,expectedVersion:Number(server.record.version??server.record.version_number)};
 const key=workPrefix(workspace)+item.id;
 await vault.putRecord(key,{...item,resolutionAttempt:attempt});
 const response=await offlineFetch(offlineForm(item.endpoint,item.method)?'/api/v1/offline/forms':'/api/v1/offline/transitions',{method:'POST',headers:{'content-type':'application/json','x-device-id':vault.deviceId},body:JSON.stringify(attempt)});
 const result=await response.json();
 if(response.status===401||response.status===403){await vault.invalidateAuthorization();throw new Error('Resolução não autorizada. Versões preservadas.');}
 if(response.status===409){await vault.putRecord(key,{...item,resolutionAttempt:undefined,result,server:result.server,error:'O servidor mudou novamente. Revise as duas versões.'});throw new Error('A transição continua em conflito. Revise novamente.');}
 if(!response.ok||result.status!=='resolved'||result.mode==='demo')throw new Error('Resolução ainda não confirmada. Tentativa preservada.');
 await vault.putRecord(key,{...item,status:'confirmed',resolutionAttempt:attempt,result,resolutionStrategy:decision,error:'Resolução confirmada e auditada. A operação original permanece cifrada.'});
}

export async function resolveActionWork(vault:OfflineVault,workspace:WorkspaceContext,item:PendingWork,strategy:'KEEP_SERVER'|'KEEP_CLIENT',justification:string){
  await verifyVault(vault,workspace);
  if(item.status!=='conflict'||!/^\/api\/v1\/actions\/[0-9a-f-]{36}\/update$/i.test(item.endpoint))throw new Error('Este conflito exige revisão no formulário original.');
  const entityId=item.endpoint.split('/')[4];
  const server=item.server as {record?:{version?:number}}|undefined;
  const key=workPrefix(workspace)+item.id;
  const attempt=item.resolutionAttempt??{operationId:crypto.randomUUID(),sourceOperationId:item.id,entityId,expectedVersion:server?.record?.version,strategy,justification,client:{status:item.body.status,percentage:item.body.percentage,blockedReason:item.body.blockedReason}};
  await vault.putRecord(key,{...item,resolutionAttempt:attempt});
  const response=await offlineFetch('/api/v1/offline/resolve',{method:'POST',headers:{'content-type':'application/json','x-device-id':vault.deviceId},body:JSON.stringify(attempt)});
  if(response.status===401||response.status===403){await vault.invalidateAuthorization();throw new Error('Resolução não autorizada. As duas versões foram preservadas.');}
  const result=await response.json();
  if(response.status===409){const current=await offlineFetch(`/api/v1/actions/${entityId}`);await vault.putRecord(key,{...item,resolutionAttempt:undefined,server:current.ok?await current.json():item.server,error:'A ação mudou novamente. Compare a versão atual antes de resolver.'});throw new Error('A ação mudou novamente. Revise antes de confirmar.');}
  if(!response.ok||result.mode==='demo')throw new Error('Resolução não confirmada. Tentativa e versões preservadas.');
  await vault.putRecord(key,{...item,resolutionAttempt:attempt,status:'confirmed',resolutionStrategy:String(attempt.strategy),result,error:'Conflito resolvido por comando versionado e auditado. O conteúdo original permanece nesta cópia cifrada.'});
}
