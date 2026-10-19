'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { epiCoverage, type EpiMonthReport } from '@/lib/epidemiology-monthly';
import type { EpiTeam } from '@/lib/epidemiology';

export function EpidemiologyMonthly({ report, area, month, teams, blocked, municipal, initialTeam, onPendingChange, onTeamChange }: { report?: EpiMonthReport; area: string; month: string; teams: EpiTeam[]; blocked: boolean; municipal: boolean; initialTeam?: string; onPendingChange?: (pending: boolean) => void; onTeamChange?: (team: string) => void }) {
  const router = useRouter();
  const [selected, setSelected] = useState(teams.find(t => t.id === initialTeam)?.id ?? teams[0]?.id ?? '');
  const [reason, setReason] = useState(''); const [noActivity, setNoActivity] = useState(false);
  const [pending, setPending] = useState<{ body: string; action: string } | null>(null);
  const [navigating, startNavigation] = useTransition();
  const [sending, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const busy = sending || navigating;
  useEffect(() => {
    onPendingChange?.(!!pending || busy || reason.length > 0 || noActivity);
    return () => onPendingChange?.(false);
  }, [onPendingChange, pending, busy, reason, noActivity]);
  useEffect(() => {
    if (!pending) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [pending]);
  if (!report) return <section className="v2-panel v2-section"><h2>Fechamento mensal</h2><p role="alert">Não foi possível consultar as revisões mensais. Nenhum fechamento foi presumido.</p><button className="v2-secondary" onClick={() => router.refresh()}>Tentar consultar novamente</button></section>;
  const row = report.teams.find(t => t.teamId === selected);
  const nominal = !!teams.find(t => t.id === selected)?.permissions.view;
  const query = (scope: string, restricted = false, revision?: number) => new URLSearchParams({ area, month, scope, ...(scope === 'team' ? { team: selected } : {}), ...(restricted ? { nominal: 'true' } : {}), ...(revision ? { revision: String(revision) } : {}) }).toString();
  const protect = (e: React.SyntheticEvent) => { if (blocked || busy || pending) { e.preventDefault(); setError('Conclua o envio ou salve as edições antes de abrir o relatório.'); } };
  const links = (scope: string, restricted = false, revision?: number) => <div className="dialog-actions"><Link prefetch={false} onClick={protect} className="v2-secondary" href={'/vigilancia/relatorio?' + query(scope, restricted, revision)}>PDF / impressão</Link><a onClick={protect} className="v2-secondary" href={'/api/v1/epidemiology/export?' + query(scope, restricted, revision)}>Baixar Excel</a></div>;
  async function command(action: string) {
    if (!row || blocked) return;
    if (!pending && !window.confirm(action === 'close' ? 'Fechar esta equipe, área e competência? Os registros serão bloqueados e a revisão preservada.' : 'Reabrir esta competência? O relatório anterior será preservado; o atual voltará a ser provisório.')) return;
    const body = pending?.body ?? JSON.stringify({ action, area, month, team: selected, operationId: crypto.randomUUID(), expectedVersion: row.version, deviceId: crypto.randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true, noActivity, reason });
    setPending({ body, action }); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/v1/epidemiology/monthly', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const data = await response.json();
      if (!response.ok) { setPending(null); throw new Error(data.error || 'Comando não confirmado.'); }
      setPending(null); setReason(''); setNoActivity(false); setMessage(`Confirmado pelo servidor: ${data.status === 'CLOSED' ? 'fechado' : 'reaberto'} · revisão ${data.revision}.`); startNavigation(() => router.refresh());
    } catch (e) { setError(e instanceof TypeError ? 'Falha de conexão. Use o mesmo comando para consultar a confirmação sem duplicar o fechamento.' : e instanceof Error ? e.message : 'Envio não confirmado.'); }
    finally { setBusy(false); }
  }
  return <section className="v2-panel v2-section epi-monthly" aria-label="Fechamento e relatórios mensais">
    <h2>Fechamento mensal e relatórios · {month}</h2>
    <p>{epiCoverage(report)}. As equipes sem lançamentos continuam pendentes até declaração explícita.</p>
    <p className="v2-muted">O fechamento exige validação técnica de todos os registros da equipe. Fecha somente esta área e competência; não transforma contagens em casos confirmados. Relatórios não usam o filtro de situação nem a paginação da lista.</p>
    <details><summary>Relatório consolidado da UBS (sem nomes)</summary>{links('unit')}</details>
    {municipal && <details><summary>Relatório consolidado municipal (sem nomes)</summary>{links('municipal')}</details>}
    {row && <>
      <label>Equipe do fechamento<select aria-label="Equipe do fechamento" value={selected} disabled={busy || blocked || !!pending || !!onTeamChange && (!!reason || noActivity)} onChange={e => { if (onTeamChange) { onTeamChange(e.target.value); return; } setSelected(e.target.value); setReason(''); setNoActivity(false); setError(''); setMessage(''); }}>{report.teams.map(t => <option key={t.teamId} value={t.teamId}>{t.teamName}</option>)}</select></label>
      <p><strong>{row.currentStatus === 'CLOSED' ? 'Competência fechada' : 'Em preenchimento'}</strong> · versão {row.version} · última revisão {row.revision || 'nenhuma'} · {row.total} registros · {row.pending} sem validação</p>
      {row.currentStatus === 'CLOSED' && <p>Alterações, novos registros e reabertura de registros estão bloqueados até reabertura mensal autorizada.</p>}
      <details><summary>Relatórios da equipe {nominal ? '(consolidado ou nominal restrito)' : '(somente consolidado)'}</summary><p>Consolidado sem nomes</p>{links('team')}{nominal && <><p>Nominal restrito — consulta e exportação auditadas</p>{links('team', true)}</>}</details>
      {row.canClose && <div className="v2-section">
        <label>Justificativa do fechamento ou reabertura<textarea value={reason} maxLength={500} disabled={busy || !!pending} onChange={e => setReason(e.target.value)} /></label>
        {row.currentStatus !== 'CLOSED' && !row.total && <label className="epi-checkbox"><input type="checkbox" checked={noActivity} disabled={busy || !!pending} onChange={e => setNoActivity(e.target.checked)} />Confirmo ausência de atividade nesta equipe, área e competência (exige justificativa).</label>}
        <button className="v2-button" disabled={busy || blocked || (!pending && (row.currentStatus === 'CLOSED' ? reason.trim().length < 10 : row.pending > 0 || !row.total && (!noActivity || reason.trim().length < 10)))} onClick={() => void command(pending?.action ?? (row.currentStatus === 'CLOSED' ? 'reopen' : 'close'))}>{busy ? 'Aguardando confirmação…' : pending ? 'Tentar novamente o mesmo comando mensal' : row.currentStatus === 'CLOSED' ? 'Reabrir competência da equipe' : 'Fechar competência da equipe'}</button>
        {row.pending > 0 && <p>Revise e valide os registros pendentes antes do fechamento.</p>}
      </div>}
      {!!row.revisions.length && <details><summary>Revisões fechadas preservadas ({row.revisions.length})</summary>{row.revisions.map(r => <div key={r.revision}><p>Revisão {r.revision} · {new Date(r.closedAt).toLocaleString('pt-BR')} · responsável {r.closedBy}</p>{links('team', nominal, r.revision)}</div>)}</details>}
    </>}
    {error && <p role="alert" className="v2-alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
