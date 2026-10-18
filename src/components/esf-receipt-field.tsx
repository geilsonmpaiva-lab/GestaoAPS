'use client';
import { useState } from 'react';
export function EsfReceiptField({ mapId, teamId, version, value, change, disabled }: { mapId?: string; teamId: string; version: number; value: string; change: (id: string) => void; disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null), [fileId, setFileId] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function upload() {
    if (!file || !mapId) return;
    setBusy(true); setMessage('');
    try {
      const body = new FormData(); body.set('file', file); body.set('entityId', mapId); body.set('teamId', teamId); body.set('expectedVersion', String(version)); body.set('fileId', fileId); body.set('synthetic', 'true');
      const response = await fetch('/api/v1/esf/maps/receipt', { method: 'POST', body }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível confirmar o comprovante.');
      change(result.id); setFile(null); setMessage('Comprovante sintético confirmado. Adicione/atualize a linha e confirme o mapa para vinculá-lo.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha no envio; selecione novamente somente se desejar substituir o arquivo.'); }
    finally { setBusy(false); }
  }
  return <div><input aria-label="Selecionar comprovante sintético" type="file" accept="application/pdf,image/png,image/jpeg" disabled={disabled || busy || !mapId} onChange={e => { const next = e.target.files?.[0]; if (next) { setFile(next); setFileId(crypto.randomUUID()); change(''); setMessage('Arquivo selecionado neste navegador; ainda não enviado nem protegido pelo cofre offline.'); } }} />
    {!mapId && <small>Confirme primeiro o mapa no servidor para habilitar anexos.</small>}
    <small>Somente comprovante fictício, sem assinatura ou dados reais. PDF, PNG ou JPEG de até 2 MB.</small>
    {file && <button className="v2-secondary" type="button" disabled={disabled || busy} onClick={upload}>{busy ? 'Enviando…' : 'Enviar comprovante sintético'}</button>}
    {value && mapId && <a href={`/api/v1/esf/maps/receipt?entityId=${mapId}&teamId=${teamId}&fileId=${value}`} target="_blank" rel="noreferrer">Baixar comprovante confirmado</a>}
    <p role="status">{message}</p></div>;
}
