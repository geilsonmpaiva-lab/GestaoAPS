"use client";
import { useState } from "react";
import { OfflineVault } from "@/lib/offline/vault";
import { verifyVault } from "@/lib/offline/work";
import type { WorkspaceContext } from "@/lib/server/workspace";
import type { DetailData } from "@/lib/server/record-detail";
export function OfflineSnapshot({detail,workspace}:{detail:DetailData;workspace:WorkspaceContext}){
  const [message,setMessage]=useState('');
  async function save(){try{const vault=OfflineVault.active;if(!vault)throw new Error('Abra Sincronização e desbloqueie o cofre antes de preparar este registro.');if(navigator.onLine)await verifyVault(vault,workspace);await vault.assertIdentity(workspace.userId,workspace.organizationId);await vault.putRecord('workspace',workspace);await vault.putRecord(`snapshot:${workspace.userId}:${workspace.organizationId}:${workspace.unitId??'org'}:${detail.resource}:${detail.record.id}`,{detail,updatedAt:new Date().toISOString()});setMessage('Registro cifrado e disponível na área offline. Ele não será atualizado automaticamente sem conexão.');}catch(error){setMessage(error instanceof Error?error.message:'Falha ao preparar registro.');}}
  // Full document navigation lets the service worker serve its public fallback.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <section className="panel detail-section"><h2>Disponibilidade offline</h2><button className="secondary-button" onClick={save}>Disponibilizar neste dispositivo</button>{' '}<a href="/offline">Abrir área offline</a>{message&&<p role="status">{message}</p>}</section>;
}
