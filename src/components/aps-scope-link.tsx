'use client';
import { useState } from 'react';
export function ApsScopeLink({ organizationId, unitId, href }: { organizationId: string; unitId: string; href: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function open() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/v1/workspace/scope', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, unitId }) });
      if (!response.ok) throw new Error();
      window.location.assign(href);
    } catch { setError('Não foi possível abrir esta UBS. Confira seu acesso e tente novamente.'); setBusy(false); }
  }
  return <div><button className="v2-secondary" disabled={busy} onClick={open}>{busy ? 'Abrindo UBS…' : 'Abrir relatório da UBS'}</button>{error && <p role="alert">{error}</p>}</div>;
}
