'use client';
import { useEffect, useState } from 'react';
import { OfflineVault } from '@/lib/offline/vault';
import { longitudinalFields, longitudinalHeaders, type LongArea } from '@/lib/epidemiology-longitudinal';
import { addLongFile, cacheLongFile, downloadLongFile, initialLongDraft, loadLongOffline, longPrefix, prepareLongOffline, queueLongJob, resolveLongJob, saveLongDraft, synchronizeLongOffline, type LongDraft, type LongJob, type LongSnapshot } from '@/lib/offline/longitudinal';
import type { WorkspaceContext } from '@/lib/server/workspace';

export function PrepareLongitudinalOffline({ workspace, query, disabled }: { workspace: WorkspaceContext; query: { area: LongArea; month: string; team: string; case?: string }; disabled: boolean }) {
  const [pin, setPin] = useState(''), [message, setMessage] = useState('Prepare este caso ou um novo lançamento online antes de sair da rede.'), [busy, setBusy] = useState(false);
  return <section className="v2-panel v2-section"><h2>Acompanhamento offline completo</h2><p>O snapshot nominal é cifrado neste dispositivo por até 72 horas. Depois de reiniciar sem rede, abra a área offline e informe o PIN. Aprovações e fechamentos continuam provisórios até o servidor confirmar.</p>
    <form autoComplete="off" onSubmit={e => { e.preventDefault(); if (disabled || busy) return; setBusy(true); void (async () => {
      try { const v = OfflineVault.active ?? await OfflineVault.unlock(pin, { userId: workspace.userId, organizationId: workspace.organizationId }); const s = await prepareLongOffline(v, workspace, query); OfflineVault.activate(v); setMessage(`Disponível no cofre cifrado · ${s.scope.month}. Abra a área offline para rascunhos, fila e anexos.`); setPin(''); }
      catch (e) { setMessage(e instanceof Error ? e.message : 'Falha ao preparar. Nada foi descartado.'); } finally { setBusy(false); }
    })(); }}><label className="v2-field">PIN local para preparar acompanhamento<input name="longitudinal-local-pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6,12}" value={pin} onChange={e => setPin(e.target.value)} /></label><button className="v2-secondary" disabled={disabled || busy || !query.team}>Disponibilizar acompanhamento offline</button></form>
    {disabled && <p>Salve ou descarte as edições da tela e conclua o vínculo com a origem online antes de preparar.</p>}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <p><a className="v2-secondary" href="/offline">Abrir acompanhamentos na área offline</a></p><p role="status">{message}</p>
  </section>;
}
type Rows = Awaited<ReturnType<typeof loadLongOffline>>;
export function LongitudinalOfflinePanel({ vault, workspace }: { vault: OfflineVault; workspace: WorkspaceContext }) {
  const [rows, setRows] = useState<Rows>({ snapshots: [], jobs: [], files: [] });
  const [selected, setSelected] = useState<LongSnapshot | null>(null), [draft, setDraft] = useState<LongDraft | null>(null), [baseline, setBaseline] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('Nenhum comando é efetivado antes da confirmação online.');
  const [decision, setDecision] = useState<'KEEP_SERVER' | 'RETRY'>('KEEP_SERVER'), [justification, setJustification] = useState('');
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const access = selected?.data.teams.find(t => t.id === selected.scope.team)?.permissions ?? {};
  const jobs = rows.jobs.filter(j => j.caseId === selected?.caseId), files = rows.files.filter(f => f.snapshotId === selected?.id);
  const pending = jobs.some(j => !['confirmed', 'cancelled'].includes(j.status));
  const frozen = selected?.monthly.currentStatus === 'CLOSED', status = selected?.data.visit?.status ?? 'DRAFT';
  async function refresh() { const next = await loadLongOffline(vault, workspace); setRows(next); return next; }
  useEffect(() => {
    let alive = true; const update = async () => { try { const next = await loadLongOffline(vault, workspace); if (alive) setRows(next); } catch { if (alive) { setRows({ snapshots: [], jobs: [], files: [] }); setSelected(null); setDraft(null); setMessage('Cofre bloqueado. Conteúdo cifrado preservado.'); } } };
    void update(); window.addEventListener('sgc-vault-change', update); return () => { alive = false; window.removeEventListener('sgc-vault-change', update); };
  }, [vault, workspace]);
  useEffect(() => { if (!dirty) return; const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  useEffect(() => {
    const update = async () => {
      if (!selected || dirty) return;
      try { const s = await vault.getRecord<LongSnapshot>(selected.id); if (s) { const d = await vault.getRecord<LongDraft>(s.id + ':draft') ?? initialLongDraft(s); setSelected(s); setDraft(d); setBaseline(JSON.stringify(d)); } } catch { setSelected(null); setDraft(null); }
    };
    window.addEventListener('sgc-longitudinal-sync', update); return () => window.removeEventListener('sgc-longitudinal-sync', update);
  }, [vault, selected, dirty]);
  async function open(s: LongSnapshot) {
    if (dirty) { setMessage('Salve o rascunho cifrado antes de trocar de acompanhamento.'); return; }
    const saved = await vault.getRecord<LongDraft>(s.id + ':draft') ?? initialLongDraft(s); setSelected(s); setDraft(saved); setBaseline(JSON.stringify(saved));
  }
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); try { await action(); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Falha. Cópias preservadas.'); await vault.assertAuthorized().catch(() => { setSelected(null); setDraft(null); setRows({ snapshots: [], jobs: [], files: [] }); }); } finally { setBusy(false); }
  }
  async function prepare(action: string) {
    if (!selected || !draft) return; await queueLongJob(vault, workspace, selected, draft, action); setBaseline(JSON.stringify(draft)); setMessage('Aguardando envio. Preparação cifrada; nenhuma transição foi efetivada.');
  }
  const edit = (key: string, value: string, header = false) => setDraft(d => d ? { ...d, [header ? 'headers' : 'values']: { ...(header ? d.headers : d.values), [key]: value } } : d);
  const labels: Record<LongJob['status'], string> = { pending: 'Aguardando envio', confirmed: 'Confirmado pelo servidor', conflict: 'Conflito — caso bloqueado', failed: 'Falha — cópia preservada', cancelled: 'Preparação cancelada localmente — histórico preservado' };
  return <section className="v2-panel v2-section" aria-label="Acompanhamentos longitudinais offline"><h2>Acompanhamentos longitudinais offline</h2><p>Escopo: conta, UBS, equipe, área, competência e classificação restrita. Os dados são sintéticos, podem estar desatualizados e não são prontuário.</p>
    <p>{rows.snapshots.length} recortes preparados · {rows.jobs.filter(j => !['confirmed', 'cancelled'].includes(j.status)).length} operações aguardando tratamento · {rows.files.filter(f => f.status !== 'confirmed').length} anexos aguardando envio.</p>
    <p role="status">{message}</p>
    <button className="v2-button" disabled={busy || dirty} onClick={() => void run(async () => { await synchronizeLongOffline(vault, workspace); const next = await refresh(); if (selected) { const s = next.snapshots.find(s => s.id === selected.id); if (s) { const d = await vault.getRecord<LongDraft>(s.id + ':draft') ?? initialLongDraft(s); setSelected(s); setDraft(d); setBaseline(JSON.stringify(d)); } } setMessage('Sincronização concluída. Confira confirmações, anexos e conflitos; nenhum item foi descartado.'); })}>Sincronizar acompanhamentos e anexos</button>
    {rows.snapshots.length === 0 && <p>Online, abra um acompanhamento e use “Disponibilizar acompanhamento offline”.</p>}
    <div className="dialog-actions">{rows.snapshots.map(s => <button className="v2-secondary" disabled={busy} key={s.id} onClick={() => void run(() => open(s))}>{s.scope.area} · {s.scope.month} · {String(s.data.selected?.initial.name ?? 'Novo caso preparado')}</button>)}</div>
    {selected && draft && <section aria-label="Formulário longitudinal cifrado"><h3>{selected.scope.area} · {selected.scope.month}</h3><p>Equipe: {selected.data.teams.find(t => t.id === selected.scope.team)?.name} · preparado em {new Date(selected.preparedAt).toLocaleString('pt-BR')} · versão {selected.data.visit?.version ?? 0} · {frozen ? 'Competência fechada' : 'Snapshot não atualizado sem conexão'}</p>
      <p>{dirty ? 'Alterações da tela ainda não salvas' : 'Rascunho recuperado / salvo neste dispositivo'}</p>
      {draft.baseVersion !== (selected.data.visit?.version ?? 0) && <p role="alert">Este rascunho preserva uma versão anterior. Nenhuma atualização de versão será presumida; o servidor deverá verificar o conflito.</p>}
      <fieldset disabled={busy || pending || frozen || status !== 'DRAFT' || !access.save}><legend>Campos do acompanhamento</legend><div className="v2-form-grid">{longitudinalFields(selected.scope.area).map(f => <label className="v2-field" key={f.key}>{f.label}<input type={f.type === 'integer' ? 'number' : f.type === 'date' ? 'date' : 'text'} min={f.type === 'integer' ? 0 : undefined} step={f.type === 'integer' ? 1 : undefined} maxLength={1000} value={draft.values[f.key] ?? ''} onChange={e => edit(f.key, e.target.value)} /></label>)}</div><h4>Cabeçalho ESF</h4><div className="v2-form-grid">{longitudinalHeaders(selected.scope.area).map(f => <label className="v2-field" key={f.key}>{f.label}<input type={f.type === 'date' ? 'date' : 'text'} maxLength={1000} value={draft.headers[f.key] ?? ''} onChange={e => edit(f.key, e.target.value, true)} /></label>)}</div></fieldset>
      <label className="v2-field">Justificativa da operação offline<textarea maxLength={500} disabled={busy || pending} value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label>
      {!selected.monthly.total && <label><input type="checkbox" checked={draft.noActivity} disabled={busy || pending} onChange={e => setDraft({ ...draft, noActivity: e.target.checked })} />Declaro ausência de atividade nesta equipe/competência, com justificativa.</label>}
      <div className="dialog-actions"><button className="v2-secondary" disabled={busy || pending} onClick={() => void run(async () => { await saveLongDraft(vault, workspace, selected, draft); setBaseline(JSON.stringify(draft)); setMessage('Salvo neste dispositivo, cifrado. O servidor ainda não recebeu esta cópia.'); })}>Salvar rascunho longitudinal cifrado</button>
        {!frozen && status === 'DRAFT' && access.save && <button className="v2-button" disabled={busy || pending} onClick={() => void run(() => prepare('save'))}>Preparar gravação longitudinal</button>}
        {selected.data.visit && !frozen && !dirty && (status === 'DRAFT' && access.save ? [['submit', 'Preparar envio à UBS']] : status === 'SUBMITTED' && access.review ? [['review', 'Preparar revisão da UBS']] : status === 'REVIEWED' && access.validate ? [['validate', 'Preparar validação técnica']] : status === 'VALIDATED' && access.close ? [['close', 'Preparar fechamento do acompanhamento']] : []).map(([action, label]) => <button className="v2-secondary" key={action} disabled={busy || pending} onClick={() => void run(() => prepare(action))}>{label}</button>)}
        {selected.data.visit && !frozen && ['SUBMITTED', 'REVIEWED', 'VALIDATED'].includes(status) && (access.review || access.validate) && <button disabled={busy || pending || dirty || draft.reason.trim().length < 10} className="v2-secondary" onClick={() => void run(() => prepare('return'))}>Preparar devolução</button>}
        {selected.data.visit && !frozen && status === 'CLOSED' && access.close && <button disabled={busy || pending || dirty || draft.reason.trim().length < 10} className="v2-secondary" onClick={() => void run(() => prepare('reopen'))}>Preparar reabertura do acompanhamento</button>}
        {access.close && <button className="v2-secondary" disabled={busy || pending || dirty || (frozen ? draft.reason.trim().length < 10 : selected.monthly.pending > 0 || !selected.monthly.total && (!draft.noActivity || draft.reason.trim().length < 10))} onClick={() => void run(() => prepare(frozen ? 'month-reopen' : 'month-close'))}>{frozen ? 'Preparar reabertura mensal' : 'Preparar fechamento mensal'}</button>}
      </div>
      <h4>Anexos cifrados deste acompanhamento</h4><label className="v2-field">Adicionar comprovante sintético (PDF, PNG, JPEG; até 25 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy || pending || frozen || status !== 'DRAFT' || !access.save} onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { await addLongFile(vault, workspace, selected, file); setMessage('Anexo salvo cifrado neste dispositivo. Ainda não enviado.'); }); e.target.value = ''; }} /></label>
      {files.map(f => <p key={f.id}>{f.fileName} · {f.status === 'confirmed' ? 'Confirmado pelo servidor / cópia cifrada disponível' : f.error ?? 'Aguardando envio'} <button className="v2-secondary" disabled={busy} onClick={() => void run(() => downloadLongFile(vault, workspace, f))}>Abrir cópia local</button></p>)}
      {selected.attachments.filter(a => a.status === 'AVAILABLE' && !files.some(f => f.id === a.id)).map(a => <p key={a.id}>{a.file_name} <button className="v2-secondary" disabled={busy} onClick={() => void run(() => cacheLongFile(vault, workspace, selected, a.id))}>Disponibilizar anexo cifrado</button></p>)}
    </section>}
    <h3>Fila longitudinal e conflitos</h3>{rows.jobs.map(job => <section className="v2-section" key={job.id}><h4>{job.request.command.area} · {job.request.command.month} · {job.request.command.action}</h4><p>{labels[job.status]}</p>{job.error && <p>{job.error}</p>}
      {job.status === 'failed' && job.definitiveFailure && <button className="v2-secondary" disabled={busy} onClick={() => void run(async () => { await vault.putRecord(longPrefix(workspace) + 'job:' + job.id, { ...job, status: 'cancelled', error: 'Preparação cancelada após rejeição definitiva do servidor. Envelope preservado.' }); setMessage('A preparação rejeitada foi preservada. Revise o rascunho antes de criar outra operação.'); })}>Cancelar preparação rejeitada, preservando cópia</button>}
      {job.status === 'conflict' && <><h4>Versão preparada neste dispositivo</h4><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(job.request.command, null, 2)}</pre><h4>Versão consultada no servidor</h4><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(job.result?.server, null, 2)}</pre>
{rows.snapshots.find(s => s.id === job.snapshotId)?.data.teams.find(t => t.id === job.request.team)?.permissions.close ? <form onSubmit={e => { e.preventDefault(); void run(async () => { await resolveLongJob(vault, workspace, job, decision, justification); setMessage('Decisão confirmada e auditada; envelope original preservado.'); setJustification(''); setSelected(null); setDraft(null); setBaseline(''); }); }}><label className="v2-field">Decisão sobre o conflito longitudinal<select aria-label="Decisão sobre o conflito longitudinal" value={decision} disabled={busy || !!job.resolution} onChange={e => setDecision(e.target.value as typeof decision)}><option value="KEEP_SERVER">Manter servidor e encerrar tentativa</option><option value="RETRY">Reavaliar comando original com a versão atual</option></select></label><label className="v2-field">Justificativa da resolução longitudinal<textarea required minLength={10} maxLength={500} value={justification} onChange={e => setJustification(e.target.value)} /></label><button className="v2-button" disabled={busy || justification.trim().length < 10}>Confirmar resolução longitudinal auditada</button></form> : <p>Reconecte com um responsável autorizado para resolver. As duas versões foram preservadas.</p>}
      </>}
    </section>)}
  </section>;
}
