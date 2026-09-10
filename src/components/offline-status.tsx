"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { CloudOff, KeyRound, RefreshCw, ShieldCheck, Wifi, X } from "lucide-react";
import { OfflineVault } from "@/lib/offline/vault";
import type { WorkspaceContext } from "@/lib/server/workspace";
import type { SavedDraft } from "./draft-tools";
import Link from "next/link";
import { safeReturnTo } from "@/lib/ui-labels";

export function OfflineStatus({workspace}: {workspace?:WorkspaceContext}) {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState("Cofre local bloqueado");
  const [storage, setStorage] = useState("Armazenamento disponível não estimado");
  const [vault, setVault] = useState<OfflineVault | null>(null);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    navigator.storage?.estimate().then(({ quota = 0, usage = 0 }) => {
      const available = Math.max(0, quota - usage) / 1024 / 1024;
      setStorage(`${available.toFixed(0)} MB disponíveis neste navegador`);
    }).catch(() => undefined);
    return () => { window.clearTimeout(readyTimer); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const active = OfflineVault.active;
      if (!active) { setVault(null); setDrafts([]); return; }
      try {
        if (workspace) await active.assertIdentity(workspace.userId,workspace.organizationId);
        setPending((await active.queued()).length); setVault(active);
        if (workspace) setDrafts((await active.listRecords<SavedDraft>(`draft:${workspace.userId}:${workspace.organizationId}:${workspace.unitId ?? 'org'}:`)).map(r=>r.value));
      } catch { setVault(null); setDrafts([]); setMessage('Desbloqueie e valide o cofre para continuar.'); }
    };
    void refresh();
    window.addEventListener('sgc-vault-change',refresh);
    return () => window.removeEventListener('sgc-vault-change',refresh);
  },[workspace]);

  async function verifyDevice(nextVault:OfflineVault) {
    const response = await fetch('/api/v1/devices/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:nextVault.deviceId,organizationId:workspace?.organizationId,label:'Dispositivo de trabalho',platform:navigator.userAgent.slice(0,240)})});
    if (!response.ok) throw new Error('Dispositivo não autorizado. Entre novamente ou contate a administração. Nenhum item pendente foi descartado.');
    await nextVault.markOnlineVerification();
  }

  async function unlock() {
    setBusy(true);
    try {
      const nextVault = await OfflineVault.unlock(pin,workspace ? {userId:workspace.userId,organizationId:workspace.organizationId} : undefined);
      if (online) {
        await verifyDevice(nextVault);
      }
      if (workspace) await nextVault.assertIdentity(workspace.userId,workspace.organizationId);
      const queued = await nextVault.queued();
      OfflineVault.activate(nextVault);
      setVault(nextVault);
      setPending(queued.length);
      setMessage("Dispositivo protegido por até 72 horas offline");
      setPin("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o cofre.");
    } finally {setBusy(false);}
  }

  async function synchronize() {
    if (!vault || !online || busy) return;
    setBusy(true);
    setMessage("Sincronizando operações...");
    try {
      await verifyDevice(vault);
      if (workspace) await vault.assertIdentity(workspace.userId,workspace.organizationId);
      const operations = await vault.queued();
      for (let offset=0;offset<operations.length;offset+=100) {
        const response = await fetch("/api/v1/sync/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cursor: null, operations:operations.slice(offset,offset+100) }) });
        const body = await response.json() as { results?: Array<{ operationId: string; status: string; serverVersion?:number; reason?:string }> };
        if (!response.ok && response.status !== 409) throw new Error("Falha ao enviar operações.");
        const accepted = (body.results ?? []).filter((item) => item.status === "accepted" || (item.status === "duplicate" && typeof item.serverVersion === 'number' && !item.reason)).map((item) => item.operationId);
        await vault.acknowledge(accepted);
      }
      const remaining = await vault.queued();
      setPending(remaining.length);
      setMessage(remaining.length ? `${remaining.length} operação(ões) com falha ou conflito. Itens preservados para revisão.` : "Fila enviada. Rascunhos locais precisam ser abertos e confirmados separadamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A sincronização será tentada novamente.");
    } finally {setBusy(false);}
  }

  return <Dialog.Root>
    <Dialog.Trigger asChild><button className="offline-trigger" disabled={!ready} aria-label={online ? (pending ? `${pending} operações pendentes` : "Sincronização") : "Modo offline"}>{online ? <Wifi size={16} /> : <CloudOff size={16} />}<span>{online ? (pending ? `${pending} pendente(s)` : "Sincronização") : "Modo offline"}</span></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className={workspace?.uxV2 ? "ux-v2 v2-dialog" : "dialog-content"} aria-describedby="offline-description">
        <div className="dialog-icon"><ShieldCheck size={22} /></div>
        <Dialog.Title className="dialog-title">Cofre offline deste dispositivo</Dialog.Title>
        <Dialog.Description id="offline-description" className="dialog-description">Rascunhos e operações ficam criptografados e aguardam confirmação do servidor.</Dialog.Description>
        {!vault ? <div className="vault-form"><label htmlFor="offline-pin">PIN local de 6 a 12 dígitos</label><div className="login-input"><KeyRound size={16} /><input id="offline-pin" inputMode="numeric" type="password" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></div><button className="primary-button" disabled={busy} onClick={unlock}>Desbloquear cofre</button></div> : <button className="primary-button" disabled={!online || busy} onClick={synchronize}><RefreshCw size={15} />Sincronizar agora</button>}
        {drafts.length>0 && <section><h3>Rascunhos nesta UBS ({drafts.length})</h3><ul>{drafts.map((draft,i)=><li key={i}><Dialog.Close asChild><Link href={safeReturnTo(draft.href)}>{draft.title}</Link></Dialog.Close> — salvo {new Date(draft.updatedAt).toLocaleString('pt-BR')}</li>)}</ul></section>}
        <div className="vault-message" role="status">{message}</div>
        <small className="muted">{storage}. O sistema operacional ainda pode limpar os dados locais; sincronize itens pendentes assim que possível.</small>
        <Dialog.Close className="dialog-close" aria-label="Fechar"><X size={17} /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
