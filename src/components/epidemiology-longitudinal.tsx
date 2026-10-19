'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DraftTools } from './draft-tools';
import { epiStates } from '@/lib/epidemiology';
import { longitudinalFields, longitudinalHeaders, longitudinalDoubts, type LongData, type LongArea, type LongReport, type LongField } from '@/lib/epidemiology-longitudinal';
import type { WorkspaceContext } from '@/lib/server/workspace';

export function EpidemiologyLongitudinal({ workspace, data, report, filters }: { workspace: WorkspaceContext; data: LongData & { municipal?: boolean }; report: LongReport | null; filters: { area: LongArea; month: string; team?: string; case?: string; source?: string; page: number } }) {
  const router = useRouter(); const [navigating, startNavigation] = useTransition();
  const [ids] = useState(() => ({ caseId: data.selected?.id ?? crypto.randomUUID(), entityId: data.visit?.id ?? crypto.randomUUID(), deviceId: crypto.randomUUID() }));
  const identityKeys = ['name', 'caseReference', 'notificationDate', 'notificationNumber', 'residenceCity', 'sinan', 'classification', 'contacts'];
  const initial = data.visit?.payload ?? Object.fromEntries(Object.entries(data.selected?.initial ?? data.source?.payload ?? {}).filter(([key]) => identityKeys.includes(key)));
  if (!data.visit && data.source?.payload.date) initial.notificationDate = data.source.payload.date;
  const asStrings = (v: Record<string, string | number>) => Object.fromEntries(Object.entries(v).map(([k, val]) => [k, String(val)]));
  const [values, setValues] = useState<Record<string, string>>(asStrings(initial));
  const [headers, setHeaders] = useState<Record<string, string>>(data.visit?.headers ?? {});
  const [baseline, setBaseline] = useState(JSON.stringify({ values: asStrings(initial), headers: data.visit?.headers ?? {} }));
  const [reason, setReason] = useState(''); const [noActivity, setNoActivity] = useState(false);
  const [pending, setPending] = useState<{ action: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const teamId = filters.team ?? data.selected?.team_id ?? data.source?.team_id ?? data.teams[0]?.id ?? '';
  const team = data.teams.find(t => t.id === teamId), monthly = report?.teams.find(t => t.teamId === teamId);
  const frozen = monthly?.currentStatus === 'CLOSED'; const status = data.visit?.status ?? 'DRAFT';
  const dirty = JSON.stringify({ values, headers }) !== baseline;
  const blocked = busy || navigating || !!pending;
  const url = (extra: Record<string, string> = {}) => '/vigilancia/acompanhamentos?' + new URLSearchParams({ area: filters.area, month: filters.month, ...(teamId ? { team: teamId } : {}), ...extra });
  const fields = longitudinalFields(filters.area), headFields = longitudinalHeaders(filters.area);
  useEffect(() => {
    if (!dirty && !pending && !reason && !busy) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const guard = (e: MouseEvent) => { if (e.target instanceof Element && e.target.closest('a[href]')) { e.preventDefault(); e.stopPropagation(); setError('Salve uma cópia no dispositivo ou descarte explicitamente as edições antes de sair.'); } };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', guard, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', guard, true); };
  }, [dirty, pending, reason, busy]);
  async function command(action: string) {
    if (!teamId || busy || navigating) return;
    if (pending && pending.action !== action) return;
    if (action.startsWith('month-') && !pending && !window.confirm(action === 'month-close' ? 'Fechar a competência com todos os registros de origem e acompanhamentos? A revisão será preservada.' : 'Reabrir a competência preservando o relatório fechado anterior?')) return;
    const payload = Object.fromEntries(fields.filter(f => values[f.key] !== undefined && values[f.key] !== '').map(f => [f.key, f.type === 'integer' ? Number(values[f.key]) : values[f.key]]));
    const body = pending?.body ?? JSON.stringify({ action, area: filters.area, month: filters.month, teamId, ...ids, ...(data.source && !data.selected ? { sourceId: data.source.id } : {}), expectedVersion: action.startsWith('month-') ? monthly?.version ?? 0 : data.visit?.version ?? 0, operationId: crypto.randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true, reason, noActivity, payload, headers: Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== '')) });
    setPending({ action, body }); setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/v1/epidemiology/longitudinal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const result = await response.json();
      if (!response.ok) { if (response.status < 500 && response.status !== 409) setPending(null); throw new Error(result.error || 'Comando não confirmado.'); }
      setPending(null); setReason(''); setNoActivity(false); setBaseline(JSON.stringify({ values, headers }));
      setMessage('Confirmado pelo servidor. Histórico e versões anteriores preservados.');
      startNavigation(() => { if (!action.startsWith('month-')) router.replace(url({ case: ids.caseId })); router.refresh(); });
    } catch (e) { setError(e instanceof TypeError ? 'Sem confirmação de rede. Preserve a cópia cifrada e repita o mesmo comando quando conectado.' : e instanceof Error ? e.message : 'Falha. Edições preservadas.'); }
    finally { setBusy(false); }
  }
  function input(field: LongField, head = false) {
    const source = head ? headers : values, update = head ? setHeaders : setValues;
    return <label className="v2-field" key={field.key}><span>{field.label}</span><input type={field.type === 'integer' ? 'number' : field.type === 'date' ? 'date' : 'text'} min={field.type === 'integer' ? 0 : undefined} step={field.type === 'integer' ? 1 : undefined} maxLength={1000} value={source[field.key] ?? ''} disabled={blocked || frozen || !team?.permissions.save || status !== 'DRAFT'} onChange={e => update(v => ({ ...v, [field.key]: e.target.value }))} /></label>;
  }
  const reportQuery = (scope: string, nominal = false, revision?: number) => new URLSearchParams({ area: filters.area, month: filters.month, scope, ...(scope === 'team' ? { team: teamId } : {}), ...(nominal ? { nominal: 'true' } : {}), ...(revision ? { revision: String(revision) } : {}) });
  return <>
    <p className="v2-alert">Somente dados sintéticos. Um caso permanece o mesmo entre competências; cada acompanhamento tem sua própria versão. Novos lançamentos são confirmados online. Não é prontuário nem recomendação clínica.</p>
    <details className="v2-panel"><summary>Dúvidas de interpretação mantidas</summary><ul>{longitudinalDoubts.map(s => <li key={s}>{s}</li>)}</ul></details>
    <form action="/vigilancia/acompanhamentos" className="v2-toolbar" onSubmit={e => { if (dirty || blocked || reason) { e.preventDefault(); setError('Salve ou descarte as edições antes de trocar o recorte.'); } }}>
      <label className="v2-field">Área<select name="area" defaultValue={filters.area}><option value="hanseniase">Hanseníase</option><option value="tuberculose">Tuberculose</option></select></label>
      <label className="v2-field">Competência do acompanhamento<input type="month" name="month" defaultValue={filters.month} required /></label>
      <label className="v2-field">Equipe ESF<select name="team" defaultValue={teamId}>{data.teams.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label><button className="v2-secondary" disabled={blocked}>Consultar competência</button>
    </form>
    <div className="dialog-actions"><Link className="v2-secondary" href={url()}>Novo caso / lista</Link><Link className="v2-secondary" href={`/vigilancia?area=${filters.area}&month=${filters.month}&view=records`}>Arquivo de registros anteriores</Link></div>
    {!team?.permissions.view ? <section className="v2-panel"><h2>Consulta consolidada</h2><p>Seu acesso não permite ver nomes nem preencher acompanhamentos. Use os totais autorizados abaixo.</p></section> : <>
      <section className="v2-panel v2-section"><h2>{data.selected ? 'Acompanhamento do mesmo caso' : data.source ? 'Continuar caso da origem — vínculo explícito' : 'Novo caso longitudinal'}</h2>
        {data.selected && <p>Identificador permanente: {data.selected.id}. A identificação inicial e todas as revisões permanecem no histórico; edições atuais não modificam as competências anteriores.</p>}
        {data.source && <p>A origem será vinculada, sem alterar ou excluir o registro anterior. SINAN, tipo e contatos permanecem nos campos da origem; confirme os campos específicos separadamente.</p>}
        <p>{epiStates[status]} · versão {data.visit?.version ?? 0} · {frozen ? 'Competência fechada: edição bloqueada' : data.visit ? 'Acompanhamento existente nesta competência' : 'Ainda não há acompanhamento deste caso nesta competência'}</p>
        <form onSubmit={e => { e.preventDefault(); void command('save'); }}>
          {[...new Set(fields.map(f => f.group))].map(group => <fieldset className="v2-section" key={group}><legend>{group}</legend><div className="v2-form-grid">{fields.filter(f => f.group === group).map(f => input(f))}</div></fieldset>)}
          <fieldset className="v2-section"><legend>Cabeçalho do formulário ESF</legend><div className="v2-form-grid">{headFields.map(f => input(f, true))}</div><p className="v2-muted">Informe os responsáveis; não presumimos que quem imprime é o responsável técnico. Cabeçalhos diferentes na mesma competência precisam de conferência antes de fechar.</p></fieldset>
          {team.permissions.save && status === 'DRAFT' && !frozen && <button className="v2-button" disabled={blocked}>Salvar acompanhamento</button>}
        </form>
        {(team.permissions.review || team.permissions.validate || team.permissions.close) && <label className="v2-field">Justificativa de devolução / reabertura<textarea value={reason} maxLength={500} disabled={blocked} onChange={e => setReason(e.target.value)} /></label>}
        {data.visit && !frozen && <div className="dialog-actions">{(status === 'DRAFT' && team.permissions.save ? [['submit', 'Enviar à UBS']] : status === 'SUBMITTED' && team.permissions.review ? [['review', 'Confirmar revisão da UBS']] : status === 'REVIEWED' && team.permissions.validate ? [['validate', 'Validar pela vigilância']] : status === 'VALIDATED' && team.permissions.close ? [['close', 'Fechar acompanhamento']] : []).map(([a, label]) => <button className="v2-button" disabled={blocked || dirty} key={a} onClick={() => void command(a)}>{label}</button>)}
          {['SUBMITTED', 'REVIEWED', 'VALIDATED'].includes(status) && (team.permissions.review || team.permissions.validate) && <button className="v2-secondary" disabled={blocked || dirty || reason.trim().length < 10} onClick={() => void command('return')}>Devolver acompanhamento</button>}
          {status === 'CLOSED' && team.permissions.close && <button className="v2-secondary" disabled={blocked || dirty || reason.trim().length < 10} onClick={() => void command('reopen')}>Reabrir acompanhamento</button>}
        </div>}
        <DraftTools workspace={workspace} title={`Acompanhamento longitudinal · ${filters.area}`} draftKey={`longitudinal:${filters.area}:${teamId}:${filters.month}:${data.selected?.id ?? data.source?.id ?? 'new'}`} values={() => ({ envelope: JSON.stringify({ userId: workspace.userId, organizationId: workspace.organizationId, unitId: workspace.unitId, area: filters.area, teamId, month: filters.month, caseId: data.selected?.id ?? null, sourceId: data.source?.id ?? null, expectedVersion: data.visit?.version ?? 0, ids, values, headers, pending: pendingRef.current }) })} onRestore={saved => {
          try { const old = JSON.parse(saved.envelope); if (old.userId !== workspace.userId || old.organizationId !== workspace.organizationId || old.unitId !== workspace.unitId || old.area !== filters.area || old.teamId !== teamId || old.month !== filters.month || old.caseId !== (data.selected?.id ?? null) || old.sourceId !== (data.source?.id ?? null) || old.expectedVersion !== (data.visit?.version ?? 0) || old.ids.caseId !== ids.caseId && data.selected) throw new Error();
            if (old.pending) { setError('Cópia contém envio pendente. Revise a confirmação no servidor antes de preparar outra operação; o envelope foi preservado no cofre.'); return; }
            const validStrings = (candidate: unknown, keys: string[]) => !!candidate && typeof candidate === 'object' && !Array.isArray(candidate) && Object.entries(candidate).every(([k, v]) => keys.includes(k) && typeof v === 'string' && v.length <= 1000);
            if (!validStrings(old.values, fields.map(f => f.key)) || !validStrings(old.headers, headFields.map(f => f.key))) throw new Error(); setValues(old.values); setHeaders(old.headers);
          } catch { setError('Rascunho de outro contexto/versão ou inválido. Não aplicado; a cópia cifrada foi preservada.'); }
        }} />
        {(dirty || reason) && !pending && <button className="v2-secondary" disabled={busy || navigating} onClick={() => { if (window.confirm('Descartar somente edições da tela? A cópia cifrada, se salva, será mantida.')) { const old = JSON.parse(baseline); setValues(old.values); setHeaders(old.headers); setReason(''); setError(''); } }}>Descartar edições da tela</button>}
      </section>
      <section className="v2-panel v2-section"><h2>Casos permanentes · {data.total}</h2>{data.cases.map(c => <article key={c.id}><Link href={url({ case: c.id, team: c.team_id })}>{String(c.initial.name)} · {c.id}</Link></article>)}
        <h3>Registros anteriores ainda não vinculados · {data.sourceTotal}</h3><p>Vincule apenas após conferir a origem. Não há união por nome, número ou semelhança.</p>{data.sources.map(s => <article key={s.id}><Link href={url({ source: s.id, team: s.team_id })}>Continuar {String(s.payload.name)} · origem {s.competency}</Link></article>)}
        {Math.max(data.total, data.sourceTotal) > 25 && <nav className="v2-pagination" aria-label="Paginação de casos e origens">{filters.page > 1 && <Link href={url({ page: String(filters.page - 1) })}>Anterior</Link>}<span>Página {filters.page} · até 25 casos e 25 origens</span>{filters.page * 25 < Math.max(data.total, data.sourceTotal) && <Link href={url({ page: String(filters.page + 1) })}>Próxima</Link>}</nav>}
      </section>
      {data.selected && <section className="v2-panel v2-section"><h2>Histórico entre competências</h2>{data.history.map(v => <p key={v.id}><Link href={url({ case: data.selected!.id, month: v.competency })}>{v.competency} · {epiStates[v.status]} · versão {v.version}</Link></p>)}<details><summary>Revisões auditadas preservadas ({data.revisions.length})</summary>{data.revisions.map((r, i) => <details key={i}><summary>{r.snapshot.competency} · versão {r.snapshot.version} · {r.action} · {new Date(r.createdAt).toLocaleString('pt-BR')}</summary><dl>{fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{r.snapshot.payload[f.key] ?? 'Não informado'}</dd></div>)}</dl><p>{r.reason}</p></details>)}</details></section>}
    </>}
    <section className="v2-panel v2-section"><h2>Fechamento e relatórios integrados</h2>{!report ? <p role="alert">Consolidação indisponível. Nenhum total foi presumido.</p> : <>
      <p>Inclui registros anteriores e acompanhamentos novos. Um vínculo explícito não duplica a mesma origem na mesma competência. Contagem não significa incidência nem casos confirmados.</p>
      <div className="esf-table-scroll"><table className="esf-table"><thead><tr><th>UBS / equipe</th><th>Registros</th><th>Sem validação</th><th>Situação</th></tr></thead><tbody>{report.teams.map(t => <tr key={t.teamId}><td>{t.unitName} / {t.teamName}</td><td>{t.total}</td><td>{t.pending}</td><td>{t.status === 'CLOSED' ? 'Fechada' : !t.total ? 'Sem declaração' : 'Em preenchimento'}</td></tr>)}</tbody></table></div>
      <div className="dialog-actions"><Link href={'/vigilancia/acompanhamentos/impressao?' + reportQuery('unit')}>Consolidado da UBS / PDF</Link><a href={'/api/v1/epidemiology/longitudinal/export?' + reportQuery('unit')}>Excel da UBS</a></div>
      {data.municipal && <div className="dialog-actions"><Link href={'/vigilancia/acompanhamentos/impressao?' + reportQuery('municipal')}>Consolidado municipal / PDF</Link><a href={'/api/v1/epidemiology/longitudinal/export?' + reportQuery('municipal')}>Excel municipal sem nomes</a></div>}
      {team && monthly && <><p>Equipe selecionada · versão mensal {monthly.version} · revisão {monthly.revision}</p>
        {monthly.headerConflict && <p role="alert">Cabeçalhos diferentes entre acompanhamentos: confira os dados antes de fechar. Cada cabeçalho continua preservado.</p>}
        {team.permissions.view && <div className="dialog-actions"><Link href={'/vigilancia/acompanhamentos/impressao?' + reportQuery('team', true)}>Formulário ESF preenchido / PDF</Link><a href={'/api/v1/epidemiology/longitudinal/export?' + reportQuery('team', true)}>Excel nominal da equipe</a></div>}
        {team.permissions.close && <>
          {!monthly.total && !frozen && <label><input type="checkbox" checked={noActivity} disabled={blocked} onChange={e => setNoActivity(e.target.checked)} />Confirmo ausência de atividade (exige justificativa).</label>}
          <button className="v2-button" disabled={blocked || dirty || (frozen ? reason.trim().length < 10 : monthly.pending > 0 || monthly.headerConflict || !monthly.total && (!noActivity || reason.trim().length < 10))} onClick={() => void command(frozen ? 'month-reopen' : 'month-close')}>{frozen ? 'Reabrir competência integrada' : 'Fechar competência integrada'}</button></>}
        <details><summary>Relatórios fechados anteriores ({monthly.revisions.length})</summary>{monthly.revisions.map(r => <p key={r.revision}><Link href={'/vigilancia/acompanhamentos/impressao?' + reportQuery('team', !!team.permissions.view, r.revision)}>Revisão {r.revision} · {new Date(r.closedAt).toLocaleString('pt-BR')}</Link></p>)}</details>
      </>}
    </>}</section>
    {pending && <p role="alert">Há um comando sem confirmação definitiva. Os campos e o identificador da operação permanecem preservados. <button className="v2-secondary" disabled={busy || navigating} onClick={() => void command(pending.action)}>Repetir o mesmo comando</button></p>}
    {error && <p role="alert" className="v2-alert">{error}</p>}{message && <p role="status">{message}</p>}
  </>;
}
