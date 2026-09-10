'use client';
import { useRef, useState } from 'react';
import type { WorkspaceContext } from '@/lib/server/workspace';
type Member = { userId: string; name: string; assigned: boolean; version: number; canAssign: boolean };
export function EsfTeamAccess({ teamId, workspace }: { teamId: string; workspace: WorkspaceContext }) {
  const [members, setMembers] = useState<Member[] | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const pending = useRef<{ fingerprint: string; operationId: string } | null>(null);
  async function load() {
    const response = await fetch(`/api/v1/esf/teams/access?team=${teamId}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao consultar vínculos.');
    setMembers(data.members);
  }
  async function open() { setBusy(true); setMessage(''); try { await load(); } catch(e) { setMessage(e instanceof Error ? e.message : 'Falha na consulta.'); } finally { setBusy(false); } }
  async function assign(member: Member) {
    setBusy(true); setMessage('');
    try {
      const input = { organizationId: workspace.organizationId, unitId: workspace.unitId, teamId, userId: member.userId, expectedVersion: member.version, enabled: !member.assigned };
      const fingerprint = JSON.stringify(input);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, operationId: crypto.randomUUID() };
      const response = await fetch('/api/v1/esf/teams/access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, operationId: pending.current.operationId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao alterar vínculo.');
      if (data.mode === 'demo') { setMembers(members!.map(m => m.userId === member.userId ? { ...m, assigned: !m.assigned, version: m.version + 1 } : m)); setMessage('Vínculo simulado. Nenhuma permissão real foi alterada.'); }
      else { await load(); setMessage('Vínculo atualizado. O perfil e as permissões de domínio foram preservados.'); }
      pending.current = null;
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Falha no vínculo.'); } finally { setBusy(false); }
  }
  return <div><button className="v2-secondary" type="button" disabled={busy} onClick={open}>Gerenciar acessos da equipe</button>{members && <div><p className="v2-muted">Somente usuários já autorizados à produção nesta UBS. Vincular à equipe não cria conta nem amplia operações. Gerentes autorizados já têm visão da UBS.</p>{members.length === 0 && <p>Nenhum usuário elegível. Revise os vínculos em Administração → Usuários.</p>}{members.map(member => <div className="v2-record" key={member.userId}><span>{member.name} · {member.assigned ? 'Vinculado' : 'Não vinculado'}</span><button type="button" className="v2-secondary" disabled={busy || (!member.assigned && !member.canAssign)} onClick={() => assign(member)}>{member.assigned ? 'Remover da equipe' : 'Vincular à equipe'}</button></div>)}</div>}<p role="status">{message}</p></div>;
}
