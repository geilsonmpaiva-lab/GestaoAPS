'use client';
import { createContext, useState, useSyncExternalStore } from 'react';
import { OfflineVault } from '@/lib/offline/vault';
import type { WorkspaceContext } from '@/lib/server/workspace';
import { verifyVault } from '@/lib/offline/work';

export type SavedDraft = { title: string; href: string; values: Record<string,string>; updatedAt: string; scope: {userId:string;organizationId:string;unitId:string|null}; };
export const DraftWorkspace = createContext<WorkspaceContext | null>(null);
const subscribeReady = () => () => {};
export function DraftTools({ draftKey, title, values, onRestore, workspace }: { draftKey:string; title:string; values:Record<string,string>|(()=>Record<string,string>); onRestore:(values:Record<string,string>)=>void; workspace:WorkspaceContext }) {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const [pin,setPin] = useState('');
  const [message,setMessage] = useState('Salve uma cópia cifrada antes de sair desta página.');
  const [busy,setBusy] = useState(false);
  const key = `draft:${workspace.userId}:${workspace.organizationId}:${workspace.unitId ?? 'org'}:${draftKey}`;
  async function handleVault(action:'save'|'restore') {
    setBusy(true);
    try {
      let vault = OfflineVault.active;
      if (!vault) {
        vault = await OfflineVault.unlock(pin, {userId:workspace.userId,organizationId:workspace.organizationId});
      }
      // Revalidate even an already unlocked vault before replacing its context.
      if (navigator.onLine) await verifyVault(vault,workspace);
      OfflineVault.activate(vault);
      await vault.assertIdentity(workspace.userId,workspace.organizationId);
      await vault.putRecord('workspace',workspace);
      if (action === 'save') {
        await vault.putRecord<SavedDraft>(key,{title,href:window.location.pathname+window.location.search,values:typeof values==='function'?values():values,updatedAt:new Date().toISOString(),scope:{userId:workspace.userId,organizationId:workspace.organizationId,unitId:workspace.unitId}});
        setMessage('Salvo neste dispositivo. O servidor ainda não recebeu esta cópia.');
      } else {
        const saved = await vault.getRecord<SavedDraft>(key);
        if (!saved) throw new Error('Nenhuma cópia local encontrada para este formulário.');
        onRestore(saved.values); setMessage('Cópia local recuperada. Revise os dados antes de enviar.');
      }
      setPin('');
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Falha no cofre. O formulário permanece nesta página.'); }
    finally { setBusy(false); }
  }
  return <aside className="v2-draft"><h3>Rascunho no dispositivo</h3><label className="v2-field"><span>PIN do cofre (se estiver bloqueado)</span><input disabled={!ready} type="password" inputMode="numeric" autoComplete="off" minLength={6} maxLength={12} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} /></label><div className="dialog-actions"><button className="v2-secondary" type="button" disabled={!ready || busy} onClick={()=>handleVault('save')}>Salvar no dispositivo</button><button className="v2-secondary" type="button" disabled={!ready || busy} onClick={()=>handleVault('restore')}>Recuperar rascunho</button></div><p role="status">{message}</p></aside>;
}
