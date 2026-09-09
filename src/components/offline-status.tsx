"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { CloudOff, KeyRound, RefreshCw, ShieldCheck, Wifi, X } from "lucide-react";
import { OfflineVault } from "@/lib/offline/vault";

export function OfflineStatus() {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState("Cofre local bloqueado");
  const [storage, setStorage] = useState("Armazenamento disponível não estimado");
  const [vault, setVault] = useState<OfflineVault | null>(null);

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

  async function unlock() {
    try {
      const nextVault = await OfflineVault.unlock(pin);
      if (online) {
        const response = await fetch("/api/v1/devices/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId: nextVault.deviceId, label: navigator.userAgentData?.platform || navigator.platform || "Dispositivo", platform: navigator.userAgent })
        });
        if (!response.ok) {
          if (response.status === 403) await OfflineVault.purge();
          throw new Error("Este dispositivo não está autorizado para uso offline.");
        }
        await nextVault.markOnlineVerification();
      }
      const queued = await nextVault.queued();
      setVault(nextVault);
      setPending(queued.length);
      setMessage("Dispositivo protegido por até 72 horas offline");
      setPin("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o cofre.");
    }
  }

  async function synchronize() {
    if (!vault || !online) return;
    setMessage("Sincronizando operações...");
    try {
      const operations = await vault.queued();
      if (operations.length > 0) {
        const response = await fetch("/api/v1/sync/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cursor: null, operations }) });
        const body = await response.json() as { results?: Array<{ operationId: string; status: string }> };
        if (!response.ok && response.status !== 409) throw new Error("Falha ao enviar operações.");
        const accepted = (body.results ?? []).filter((item) => item.status === "accepted" || item.status === "duplicate").map((item) => item.operationId);
        await vault.acknowledge(accepted);
      }
      await vault.markOnlineVerification();
      const remaining = await vault.queued();
      setPending(remaining.length);
      setMessage(remaining.length ? `${remaining.length} operação(ões) precisam de atenção` : "Tudo sincronizado agora");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A sincronização será tentada novamente.");
    }
  }

  return <Dialog.Root>
    <Dialog.Trigger asChild><button className="offline-trigger" disabled={!ready} aria-label={online ? (pending ? `${pending} operações pendentes` : "Sincronização") : "Modo offline"}>{online ? <Wifi size={16} /> : <CloudOff size={16} />}<span>{online ? (pending ? `${pending} pendente(s)` : "Sincronização") : "Modo offline"}</span></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="dialog-content" aria-describedby="offline-description">
        <div className="dialog-icon"><ShieldCheck size={22} /></div>
        <Dialog.Title className="dialog-title">Cofre offline deste dispositivo</Dialog.Title>
        <Dialog.Description id="offline-description" className="dialog-description">Rascunhos e operações ficam criptografados e aguardam confirmação do servidor.</Dialog.Description>
        {!vault ? <div className="vault-form"><label htmlFor="offline-pin">PIN local de 6 a 12 dígitos</label><div className="login-input"><KeyRound size={16} /><input id="offline-pin" inputMode="numeric" type="password" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /></div><button className="primary-button" onClick={unlock}>Desbloquear cofre</button></div> : <button className="primary-button" disabled={!online} onClick={synchronize}><RefreshCw size={15} />Sincronizar agora</button>}
        <div className="vault-message" role="status">{message}</div>
        <small className="muted">{storage}. O sistema operacional ainda pode limpar os dados locais; sincronize itens pendentes assim que possível.</small>
        <Dialog.Close className="dialog-close" aria-label="Fechar"><X size={17} /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
