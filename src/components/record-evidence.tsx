"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/client/supabase";
import type { DetailRow } from "@/lib/server/record-detail";

export function RecordEvidence({ entityType, entityId, organizationId, unitId, attachments, canUpload }: { entityType: string; entityId: string; organizationId: string; unitId: string | null; attachments: DetailRow[]; canUpload: boolean }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<{ id: string; file: File; path: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file || busy) return;
    setBusy(true); setMessage("Preparando arquivo…");
    try {
      if (file.size > 26214400) throw new Error("O arquivo deve ter no máximo 25 MB.");
      if (!navigator.onLine) throw new Error("Conecte-se para enviar esta evidência. O arquivo continua selecionado.");
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
      if (pending.current?.file !== file) {
        const id = crypto.randomUUID();
        const response = await fetch("/api/v1/evidence/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attachmentId: id, organizationId, unitId, entityType, entityId, fileName: file.name, contentType: file.type, byteSize: file.size, sha256, classification: "INTERNAL" }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Não foi possível reservar a evidência.");
        pending.current = { id, file, path: result.path, token: result.token };
      }
      const reservation = pending.current;
      setMessage("Enviando arquivo…");
      const client = createSupabaseBrowserClient();
      const uploadResult = await client.storage.from("evidence").uploadToSignedUrl(reservation.path, reservation.token, file);
      if (uploadResult.error && !/already exists|duplicate/i.test(uploadResult.error.message)) throw new Error("O envio foi interrompido. Tente novamente mantendo o arquivo selecionado.");
      setMessage("Verificando integridade…");
      const response = await fetch(`/api/v1/evidence/${reservation.id}/finalize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 1 }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "A evidência ainda não foi confirmada. Tente novamente.");
      pending.current = null;
      setMessage("Evidência enviada e integridade confirmada."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível enviar o arquivo."); }
    finally { setBusy(false); }
  }
  async function download(id: string) {
    try {
      const response = await fetch(`/api/v1/evidence/${id}/download-url`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível abrir a evidência.");
      window.location.assign(result.signedUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao abrir arquivo."); }
  }
  return <section className="panel detail-section"><h2>Evidências</h2>{attachments.length ? <ul>{attachments.map(row => <li key={row.id}><button className="link-button" disabled={row.status !== "AVAILABLE"} onClick={() => download(row.id)}>{String(row.file_name)} — {row.status === "AVAILABLE" ? "Abrir arquivo verificado" : "Envio pendente"}</button></li>)}</ul> : <p>Nenhuma evidência vinculada.</p>}
    {canUpload && <form className="detail-form" onSubmit={upload}><label>Arquivo de evidência<input ref={fileInput} type="file" required accept="application/pdf,image/jpeg,image/png,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label><small>PDF, imagem, CSV ou XLSX, até 25 MB. Use apenas conteúdo institucional autorizado.</small><button className="primary-button" disabled={busy}>{busy ? "Enviando…" : "Enviar evidência"}</button></form>}{message && <p role="status">{message}</p>}</section>;
}
