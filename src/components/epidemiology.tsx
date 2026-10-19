'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { epiAreas, epiStates, type EpiData, type EpiRecord, type EpiSummary } from '@/lib/epidemiology';

type Filters = { area: string; month: string; team?: string; page: number; status?: string; record?: string };
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
export function Epidemiology({ initial, filters, areas }: { initial: EpiData; filters: Filters; areas: string[] }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const definition = epiAreas.find(a => a.id === filters.area)!;
  const [record, setRecord] = useState<EpiRecord | null>(initial.selected);
  const [values, setValues] = useState<Record<string, string | number>>(initial.selected?.payload ?? {});
  const [teamId, setTeamId] = useState(initial.selected?.team_id ?? filters.team ?? initial.teams[0]?.id ?? '');
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ action: string; body: string } | null>(null);
  useEffect(() => {
    if (!dirty && !pending) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, pending]);
  const [entityId] = useState(() => initial.selected?.id ?? crypto.randomUUID());
  const [deviceId] = useState(() => crypto.randomUUID());
  const permissions = initial.teams.find(t => t.id === teamId)?.permissions ?? {};
  const canEdit = hydrated && permissions.save && (!record || record.status === 'DRAFT');
  const href = (change: Record<string, string | number | undefined>) => {
    const query = { ...filters, ...change };
    return '/vigilancia?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
  };
  const protect = (event: React.SyntheticEvent) => { if (dirty || pending) { event.preventDefault(); setError('Salve ou descarte explicitamente as edições antes de navegar.'); } };
  async function command(action: string) {
    setBusy(true); setError(''); setMessage('');
    const body = pending?.action === action ? pending.body : JSON.stringify({ action, area: filters.area, competency: filters.month, teamId, entityId: record?.id ?? entityId, expectedVersion: record?.version ?? 0, operationId: crypto.randomUUID(), deviceId, localTimestamp: new Date().toISOString(), synthetic: true, payload: action === 'save' ? values : {}, reason });
    setPending({ action, body });
    try {
      const response = await fetch('/api/v1/epidemiology', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const result = await response.json();
      if (!response.ok) { setPending(null); throw new Error(result.error || 'Comando não confirmado.'); }
      setRecord(result); setValues(result.payload); setDirty(false); setPending(null); setReason('');
      setMessage('Confirmado pelo servidor. Listas e consolidados serão atualizados.');
      router.replace(href({ record: result.id, team: teamId })); router.refresh();
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
    <form className="v2-panel epi-filters" action="/vigilancia" onSubmit={protect} aria-label="Filtros epidemiológicos">
      <label>Área<select name="area" defaultValue={filters.area}>{epiAreas.filter(a => areas.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
      <label>Competência<input type="month" name="month" defaultValue={filters.month} required /></label>
      <label>Equipe<select name="team" defaultValue={filters.team ?? ''}><option value="">Todas as autorizadas</option>{initial.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Situação<select name="status" defaultValue={filters.status ?? ''}><option value="">Todas</option>{Object.entries(epiStates).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <button className="v2-button" disabled={busy}>Aplicar filtros</button>
    </form>
    <details className="v2-panel v2-section" open><summary>Dúvidas de interpretação · origem {definition.source}</summary><ul>{definition.pending.map(p => <li key={p}>{p}</li>)}</ul><p className="v2-muted">SINAN é texto e pode repetir. A competência organiza o relatório, sem substituir a data informada. Não há classificação clínica automática.</p></details>
    {error && <p role="alert" className="v2-alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="v2-section"><h2>Consolidado da UBS · {filters.month}</h2><p className="v2-muted">Registros únicos por identificador interno, incluindo rascunhos. Não representa incidência, casos confirmados ou fechamento mensal. Todos os estados aparecem separados. As dúvidas de classificação continuam válidas.</p><Summary rows={initial.unitSummary} /></section>
    {initial.municipal && <section className="v2-section"><h2>Consolidado municipal autorizado · {filters.month}</h2><p className="v2-muted">Equipe → UBS → município. Sem nomes ou causas. Abrange somente equipes às quais seu perfil tem acesso.</p><p>Total: <strong>{initial.municipalSummary.reduce((n, r) => n + r.total, 0)}</strong> registros</p><Summary rows={initial.municipalSummary} /></section>}
    <section className="v2-panel v2-section"><h2>{record ? 'Detalhe e acompanhamento' : 'Novo registro sintético'} · {definition.title}</h2>
      {!permissions.view ? <p>Acesso somente aos consolidados. Dados nominais e comandos indisponíveis.</p> : <form onSubmit={e => { e.preventDefault(); void command('save'); }} autoComplete="off">
        <p>{record ? `${epiStates[record.status]} · versão ${record.version}` : 'Rascunho não salvo'} · Modelo v1</p>
        <label>Equipe responsável<select aria-label="Equipe responsável" value={teamId} disabled={!hydrated || !!record || dirty || busy || !!pending} onChange={e => setTeamId(e.target.value)}>{initial.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div className="epi-fields">{definition.fields.map(f => <label key={f.key}>{f.label}{f.type === 'select' ? <select name={`epi-${f.key}`} value={values[f.key] ?? ''} disabled={!canEdit || busy || !!pending} onChange={e => { const copy = { ...values }; if (e.target.value === '') delete copy[f.key]; else copy[f.key] = e.target.value; setValues(copy); setDirty(true); }}><option value="">Não informado</option>{f.options!.map(o => <option key={o}>{o}</option>)}</select> : <input autoComplete="off" name={`epi-${f.key}`} type={f.type === 'integer' ? 'number' : f.type === 'date' ? 'date' : 'text'} min={f.type === 'integer' ? 0 : undefined} max={f.type === 'integer' ? 1000000 : undefined} maxLength={f.type ? undefined : 1000} required={f.key === 'name'} placeholder={f.key === 'name' ? '[SINTÉTICO] Pessoa de teste' : undefined} value={values[f.key] ?? ''} disabled={!canEdit || busy || !!pending} onChange={e => { const copy = { ...values }; if (!e.target.value) delete copy[f.key]; else copy[f.key] = f.type === 'integer' ? Number(e.target.value) : e.target.value; setValues(copy); setDirty(true); }} />}</label>)}</div>
        {canEdit && <button className="v2-button" disabled={busy || !!pending && pending.action !== 'save'}>{busy ? 'Aguardando confirmação…' : pending?.action === 'save' ? 'Tentar novamente a mesma gravação' : 'Salvar rascunho'}</button>}
        {(dirty || pending) && <p role="status">Edições apenas nesta tela. Não feche o navegador antes da confirmação.</p>}
        {dirty && !pending && <button type="button" className="v2-secondary" disabled={busy} onClick={() => { if (window.confirm('Descartar somente as edições desta tela? O registro salvo não será excluído.')) { setValues(record?.payload ?? {}); setDirty(false); setError(''); } }}>Descartar edições da tela</button>}
      </form>}
      {available.length > 0 && <div className="v2-section"><label>Justificativa para devolução/reabertura<input maxLength={500} value={reason} disabled={busy || !!pending} onChange={e => setReason(e.target.value)} /></label><div className="dialog-actions">{available.map(action => <button type="button" key={action} className="v2-secondary" disabled={busy || dirty || !!pending && pending.action !== action || ['return', 'reopen'].includes(action) && reason.trim().length < 10} onClick={() => void command(action)}>{pending?.action === action ? 'Tentar novamente: ' : ''}{actions[action]}</button>)}</div></div>}
      {record && <><p className="v2-muted">Atualizado em {new Date(record.updated_at).toLocaleString('pt-BR')}. Edições do acompanhamento mantêm o mesmo registro; não o recadastre mensalmente.</p><Link onClick={protect} className="v2-secondary" href={href({ record: undefined })}>Voltar / novo registro</Link><details><summary>Histórico auditado</summary><ul>{initial.history.map((entry, i) => <li key={i}>v{entry.version} · {historyLabels[entry.action] ?? entry.action} · {new Date(entry.created_at).toLocaleString('pt-BR')}{entry.reason ? ` · ${entry.reason}` : ''}</li>)}</ul></details></>}
    </section>
    <section className="v2-panel v2-section"><h2>Registros autorizados · {initial.total}</h2><p className="v2-muted">25 por página. Filtros e página são preservados ao abrir e voltar. Possíveis repetições de SINAN não são unidas automaticamente.</p>
      {!initial.records.length && <p>Sem registros nominais acessíveis neste recorte. Isso não comprova ausência de casos.</p>}
      <div className="epi-records">{initial.records.map(r => <article key={r.id}><h3>{r.payload.name}</h3><p>{initial.teams.find(t => t.id === r.team_id)?.name} · {epiStates[r.status]} · v{r.version}</p><p>Data: {String(r.payload.date ?? 'Não informada')} · SINAN: {String(r.payload.sinan ?? 'Não informado')}</p>{r.payload.sinan !== undefined && initial.records.some(other => other.id !== r.id && other.payload.sinan === r.payload.sinan) && <p className="v2-alert">SINAN repetido nesta página. Verifique sem unir registros automaticamente.</p>}<Link onClick={protect} href={href({ record: r.id })} className="v2-secondary">Abrir acompanhamento</Link></article>)}</div>
      <nav aria-label="Paginação epidemiológica" className="dialog-actions">{filters.page > 1 && <Link onClick={protect} href={href({ page: filters.page - 1, record: undefined })}>Página anterior</Link>}<span>Página {filters.page} de {Math.max(1, Math.ceil(initial.total / 25))}</span>{filters.page * 25 < initial.total && <Link onClick={protect} href={href({ page: filters.page + 1, record: undefined })}>Próxima página</Link>}</nav>
    </section>
  </>;
}
