"use client";
import { OfflineVault } from "./vault";
import { verifyVault, offlineFetch } from "./work";
import type { WorkspaceContext } from "@/lib/server/workspace";
import { createSupabaseBrowserClient } from "@/lib/client/supabase";
export type PendingAttachment={id:string;fileName:string;contentType:string;byteSize:number;sha256:string;bytes:string;entityType:string;entityId:string;targetUnitId?:string|null;scope:{userId:string;organizationId:string;unitId:string|null};status:'pending'|'confirmed';error?:string};
export function attachmentPrefix(w:Pick<WorkspaceContext,'userId'|'organizationId'|'unitId'>){return `attachment:${w.userId}:${w.organizationId}:${w.unitId??'org'}:`;}
export async function savePendingAttachment(vault:OfflineVault,workspace:WorkspaceContext,file:File,entityType:string,entityId:string,targetUnitId:string|null=workspace.unitId){
  await vault.assertIdentity(workspace.userId,workspace.organizationId);
  if(!['application/pdf','image/jpeg','image/png','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.type)||!file.size||file.size>26214400)throw new Error('Use PDF, imagem, CSV ou XLSX entre 1 byte e 25 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary='';for(let start=0;start<bytes.length;start+=16384)binary+=String.fromCharCode(...bytes.subarray(start,start+16384));
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const item:PendingAttachment={id:crypto.randomUUID(),fileName:file.name,contentType:file.type,byteSize:file.size,sha256:hash,bytes:btoa(binary),entityType,entityId,targetUnitId,scope:{userId:workspace.userId,organizationId:workspace.organizationId,unitId:workspace.unitId},status:'pending'};
  await vault.putRecord(attachmentPrefix(workspace)+item.id,item);return item;
}
export async function synchronizeAttachments(vault:OfflineVault,workspace:WorkspaceContext){
  await verifyVault(vault,workspace);
  for(const {id:key,value:item} of await vault.listRecords<PendingAttachment>(attachmentPrefix(workspace))){
    if(item.status==='confirmed')continue;
    if(item.scope.unitId!==workspace.unitId||item.scope.userId!==workspace.userId)throw new Error('Anexo fora do contexto autorizado.');
    try{
      const headers={'content-type':'application/json','x-device-id':vault.deviceId};
      const response=await offlineFetch('/api/v1/evidence/upload-url',{method:'POST',headers,body:JSON.stringify({attachmentId:item.id,organizationId:workspace.organizationId,unitId:item.targetUnitId===undefined?workspace.unitId:item.targetUnitId,entityType:item.entityType,entityId:item.entityId,fileName:item.fileName,contentType:item.contentType,byteSize:item.byteSize,sha256:item.sha256,classification:'INTERNAL'})});
      if(response.status===401||response.status===403){await vault.invalidateAuthorization();throw new Error('Dispositivo ou usuário sem autorização.');}
      const reservation=await response.json();
      if(!response.ok||reservation.mode==='demo')throw new Error('Não foi possível reservar o anexo. Cópia cifrada preservada.');
      if(reservation.status!=='AVAILABLE'){
        const bytes=Uint8Array.from(atob(item.bytes),c=>c.charCodeAt(0));
        const upload=await createSupabaseBrowserClient().storage.from('evidence').uploadToSignedUrl(reservation.path,reservation.token,new Blob([bytes],{type:item.contentType}));
        if(upload.error&&!/already exists|duplicate/i.test(upload.error.message))throw new Error('Envio interrompido. Retome a partir da cópia cifrada.');
        const finalized=await offlineFetch(`/api/v1/evidence/${item.id}/finalize`,{method:'POST',headers,body:JSON.stringify({expectedVersion:1})});
        if(!finalized.ok)throw new Error('Integridade ainda não confirmada. Anexo preservado para nova tentativa.');
      }
      await vault.putRecord(key,{...item,status:'confirmed',error:undefined});
    }catch(error){await vault.assertAuthorized();await vault.putRecord(key,{...item,error:error instanceof Error?error.message:'Falha de conexão. Cópia preservada.'});throw error;}
  }
}
