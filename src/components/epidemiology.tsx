'use client';
import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { epiAreas, epiStates, type EpiData, type EpiRecord, type EpiSummary } from '@/lib/epidemiology';
import type { EpiMonthReport } from '@/lib/epidemiology-monthly';
import { EpidemiologyMonthly } from './epidemiology-monthly';
import { DraftTools } from './draft-tools';
import { readEpidemiologyDraft } from '@/lib/epidemiology-draft';
import type { WorkspaceContext } from '@/lib/server/workspace';

type Filters = { area: string; month: string; team?: string; page: number; status?: string; record?: string };
type View = 'records' | 'summary' | 'monthly';
const actions: Record<string, string> = { submit: 'Enviar à UBS', review: 'Confirmar revisão da UBS', validate: 'Validar pela vigilância', close: 'Fechar registro', return: 'Devolver para correção', reopen: 'Reabrir com justificativa' };
const historyLabels: Record<string, string> = { save: 'Gravação', submit: 'Envio à UBS', review: 'Revisão da UBS', validate: 'Validação técnica', close: 'Fechamento', return: 'Devolução', reopen: 'Reabertura' };
const subscribeHydration = () => () => {};
function Summary({ rows }: { rows: EpiSummary[] }) {
  const units = [...new Set(rows.map(r => r.unitId))];
  return <div className="epi-summary">{units.map(unitId => {
    const unit = rows.filter(r => r.unitId === unitId);
    return <article className="v2-panel" key={unitId}><h3>{unit[0].unitName}</h3><p><strong>{unit.reduce((n, r) => n + r.total, 0)}</strong> registros no recorte autorizado</p><details><summary>Detalhar equipes ({unit.length})</summary>{unit.map(r => <div key={r.teamId} className="epi-summary-row"><strong>{r.teamName}</strong><span>{r.total ? `${r.total} registros · ${r.submitted} enviados · ${r.validated} validados (inclui fechados) · ${r.closed} fechados` : 'Sem registros — não significa zero casos'}</span></div>)}</details></article>;
  })}{!rows.length && <p>Sem equipes autorizadas neste recorte.</p>}</div>;
}
export function Epidemiology({ initial, filters, areas, monthly, workspace, uxV3 = false, view = 'records', createNew = false }: { initial: EpiData; filters: Filters; areas: string[]; monthly?: EpiMonthReport; workspace?: WorkspaceContext; uxV3?: boolean; view?: View; createNew?: boolean }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const definition = epiAreas.find(a => a.id === filters.area)!;
  const [record, setRecord] = useState<EpiRecord | null>(initial.selected);
  const [values, setValues] = useState<Record<string, string | number>>(initial.selected?.payload ?? {});
  const creationTeams = initial.teams.filter(t => t.permissions.save && monthly?.teams.find(m => m.teamId === t.id)?.currentStatus !== 'CLOSED');
  const initialTeam = initial.selected?.team_id ?? filters.team ?? (uxV3 && createNew ? creationTeams[0]?.id : undefined) ?? initial.teams[0]?.id ?? '';
  const [teamId, setTeamId] = useState(initialTeam);
  const [navigating, startNavigation] = useTransition();
  const [reason, setReason] = useState(''); const [sending, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const busy = sending || navigating;
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ action: string; body: string } | null>(null);
  const [monthlyDirty, setMonthlyDirty] = useState(false);
  const [draftConflict, setDraftConflict] = useState<ReturnType<typeof readEpidemiologyDraft> | null>(null);
  useEffect(() => {
    if (!dirty && !pending && !monthlyDirty && !(uxV3 && (reason || busy))) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guardLink = (event: MouseEvent) => {
      if (!uxV3 || !(event.target instanceof Element) || !event.target.closest('a[href]')) return;
      event.preventDefault(); event.stopPropagation(); setError('Conclua o envio ou salve e descarte explicitamente as edições antes de mudar de tela.');
    };
    window.addEventListener('beforeunload', guard);
    document.addEventListener('click', guardLink, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', guardLink, true); };
  }, [dirty, pending, monthlyDirty, uxV3, reason, busy]);
  const [entityId, setEntityId] = useState(() => initial.selected?.id ?? crypto.randomUUID());
  const [deviceId] = useState(() => crypto.randomUUID());
  const permissions = initial.teams.find(t => t.id === teamId)?.permissions ?? {};
  const monthClosed = monthly?.teams.find(t => t.teamId === teamId)?.currentStatus === 'CLOSED';
  const canEdit = hydrated && permissions.save && !monthClosed && (!record || record.status === 'DRAFT');
  const showEditor = !uxV3 || view === 'records' && (!!record || createNew);
  const showList = !uxV3 || view === 'records' && !showEditor;
  const canCreate = creationTeams.some(t => !filters.team || t.id === filters.team);
  const href = (change: Record<string, string | number | undefined>) => {
    const query = { ...filters, ...(uxV3 ? { view, ...(createNew ? { create: '1' } : {}) } : {}), ...change };
    return '/vigilancia?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
  };
  const protect = (event: React.SyntheticEvent) => { if (dirty || pending || monthlyDirty || busy || uxV3 && reason) { event.preventDefault(); setError(monthlyDirty ? 'Conclua a ação mensal ou desfaça a justificativa e a declaração de ausência antes de navegar.' : reason ? 'Conclua a ação ou limpe a justificativa antes de navegar.' : 'Salve ou descarte explicitamente as edições antes de navegar.'); } };
  async function command(action: string) {
    setBusy(true); setError(''); setMessage('');
    const body = pending?.action === action ? pending.body : JSON.stringify({ action, area: filters.area, competency: filters.month, teamId, entityId: record?.id ?? entityId, expectedVersion: record?.version ?? 0, operationId: crypto.randomUUID(), deviceId, localTimestamp: new Date().toISOString(), synthetic: true, payload: action === 'save' ? values : {}, reason });
    setPending({ action, body });
    try {
      const response = await fetch('/api/v1/epidemiology', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const result = await response.json();
      if (!response.ok) { setPending(null); throw new Error(result.error || 'Comando não confirmado.'); }
      setRecord(result); setValues(result.payload); setDirty(false); setPending(null); setReason(''); setDraftConflict(null);
      setMessage('Confirmado pelo servidor. Listas e consolidados serão atualizados.');
      startNavigation(() => {
        // One RSC navigation per confirmation; a concurrent replace + refresh could
        // remount a new detail from the earlier version while the next command ran.
        if (filters.record !== result.id || !uxV3 && filters.team !== teamId) router.replace(href({ record: result.id, ...(uxV3 ? { create: undefined } : { team: teamId }) }));
        else router.refresh();
      });
    } catch (e) { setError((e instanceof TypeError ? 'Falha de conexão. Nenhum envio foi confirmado.' : e instanceof Error ? e.message : 'Não foi possível confirmar o envio.') + ' As edições permanecem nesta tela. Em falha de rede, tente o mesmo comando novamente.'); }
    finally { setBusy(false); }
  }
  const available = record ? [
    ...(record.status === 'DRAFT' && permissions.save ? ['submit'] : []),
    ...(record.status === 'SUBMITTED' && permissions.review ? ['review'] : []),
    ...(record.status === 'REVIEWED' && permissions.validate ? ['validate'] : []),
    ...(record.status === 'VALIDATED' && permissions.close ? ['close'] : []),
    ...(['SUBMITTED', 'REVIEWED', 'VALIDATED'].includes(record.status) && (permissions.review || permissions.validate) ? ['return'] : []),
    ...(record.status === 'CLOSED' && permissions.close ? ['reopen'] : []),
  ] : [];
  return <>
    {uxV3 && <nav className="epi-view-nav" aria-label="Áreas da Vigilância">{([['records', 'Registros'], ['summary', 'Consolidação'], ['monthly', 'Fechamento e relatórios']] as const).map(([value, label]) => <Link key={value} prefetch={false} onClick={protect} href={href({ view: value, record: undefined, create: undefined })} aria-current={view === value ? 'page' : undefined}>{label}</Link>)}</nav>}
    <form className="v2-panel epi-filters" action="/vigilancia" onSubmit={protect} aria-label="Filtros epidemiológicos">
      {uxV3 && <input type="hidden" name="view" value={view} />}
      <label>Área<select name="area" defaultValue={filters.area}>{epiAreas.filter(a => areas.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
      <label>Competência<input type="month" name="month" defaultValue={filters.month} required /></label>
      {(!uxV3 || view === 'records') ? <label>Equipe<select name="team" defaultValue={filters.team ?? ''}><option value="">Todas as autorizadas</option>{initial.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label> : filters.team ? <input type="hidden" name="team" value={filters.team} /> : null}
      {(!uxV3 || view === 'records') ? <label>Situação<select name="status" defaultValue={filters.status ?? ''}><option value="">Todas</option>{Object.entries(epiStates).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label> : filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
      <button className="v2-button" disabled={busy}>Aplicar filtros</button>
    </form>
    <details className="v2-panel v2-section epi-model-notes" open={!uxV3}><summary>Dúvidas de interpretação · origem {definition.source}</summary><ul>{definition.pending.map(p => <li key={p}>{p}</li>)}</ul><p className="v2-muted">SINAN é texto e pode repetir. A competência organiza o relatório, sem substituir a data informada. Não há classificação clínica automática.</p></details>
    {error && <p role="alert" className="v2-alert">{error}</p>}{message && <p role="status">{message}</p>}
    {(!uxV3 || view === 'summary') && <><section className="v2-section"><h2>Consolidado da UBS · {filters.month}</h2><p className="v2-muted">Registros únicos por identificador interno, incluindo rascunhos. Não representa incidência, casos confirmados ou fechamento mensal. Todos os estados aparecem separados. As dúvidas de classificação continuam válidas.{uxV3 && ' Inclui todas as equipes autorizadas; os filtros da lista não limitam este consolidado.'}</p><Summary rows={initial.unitSummary} /></section>
    {initial.municipal && <section className="v2-section"><h2>Consolidado municipal autorizado · {filters.month}</h2><p className="v2-muted">Equipe → UBS → município. Sem nomes ou causas. Abrange somente equipes às quais seu perfil tem acesso.</p><p>Total: <strong>{initial.municipalSummary.reduce((n, r) => n + r.total, 0)}</strong> registros</p><Summary rows={initial.municipalSummary} /></section>}
    </>}
    {(!uxV3 || view === 'monthly') && <EpidemiologyMonthly report={monthly} area={filters.area} month={filters.month} teams={initial.teams} blocked={!hydrated || busy || dirty || !!pending} municipal={initial.municipal} initialTeam={filters.team ?? initial.selected?.team_id} onPendingChange={uxV3 ? setMonthlyDirty : undefined} onTeamChange={uxV3 ? team => startNavigation(() => router.push(href({ team, record: undefined, create: undefined }))) : undefined} />}
    {showEditor && <section className="v2-panel v2-section epi-editor">{uxV3 && <Link prefetch={false} onClick={protect} className="v2-back" href={href({ record: undefined, create: undefined })}>← Voltar aos registros</Link>}<h2>{record ? 'Detalhe e acompanhamento' : 'Novo registro sintético'} · {definition.title}</h2>
      {!permissions.view ? <p>Acesso somente aos consolidados. Dados nominais e comandos indisponíveis.</p> : <form onSubmit={e => { e.preventDefault(); void command('save'); }} autoComplete="off">
        <p>{record ? `${epiStates[record.status]} · versão ${record.version}` : 'Rascunho não salvo'} · Modelo v1</p>
        {uxV3 && <p className="v2-muted">{!record ? 'Preencha os dados e salve o rascunho. Depois você poderá enviá-lo para revisão.' : ({ DRAFT: 'Próxima etapa: conferir os dados e enviar à UBS.', SUBMITTED: 'Aguardando revisão da gerência da UBS.', REVIEWED: 'Aguardando validação técnica da Vigilância.', VALIDATED: 'Validado. O responsável autorizado pode fechar o registro ou a competência.', CLOSED: 'Registro fechado. Uma correção exige reabertura autorizada.' } as Record<string, string>)[record.status]}</p>}
        <label>Equipe responsável<select aria-label="Equipe responsável" value={teamId} disabled={!hydrated || !!record || dirty || busy || !!pending} onChange={e => setTeamId(e.target.value)}>{initial.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div className="epi-fields">{definition.fields.map(f => <label key={f.key}>{f.label}{f.type === 'select' ? <select name={`epi-${f.key}`} value={values[f.key] ?? ''} disabled={!canEdit || busy || !!pending} onChange={e => { const copy = { ...values }; if (e.target.value === '') delete copy[f.key]; else copy[f.key] = e.target.value; setValues(copy); setDirty(true); }}><option value="">Não informado</option>{f.options!.map(o => <option key={o}>{o}</option>)}</select> : <input autoComplete="off" name={`epi-${f.key}`} type={f.type === 'integer' ? 'number' : f.type === 'date' ? 'date' : 'text'} min={f.type === 'integer' ? 0 : undefined} max={f.type === 'integer' ? 1000000 : undefined} maxLength={f.type ? undefined : 1000} required={f.key === 'name'} placeholder={f.key === 'name' ? '[SINTÉTICO] Pessoa de teste' : undefined} value={values[f.key] ?? ''} disabled={!canEdit || busy || !!pending} onChange={e => { const copy = { ...values }; if (!e.target.value) delete copy[f.key]; else copy[f.key] = f.type === 'integer' ? Number(e.target.value) : e.target.value; setValues(copy); setDirty(true); }} />}</label>)}</div>
        {canEdit && <button className="v2-button" disabled={busy || !!pending && pending.action !== 'save'}>{busy ? 'Aguardando confirmação…' : pending?.action === 'save' ? 'Tentar novamente a mesma gravação' : 'Salvar rascunho'}</button>}
        {(dirty || pending) && <p role="status">Edições apenas nesta tela. Não feche o navegador antes da confirmação.</p>}
        {dirty && !pending && <button type="button" className="v2-secondary" disabled={busy} onClick={() => { if (window.confirm('Descartar somente as edições desta tela? O registro salvo não será excluído.')) { setValues(record?.payload ?? {}); setDirty(false); setError(''); } }}>Descartar edições da tela</button>}
      </form>}
      {uxV3 && workspace?.unitId && permissions.save && <>
        <DraftTools workspace={workspace} title={`Rascunho de Vigilância · ${definition.title}`} draftKey={`vigilancia:${filters.area}:${teamId}:${filters.month}:${record?.id ?? 'new'}`} values={{ userId: workspace.userId, organizationId: workspace.organizationId, unitId: workspace.unitId, teamId, area: filters.area, competency: filters.month, entityId: record?.id ?? entityId, expectedVersion: String(record?.version ?? 0), payload: JSON.stringify(values), pending: pending ? JSON.stringify(pending) : '', reason }} onRestore={saved => {
          if (busy || pending) throw new Error('Conclua o envio pendente antes de recuperar outro rascunho.');
          const restored = readEpidemiologyDraft(saved, { userId: workspace.userId, organizationId: workspace.organizationId, unitId: workspace.unitId!, teamId, area: filters.area, competency: filters.month, entityId: record?.id ?? null, expectedVersion: record?.version ?? 0 });
          if (!restored.versionMatches) { setDraftConflict(restored); throw new Error('O registro possui outra versão. Confira a comparação abaixo; a cópia cifrada não foi alterada.'); }
          if (monthClosed || !canEdit && !restored.pending) throw new Error('Este registro não está disponível para edição. A cópia cifrada foi preservada.');
          if ((dirty || reason) && !window.confirm('Substituir somente as edições desta tela pela cópia cifrada? Nenhum registro salvo será alterado.')) throw new Error('Recuperação cancelada. As duas cópias foram preservadas.');
          setEntityId(restored.entityId); setValues(restored.payload); setReason(restored.reason); setPending(restored.pending); setDirty(!restored.pending && JSON.stringify(restored.payload) !== JSON.stringify(record?.payload ?? {})); setDraftConflict(null); setError('');
          setMessage(restored.pending ? 'Envio pendente recuperado. Tente o mesmo comando para conferir a confirmação.' : 'Rascunho recuperado neste dispositivo. Revise antes de salvar no sistema.');
        }} />
        <p className="v2-muted">Salve a cópia cifrada antes de fechar o navegador. Ela pode ser recuperada ao voltar a este registro com o cofre desbloqueado. O envio e a navegação da Vigilância ainda exigem conexão; não há fila automática offline.</p>
      </>}
      {draftConflict && <section className="epi-draft-comparison" aria-label="Comparação do rascunho recuperado"><h3>Rascunho de outra versão preservado</h3><p>O rascunho usa a versão {draftConflict.expectedVersion}; este registro está na versão {record?.version ?? 0}. Nenhum valor foi aplicado. Confira as diferenças antes de preparar uma correção autorizada.</p><div className="epi-draft-columns">{definition.fields.map(field => <div key={field.key}><h4>{field.label}</h4><p><strong>No rascunho:</strong> {String(draftConflict.payload[field.key] ?? 'Não informado')}</p><p><strong>No registro atual:</strong> {String(record?.payload[field.key] ?? 'Não informado')}</p></div>)}</div><button className="v2-secondary" type="button" onClick={() => setDraftConflict(null)}>Fechar comparação</button></section>}
      {monthClosed && <p className="v2-alert">Competência da equipe fechada. Solicite reabertura mensal antes de criar ou alterar registros.</p>}
      {available.length > 0 && hydrated && !monthClosed && <div className="v2-section"><label>Justificativa para devolução/reabertura<input maxLength={500} value={reason} disabled={busy || !!pending} onChange={e => setReason(e.target.value)} /></label><div className="dialog-actions">{available.map(action => <button type="button" key={action} className="v2-secondary" disabled={busy || dirty || !!pending && pending.action !== action || ['return', 'reopen'].includes(action) && reason.trim().length < 10} onClick={() => void command(action)}>{pending?.action === action ? 'Tentar novamente: ' : ''}{actions[action]}</button>)}</div></div>}
      {record && <><p className="v2-muted">Atualizado em {new Date(record.updated_at).toLocaleString('pt-BR')}. Edições do acompanhamento mantêm o mesmo registro; não o recadastre mensalmente.</p>{!uxV3 && <Link onClick={protect} className="v2-secondary" href={href({ record: undefined })}>Voltar / novo registro</Link>}<details><summary>Histórico auditado</summary><ul>{initial.history.map((entry, i) => <li key={i}>v{entry.version} · {historyLabels[entry.action] ?? entry.action} · {new Date(entry.created_at).toLocaleString('pt-BR')}{entry.reason ? ` · ${entry.reason}` : ''}</li>)}</ul></details></>}
    </section>}
    {showList && <section className="v2-panel v2-section"><div className="epi-list-heading"><div><h2>Registros autorizados · {initial.total}</h2><p className="v2-muted">25 por página. Filtros e página são preservados ao abrir e voltar. Possíveis repetições de SINAN não são unidas automaticamente.</p></div>{uxV3 && canCreate && <Link prefetch={false} onClick={protect} className="v2-button" href={href({ create: '1', record: undefined })}>Novo registro</Link>}</div>
      {uxV3 && !initial.teams.some(t => t.permissions.view) && <p>Seu acesso permite consultar totais sem nomes. <Link prefetch={false} href={href({ view: 'summary', record: undefined, create: undefined })}>Abrir consolidação</Link></p>}
      {!initial.records.length && <p>Sem registros nominais acessíveis neste recorte. Isso não comprova ausência de casos.</p>}
      <div className="epi-records">{initial.records.map(r => <article key={r.id}><h3>{r.payload.name}</h3><p>{initial.teams.find(t => t.id === r.team_id)?.name} · {epiStates[r.status]} · v{r.version}</p><p>Data: {String(r.payload.date ?? 'Não informada')} · SINAN: {String(r.payload.sinan ?? 'Não informado')}</p>{r.payload.sinan !== undefined && initial.records.some(other => other.id !== r.id && other.payload.sinan === r.payload.sinan) && <p className="v2-alert">SINAN repetido nesta página. Verifique sem unir registros automaticamente.</p>}<Link onClick={protect} href={href({ record: r.id })} className="v2-secondary">Abrir acompanhamento</Link></article>)}</div>
      <nav aria-label="Paginação epidemiológica" className="dialog-actions">{filters.page > 1 && <Link onClick={protect} href={href({ page: filters.page - 1, record: undefined })}>Página anterior</Link>}<span>Página {filters.page} de {Math.max(1, Math.ceil(initial.total / 25))}</span>{filters.page * 25 < initial.total && <Link onClick={protect} href={href({ page: filters.page + 1, record: undefined })}>Próxima página</Link>}</nav>
    </section>}
  </>;
}
