'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OfflineVault } from '@/lib/offline/vault';
import { workPrefix, type PendingWork } from '@/lib/offline/work';
import type { WorkspaceContext } from '@/lib/server/workspace';
import type { SavedDraft } from './draft-tools';
import { safeReturnTo } from '@/lib/ui-labels';
import { attachmentPrefix, type PendingAttachment } from '@/lib/offline/attachments';

export function ApsLocalWork({ workspace }: { workspace: WorkspaceContext }) {
  const [state, setState] = useState<{ drafts: SavedDraft[]; pending: number; locked: boolean }>({ drafts: [], pending: 0, locked: true });
  useEffect(() => {
    let live = true;
    const read = async () => {
      const vault = OfflineVault.active;
      if (!vault) { if (live) setState({ drafts: [], pending: 0, locked: true }); return; }
      try {
        await vault.assertIdentity(workspace.userId, workspace.organizationId);
        const [drafts, work, attachments] = await Promise.all([vault.listRecords<SavedDraft>(`draft:${workspace.userId}:${workspace.organizationId}:${workspace.unitId ?? 'org'}:`), vault.listRecords<PendingWork>(workPrefix(workspace)), vault.listRecords<PendingAttachment>(attachmentPrefix(workspace))]);
        if (live) setState({ drafts: drafts.map(d => d.value), pending: work.filter(w => w.value.status !== 'confirmed').length + attachments.filter(a => a.value.status !== 'confirmed').length, locked: false });
      } catch { if (live) setState({ drafts: [], pending: 0, locked: true }); }
    };
    void read(); window.addEventListener('sgc-vault-change', read);
    return () => { live = false; window.removeEventListener('sgc-vault-change', read); };
  }, [workspace]);
  return <div className="aps-local-work">{state.locked ? <p>Para recuperar rascunhos, abra “Sincronização” e desbloqueie este dispositivo.</p> : <><p>{state.drafts.length} rascunho(s) · {state.pending} comando(s) e anexo(s) pendente(s) desta UBS</p>{state.drafts.slice(0, 3).map((draft, i) => <Link className="aps-inline-action" key={i} href={safeReturnTo(draft.href)}>Continuar: {draft.title}</Link>)}</>}<Link className="aps-inline-action" href="/offline">Consultar todas as filas e rascunhos do dispositivo</Link></div>;
}
