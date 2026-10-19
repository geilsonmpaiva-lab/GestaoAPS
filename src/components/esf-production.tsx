'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DraftTools } from '@/components/draft-tools';
import { EsfPaperReport } from '@/components/esf-paper-report';
import { buildProductionPaper } from '@/lib/esf/paper';
import { productionProcedures } from '@/lib/esf/catalog';
import { annualProductionRows, monthNames, consolidateProduction, localEsfDate, monthlyStatusLabels, nextMonthlyStatus, productionSchema, type ProductionRecord } from '@/lib/esf/production';
import type { EsfProductionViewData } from '@/lib/server/esf';
import type { WorkspaceContext } from '@/lib/server/workspace';

type Filters = { month: string; team?: string; page: number; procedure: string };
export function EsfProduction({ workspace, initial, filters, view = 'records' }: { workspace: WorkspaceContext; initial: EsfProductionViewData; filters: Filters; view?: 'new' | 'records' | 'monthly' | 'annual' }) {
  const uxV3 = workspace.uxV3 === true;
  const [data, setData] = useState(initial);
  const defaultDate = localEsfDate().startsWith(filters.month) ? localEsfDate() : `${filters.month}-01`;
  const [date, setDate] = useState(defaultDate);
  const [procedure, setProcedure] = useState(''); const [quantity, setQuantity] = useState('');
  const [editing, setEditing] = useState<ProductionRecord | null>(null);
  const [reason, setReason] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [entryPending, setEntryPending] = useState(false);
  const [monthlyPendingAction, setMonthlyPendingAction] = useState<string | null>(null);
  const pending = useRef<{ fingerprint: string; operationId: string; entityId: string } | null>(null);
  const monthPending = useRef<{ fingerprint: string; operationId: string; action: string } | null>(null);
  const teamId = filters.team ?? data.teams[0]?.id;
  const status = data.monthly?.status ?? 'OPEN';
  const values = { date, procedure, quantity, editId: editing?.id ?? '', expectedVersion: String(editing?.version ?? 0) };
  const summary = status === 'CLOSED' && data.monthly?.snapshot ? data.monthly.snapshot : data.summary;
  const records = data.demo ? data.records.filter(r => r.occurred_on.startsWith(filters.month) && (!filters.procedure || r.procedure_id === filters.procedure)) : data.records;
  const total = data.demo ? records.length : data.total;
  const pageRecords = data.demo ? records.slice((filters.page - 1) * 25, filters.page * 25) : records;
  const query = new URLSearchParams({ month: filters.month, ...(teamId ? { team: teamId } : {}), ...(filters.procedure ? { procedure: filters.procedure } : {}) });
  const teamName = data.teams.find(t => t.id === teamId)?.name ?? 'Sem equipe';
  const entryDirty = editing ? date !== editing.occurred_on || procedure !== editing.procedure_id || quantity !== String(editing.quantity) : date !== defaultDate || procedure !== '' || quantity !== '';
  const unsaved = entryDirty || !!reason || entryPending || !!monthlyPendingAction;
  const editorVisible = !uxV3 || view === 'new' || view === 'records' && !!editing;
  const listVisible = !uxV3 || view === 'records' && !editing;
  const navigationQuery = (nextView: typeof view, page = filters.page) => `?${query}&page=${page}${uxV3 ? `&view=${nextView}` : ''}`;
  const protect = (event: React.SyntheticEvent) => { if (uxV3 && (unsaved || busy)) { event.preventDefault(); setFailed(true); setMessage('Salve ou descarte explicitamente as alterações antes de mudar de tela ou filtros.'); } };
  useEffect(() => {
    if (!uxV3 || !unsaved && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guardLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      event.preventDefault(); event.stopPropagation(); setFailed(true); setMessage('Salve ou descarte explicitamente as alterações antes de sair.');
    };
    window.addEventListener('beforeunload', beforeUnload); document.addEventListener('click', guardLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', guardLink, true); };
  }, [uxV3, unsaved, busy]);
  function discardEntry() {
    if (pending.current || monthPending.current || busy) return;
    if (entryDirty && !window.confirm('Descartar somente as alterações ainda não salvas deste lançamento? Os registros confirmados serão preservados.')) return;
    setDate(defaultDate); setQuantity(''); setProcedure(''); setEditing(null); setMessage(''); setFailed(false);
  }

  async function refresh() {
    const response = await fetch(`/api/v1/esf/production?${query}&page=${filters.page}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('O comando foi recebido, mas não foi possível atualizar a consulta. Recarregue para conferir antes de lançar novamente.');
    setData(await response.json());
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setFailed(false);
    let sent = false;
    try {
      const fingerprint = JSON.stringify({ values, teamId });
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, operationId: crypto.randomUUID(), entityId: editing?.id ?? crypto.randomUUID() };
      const input = { organizationId: workspace.organizationId, unitId: workspace.unitId, teamId, operationId: pending.current.operationId, entityId: pending.current.entityId,
        expectedVersion: editing?.version ?? 0, occurredOn: date, procedureId: procedure, quantity: quantity.trim() === '' ? null : Number(quantity) };
      if (!productionSchema.safeParse(input).success) throw new Error('Confira a data, equipe, procedimento e quantidade inteira não negativa.');
      if (date.slice(0, 7) !== filters.month) throw new Error('A data deve pertencer à competência selecionada.');
      if (data.demo && !editing && data.records.some(r => r.team_id === teamId && r.occurred_on === date && r.procedure_id === procedure)) throw new Error('Já existe um lançamento nesta data e procedimento. Use Corrigir quantidade.');
      sent = true;
      const response = await fetch('/api/v1/esf/production', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha no envio. Seus campos foram preservados.');
      if (data.demo) {
        const next = [...data.records.filter(r => r.id !== result.id), { id: result.id, team_id: teamId!, occurred_on: date, procedure_id: procedure, quantity: Number(quantity), version: result.version }];
        const nextSummary = consolidateProduction(next, filters.month, teamId);
        setData({ ...data, records: next, total: next.length, summary: nextSummary, annual: nextSummary.filter(s => s.quantity !== null).map(s => ({ competency: filters.month, procedureId: s.procedureId, quantity: s.quantity! })), monthly: { status: 'OPEN', revision: data.monthly?.revision ?? 1, version: (data.monthly?.version ?? 0) + 1, snapshot: null } });
      } else await refresh();
      pending.current = null; setQuantity(''); setProcedure(''); setEditing(null); if (uxV3) setDate(defaultDate);
      setMessage(data.demo ? 'Simulação adicionada nesta tela. Nada foi gravado no servidor; recarregar descarta esta demonstração.' : 'Salvo no sistema. O mapa mensal foi atualizado.');
    } catch (error) { if (!sent) pending.current = null; setFailed(true); setMessage(error instanceof Error ? error.message : 'Falha no envio. Seus campos foram preservados.'); }
    finally { setEntryPending(!!pending.current); setBusy(false); }
  }
  async function command(action: 'submit' | 'return' | 'close' | 'reopen') {
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const next = nextMonthlyStatus(status, action);
      if (['return', 'reopen'].includes(action) && reason.trim().length < 10) throw new Error('Informe uma justificativa de pelo menos 10 caracteres.');
      const input = { organizationId: workspace.organizationId, unitId: workspace.unitId, teamId, competency: filters.month, expectedVersion: data.monthly?.version ?? 0, action, reason };
      const fingerprint = JSON.stringify(input);
      if (monthPending.current?.fingerprint !== fingerprint) monthPending.current = { fingerprint, operationId: crypto.randomUUID(), action };
      const response = await fetch('/api/v1/esf/production/month', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, operationId: monthPending.current.operationId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível alterar a situação.');
      if (data.demo) setData({ ...data, monthly: { status: next, version: (data.monthly?.version ?? 0) + 1, revision: (data.monthly?.revision ?? 1) + (action === 'reopen' ? 1 : 0), snapshot: next === 'CLOSED' ? data.summary : null } });
      else await refresh();
      monthPending.current = null; setReason(''); setMessage(data.demo ? 'Transição simulada apenas nesta tela.' : 'Situação confirmada pelo servidor.');
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Falha na transição.'); }
    finally { setMonthlyPendingAction(monthPending.current?.action ?? null); setBusy(false); }
  }
  return <>
    {uxV3 && <nav className="v2-tabs esf-no-print" aria-label="Áreas da produção">{([['records', 'Lançamentos'], ['monthly', 'Mapa e fechamento'], ['annual', 'Consolidação anual']] as const).map(([value, label]) => <Link key={value} onClick={protect} href={navigationQuery(value)} aria-current={view === value || view === 'new' && value === 'records' ? 'page' : undefined}>{label}</Link>)}</nav>}
    <section className="v2-panel v2-section esf-no-print"><p className="v2-alert">{data.demo ? 'Demonstração com dados sintéticos. Lançamentos e fechamentos nesta tela são temporários.' : 'Fluxo inicial de homologação. O cadastro de procedimentos precisa de aprovação institucional para liberar gravações.'}</p>
      <form action="/formularios-esf/producao" className="v2-toolbar" onSubmit={protect}>{uxV3 && <input type="hidden" name="view" value={view} />}<label className="v2-field"><span>Competência</span><input type="month" name="month" required defaultValue={filters.month} min="2000-01" max="2100-12" /></label>
        <label className="v2-field"><span>Equipe ESF</span><select name="team" defaultValue={teamId} required>{!data.teams.length && <option value="">Nenhuma equipe cadastrada</option>}{data.teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
        {(!uxV3 || view === 'records') ? <label className="v2-field"><span>Procedimento da lista</span><select name="procedure" defaultValue={filters.procedure}><option value="">Todos os procedimentos</option>{productionProcedures.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label> : <input type="hidden" name="procedure" value={filters.procedure} />}
        <button className="v2-button" disabled={busy || !data.teams.length}>Aplicar filtros</button><Link onClick={protect} className="v2-secondary" href="/administracao/equipes">Equipes</Link>
      </form>
    </section>
    {message && <p className="v2-alert esf-no-print" role={failed ? 'alert' : 'status'}>{message}</p>}
    {uxV3 && unsaved && <p className="v2-muted esf-no-print" role="status">{entryPending || monthlyPendingAction ? 'Confirmação pendente. Tente novamente o mesmo envio antes de sair.' : 'Alterações não salvas.'}</p>}
    {teamId && <>
    {editorVisible && <section className="v2-panel v2-section esf-no-print">{uxV3 && !editing && <Link className="v2-back" onClick={protect} href={navigationQuery('records')}>← Voltar aos lançamentos</Link>}<h2>{editing ? 'Corrigir quantidade' : 'Novo lançamento diário'}</h2><p className="v2-muted">{teamName} · {filters.month}. Registre quantidades, não nomes de pacientes. Uma linha por equipe, dia e procedimento.</p>
      {status !== 'OPEN' ? <p>O mapa está {monthlyStatusLabels[status].toLowerCase()}. A edição exige devolução ou reabertura autorizada.</p> : !(editing ? data.canEdit : data.canCreate) ? <p>{data.catalogApproved === false ? 'O catálogo de procedimentos ainda aguarda aprovação institucional. A consulta permanece disponível; novos lançamentos serão liberados após essa aprovação.' : data.catalogApproved === true ? 'Seu acesso não permite gravar produção nesta equipe. Solicite a permissão à gestão responsável.' : 'Sem permissão de gravação ou catálogo ainda não aprovado.'}</p> : <>
      <form onSubmit={save} className="esf-entry"><label className="v2-field"><span>Data da produção</span><input type="date" required value={date} disabled={!!editing || busy || uxV3 && entryPending} min={`${filters.month}-01`} onChange={e => setDate(e.target.value)} /></label>
        <label className="v2-field"><span>Procedimento / categoria</span><select required value={procedure} disabled={!!editing || busy || uxV3 && entryPending} onChange={e => setProcedure(e.target.value)}><option value="">Selecione</option>{productionProcedures.map(p => <option key={p.id} value={p.id}>{p.label} · {p.code}</option>)}</select></label>
        <label className="v2-field"><span>Quantidade</span><input type="number" inputMode="numeric" min={0} max={1000000} step={1} required value={quantity} disabled={busy || uxV3 && entryPending} onChange={e => setQuantity(e.target.value)} /></label>
        <button className="v2-button" disabled={busy}>{busy ? 'Enviando…' : uxV3 && entryPending ? 'Tentar confirmar o mesmo envio' : editing ? 'Confirmar correção' : 'Registrar produção'}</button>
        {editing && <button className="v2-secondary" type="button" disabled={busy || uxV3 && entryPending} onClick={uxV3 ? discardEntry : () => { setEditing(null); setQuantity(''); setProcedure(''); }}>Cancelar correção</button>}
        {uxV3 && entryDirty && !editing && <button className="v2-secondary" type="button" disabled={busy || entryPending} onClick={discardEntry}>Descartar alterações não salvas</button>}
      </form>
      <DraftTools draftKey={`esf:producao:${teamId}:${filters.month}`} title="Produção diária ESF" values={values} workspace={workspace} onRestore={saved => {
        if (uxV3 && (busy || pending.current || monthPending.current)) throw new Error('Confirme o envio pendente antes de recuperar outro rascunho.');
        if (saved.editId) { const record = data.records.find(r => r.id === saved.editId); if (!record || String(record.version) !== saved.expectedVersion) { setMessage('O rascunho pertence a uma correção com outra versão. Abra o registro de origem; nenhuma alteração foi enviada.'); return; } setEditing(record); }
        else setEditing(null);
        setDate(saved.date ?? ''); setProcedure(saved.procedure ?? ''); setQuantity(saved.quantity ?? '');
      }} />
      <p className="v2-muted">Rascunho cifrado disponível. Reabertura do aplicativo sem rede e sincronização automática ESF ainda não homologadas.</p>
      </>}
    </section>}
    {listVisible && <section className="v2-panel v2-section esf-no-print"><div className="module-heading"><div><h2>Lançamentos da competência</h2><p className="v2-muted">{total} registro(s) no filtro · mais recentes primeiro</p></div>{uxV3 && <Link onClick={protect} className="v2-button" href={navigationQuery('new')}>Novo lançamento</Link>}</div>
      {!pageRecords.length && <p>Sem lançamentos neste recorte. Ausência de lançamento não significa produção zero.</p>}
      <div className="v2-records">{pageRecords.map(record => <article className="v2-record" key={record.id}><div><h3>{productionProcedures.find(p => p.id === record.procedure_id)?.label ?? record.procedure_id}</h3><p>{record.occurred_on.split('-').reverse().join('/')} · Quantidade: {record.quantity} · Versão {record.version}</p></div>{data.canEdit && status === 'OPEN' && <button className="v2-secondary" disabled={busy} onClick={() => { setEditing(record); setDate(record.occurred_on); setProcedure(record.procedure_id); setQuantity(String(record.quantity)); }}>Corrigir quantidade</button>}</article>)}</div>
      <nav className="v2-pagination" aria-label="Paginação da produção">{filters.page > 1 && <Link onClick={protect} className="v2-secondary" href={navigationQuery('records', filters.page - 1)}>Anterior</Link>}<span>Página {filters.page} de {Math.max(1, Math.ceil(total / 25))}</span>{filters.page * 25 < total && <Link onClick={protect} className="v2-secondary" href={navigationQuery('records', filters.page + 1)}>Próxima</Link>}</nav>
    </section>}
    {(!uxV3 || view === 'monthly' || view === 'annual') && <details className="v2-panel v2-section esf-no-print"><summary>Prévia fiel ao formulário revisado de produção</summary><EsfPaperReport document={buildProductionPaper(data,filters.month,{organization:workspace.organizationName,unit:workspace.unitName,team:teamName})}/></details>}
    <section className={`v2-panel v2-section esf-monthly${uxV3 && view !== 'monthly' ? ' production-screen-hidden' : ''}`}><p className="eyebrow">{workspace.organizationName} · {workspace.unitName}</p><h2>Mapa mensal · {filters.month}</h2><p>{teamName} · {monthlyStatusLabels[status]} · Revisão {data.monthly?.revision ?? 1}{data.demo ? ' · DEMONSTRAÇÃO' : ''}</p><p className="v2-muted">Todos os procedimentos da equipe nesta competência, independentemente do filtro da lista. {status !== 'CLOSED' && 'PRÉVIA — não é relatório definitivo.'}</p>
      <div className="esf-table-scroll"><table className="esf-table"><caption>Produção mensal por procedimento</caption><thead><tr><th scope="col">Código de referência</th><th scope="col">Procedimento</th><th scope="col">Quantidade</th></tr></thead><tbody>{productionProcedures.map(p => <tr key={p.id}><td>{p.code}</td><th scope="row">{p.label}</th><td>{summary.find(s => s.procedureId === p.id)?.quantity ?? 'Não informado'}</td></tr>)}</tbody></table></div>
      <div className="esf-no-print"><div className="dialog-actions">{data.canExport && !data.demo ? <a className="v2-secondary" href={`/formularios-esf/producao/impressao?${query}`} target="_blank" rel="noreferrer">Imprimir / salvar PDF preenchido</a> : <button className="v2-secondary" type="button" disabled={!data.canExport} onClick={() => window.print()}>Imprimir / salvar PDF</button>}{data.canExport && !data.demo && <a className="v2-secondary" href={`/api/v1/esf/production/export?${query}`}>Exportar Excel</a>}</div>{data.demo && <p className="v2-muted">Exportação Excel disponível após persistência em homologação. A impressão desta tela é uma demonstração.</p>}
        {data.monthly && <><label className="v2-field"><span>Justificativa de devolução / reabertura</span><textarea maxLength={500} value={reason} disabled={busy || uxV3 && !!monthlyPendingAction} onChange={e => setReason(e.target.value)} /></label><div className="dialog-actions">
          {status === 'OPEN' && data.canCreate && <button className="v2-button" disabled={busy || uxV3 && !!monthlyPendingAction && monthlyPendingAction !== 'submit'} onClick={() => command('submit')}>Enviar ao gerente</button>}
          {status === 'IN_REVIEW' && data.canReview && <button className="v2-secondary" disabled={busy || uxV3 && !!monthlyPendingAction && monthlyPendingAction !== 'return'} onClick={() => command('return')}>Devolver para correção</button>}
          {status === 'IN_REVIEW' && data.canClose && <button className="v2-button" disabled={busy || uxV3 && !!monthlyPendingAction && monthlyPendingAction !== 'close'} onClick={() => command('close')}>Validar e fechar mapa</button>}
          {status === 'CLOSED' && data.canReopen && <button className="v2-secondary" disabled={busy || uxV3 && !!monthlyPendingAction && monthlyPendingAction !== 'reopen'} onClick={() => command('reopen')}>Reabrir com justificativa</button>}
        </div></>}
      </div>
    </section>
    <details className={`v2-panel v2-section esf-no-print${uxV3 && view !== 'annual' ? ' production-screen-hidden' : ''}`} open={uxV3 && view === 'annual'}><summary>Consolidação anual · {filters.month.slice(0, 4)}</summary><p className="v2-muted">Soma dos lançamentos existentes. Total parcial quando algum mês não tem informação. O fechamento continua sendo mensal.</p>{uxV3 && data.canExport && !data.demo && <a className="v2-secondary" onClick={protect} href={`/formularios-esf/producao/impressao?${query}`} target="_blank" rel="noreferrer">Imprimir / salvar PDF preenchido</a>}<div className="esf-table-scroll"><table className="esf-table"><caption>JAN a DEZ e total anual</caption><thead><tr><th scope="col">Procedimento</th>{monthNames.map(m => <th scope="col" key={m}>{m}</th>)}<th scope="col">Total</th></tr></thead><tbody>{annualProductionRows(data.annual, filters.month.slice(0, 4)).map(p => <tr key={p.id}><th scope="row">{p.label}</th>{p.months.map((quantity, i) => <td key={i}>{quantity ?? '—'}</td>)}<td>{p.total ?? 'Não informado'}{p.total !== null && p.partial ? ' (parcial)' : ''}</td></tr>)}</tbody></table></div></details></>}
    <style jsx>{`@media screen { .production-screen-hidden { display: none; } }`}</style>
  </>;
}
