'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { DraftTools } from '@/components/draft-tools';
import { productionProcedures } from '@/lib/esf/catalog';
import { annualProductionRows, monthNames, consolidateProduction, localEsfDate, monthlyStatusLabels, nextMonthlyStatus, productionSchema, type EsfProductionData, type ProductionRecord } from '@/lib/esf/production';
import type { WorkspaceContext } from '@/lib/server/workspace';

type Filters = { month: string; team?: string; page: number; procedure: string };
export function EsfProduction({ workspace, initial, filters }: { workspace: WorkspaceContext; initial: EsfProductionData; filters: Filters }) {
  const [data, setData] = useState(initial);
  const [date, setDate] = useState(localEsfDate().startsWith(filters.month) ? localEsfDate() : `${filters.month}-01`);
  const [procedure, setProcedure] = useState(''); const [quantity, setQuantity] = useState('');
  const [editing, setEditing] = useState<ProductionRecord | null>(null);
  const [reason, setReason] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const pending = useRef<{ fingerprint: string; operationId: string; entityId: string } | null>(null);
  const monthPending = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const teamId = filters.team ?? data.teams[0]?.id;
  const status = data.monthly?.status ?? 'OPEN';
  const values = { date, procedure, quantity, editId: editing?.id ?? '', expectedVersion: String(editing?.version ?? 0) };
  const summary = status === 'CLOSED' && data.monthly?.snapshot ? data.monthly.snapshot : data.summary;
  const records = data.demo ? data.records.filter(r => r.occurred_on.startsWith(filters.month) && (!filters.procedure || r.procedure_id === filters.procedure)) : data.records;
  const total = data.demo ? records.length : data.total;
  const pageRecords = data.demo ? records.slice((filters.page - 1) * 25, filters.page * 25) : records;
  const query = new URLSearchParams({ month: filters.month, ...(teamId ? { team: teamId } : {}), ...(filters.procedure ? { procedure: filters.procedure } : {}) });
  const teamName = data.teams.find(t => t.id === teamId)?.name ?? 'Sem equipe';

  async function refresh() {
    const response = await fetch(`/api/v1/esf/production?${query}&page=${filters.page}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('O comando foi recebido, mas não foi possível atualizar a consulta. Recarregue para conferir antes de lançar novamente.');
    setData(await response.json());
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const fingerprint = JSON.stringify({ values, teamId });
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, operationId: crypto.randomUUID(), entityId: editing?.id ?? crypto.randomUUID() };
      const input = { organizationId: workspace.organizationId, unitId: workspace.unitId, teamId, operationId: pending.current.operationId, entityId: pending.current.entityId,
        expectedVersion: editing?.version ?? 0, occurredOn: date, procedureId: procedure, quantity: quantity.trim() === '' ? null : Number(quantity) };
      if (!productionSchema.safeParse(input).success) throw new Error('Confira a data, equipe, procedimento e quantidade inteira não negativa.');
      if (date.slice(0, 7) !== filters.month) throw new Error('A data deve pertencer à competência selecionada.');
      if (data.demo && !editing && data.records.some(r => r.team_id === teamId && r.occurred_on === date && r.procedure_id === procedure)) throw new Error('Já existe um lançamento nesta data e procedimento. Use Corrigir quantidade.');
      const response = await fetch('/api/v1/esf/production', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha no envio. Seus campos foram preservados.');
      if (data.demo) {
        const next = [...data.records.filter(r => r.id !== result.id), { id: result.id, team_id: teamId!, occurred_on: date, procedure_id: procedure, quantity: Number(quantity), version: result.version }];
        const nextSummary = consolidateProduction(next, filters.month, teamId);
        setData({ ...data, records: next, total: next.length, summary: nextSummary, annual: nextSummary.filter(s => s.quantity !== null).map(s => ({ competency: filters.month, procedureId: s.procedureId, quantity: s.quantity! })), monthly: { status: 'OPEN', revision: data.monthly?.revision ?? 1, version: (data.monthly?.version ?? 0) + 1, snapshot: null } });
      } else await refresh();
      pending.current = null; setQuantity(''); setProcedure(''); setEditing(null);
      setMessage(data.demo ? 'Simulação adicionada nesta tela. Nada foi gravado no servidor; recarregar descarta esta demonstração.' : 'Confirmado pelo servidor. O mapa mensal foi atualizado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha no envio. Seus campos foram preservados.'); }
    finally { setBusy(false); }
  }
  async function command(action: 'submit' | 'return' | 'close' | 'reopen') {
    setBusy(true); setMessage('');
    try {
      const next = nextMonthlyStatus(status, action);
      if (['return', 'reopen'].includes(action) && reason.trim().length < 10) throw new Error('Informe uma justificativa de pelo menos 10 caracteres.');
      const input = { organizationId: workspace.organizationId, unitId: workspace.unitId, teamId, competency: filters.month, expectedVersion: data.monthly?.version ?? 0, action, reason };
      const fingerprint = JSON.stringify(input);
      if (monthPending.current?.fingerprint !== fingerprint) monthPending.current = { fingerprint, operationId: crypto.randomUUID() };
      const response = await fetch('/api/v1/esf/production/month', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, operationId: monthPending.current.operationId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível alterar a situação.');
      if (data.demo) setData({ ...data, monthly: { status: next, version: (data.monthly?.version ?? 0) + 1, revision: (data.monthly?.revision ?? 1) + (action === 'reopen' ? 1 : 0), snapshot: next === 'CLOSED' ? data.summary : null } });
      else await refresh();
      monthPending.current = null; setReason(''); setMessage(data.demo ? 'Transição simulada apenas nesta tela.' : 'Situação confirmada pelo servidor.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha na transição.'); }
    finally { setBusy(false); }
  }
  return <>
    <section className="v2-panel v2-section esf-no-print"><p className="v2-alert">{data.demo ? 'Demonstração com dados sintéticos. Lançamentos e fechamentos nesta tela são temporários.' : 'Fluxo inicial de homologação. O cadastro de procedimentos precisa de aprovação institucional para liberar gravações.'}</p>
      <form action="/formularios-esf/producao" className="v2-toolbar"><label className="v2-field"><span>Competência</span><input type="month" name="month" required defaultValue={filters.month} min="2000-01" max="2100-12" /></label>
        <label className="v2-field"><span>Equipe ESF</span><select name="team" defaultValue={teamId} required>{!data.teams.length && <option value="">Nenhuma equipe cadastrada</option>}{data.teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
        <label className="v2-field"><span>Procedimento da lista</span><select name="procedure" defaultValue={filters.procedure}><option value="">Todos os procedimentos</option>{productionProcedures.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <button className="v2-button" disabled={busy || !data.teams.length}>Aplicar filtros</button><Link className="v2-secondary" href="/administracao/equipes">Equipes</Link>
      </form>
    </section>
    <div role="status" aria-live="polite">{message && <p className="v2-alert">{message}</p>}</div>
    {teamId && <>
    <section className="v2-panel v2-section esf-no-print"><h2>{editing ? 'Corrigir quantidade' : 'Novo lançamento diário'}</h2><p className="v2-muted">{teamName} · {filters.month}. Registre quantidades, não nomes de pacientes. Uma linha por equipe, dia e procedimento.</p>
      {status !== 'OPEN' ? <p>O mapa está {monthlyStatusLabels[status].toLowerCase()}. A edição exige devolução ou reabertura autorizada.</p> : !(editing ? data.canEdit : data.canCreate) ? <p>Sem permissão de gravação ou catálogo ainda não aprovado.</p> : <>
      <form onSubmit={save} className="esf-entry"><label className="v2-field"><span>Data da produção</span><input type="date" required value={date} disabled={!!editing || busy} min={`${filters.month}-01`} onChange={e => setDate(e.target.value)} /></label>
        <label className="v2-field"><span>Procedimento / categoria</span><select required value={procedure} disabled={!!editing || busy} onChange={e => setProcedure(e.target.value)}><option value="">Selecione</option>{productionProcedures.map(p => <option key={p.id} value={p.id}>{p.label} · {p.code}</option>)}</select></label>
        <label className="v2-field"><span>Quantidade</span><input type="number" inputMode="numeric" min={0} max={1000000} step={1} required value={quantity} disabled={busy} onChange={e => setQuantity(e.target.value)} /></label>
        <button className="v2-button" disabled={busy}>{busy ? 'Enviando…' : editing ? 'Confirmar correção' : 'Registrar produção'}</button>
        {editing && <button className="v2-secondary" type="button" disabled={busy} onClick={() => { setEditing(null); setQuantity(''); setProcedure(''); }}>Cancelar correção</button>}
      </form>
      <DraftTools draftKey={`esf:producao:${teamId}:${filters.month}`} title="Produção diária ESF" values={values} workspace={workspace} onRestore={saved => {
        if (saved.editId) { const record = data.records.find(r => r.id === saved.editId); if (!record || String(record.version) !== saved.expectedVersion) { setMessage('O rascunho pertence a uma correção com outra versão. Abra o registro de origem; nenhuma alteração foi enviada.'); return; } setEditing(record); }
        else setEditing(null);
        setDate(saved.date ?? ''); setProcedure(saved.procedure ?? ''); setQuantity(saved.quantity ?? '');
      }} />
      <p className="v2-muted">Rascunho cifrado disponível. Reabertura do aplicativo sem rede e sincronização automática ESF ainda não homologadas.</p>
      </>}
    </section>
    <section className="v2-panel v2-section esf-no-print"><h2>Lançamentos da competência</h2><p className="v2-muted">{total} registro(s) no filtro · mais recentes primeiro</p>
      {!pageRecords.length && <p>Sem lançamentos neste recorte. Ausência de lançamento não significa produção zero.</p>}
      <div className="v2-records">{pageRecords.map(record => <article className="v2-record" key={record.id}><div><h3>{productionProcedures.find(p => p.id === record.procedure_id)?.label ?? record.procedure_id}</h3><p>{record.occurred_on.split('-').reverse().join('/')} · Quantidade: {record.quantity} · Versão {record.version}</p></div>{data.canEdit && status === 'OPEN' && <button className="v2-secondary" disabled={busy} onClick={() => { setEditing(record); setDate(record.occurred_on); setProcedure(record.procedure_id); setQuantity(String(record.quantity)); }}>Corrigir quantidade</button>}</article>)}</div>
      <nav className="v2-pagination" aria-label="Paginação da produção">{filters.page > 1 && <Link className="v2-secondary" href={`?${query}&page=${filters.page - 1}`}>Anterior</Link>}<span>Página {filters.page} de {Math.max(1, Math.ceil(total / 25))}</span>{filters.page * 25 < total && <Link className="v2-secondary" href={`?${query}&page=${filters.page + 1}`}>Próxima</Link>}</nav>
    </section>
    <section className="v2-panel v2-section esf-monthly"><p className="eyebrow">{workspace.organizationName} · {workspace.unitName}</p><h2>Mapa mensal · {filters.month}</h2><p>{teamName} · {monthlyStatusLabels[status]} · Revisão {data.monthly?.revision ?? 1}{data.demo ? ' · DEMONSTRAÇÃO' : ''}</p><p className="v2-muted">Todos os procedimentos da equipe nesta competência, independentemente do filtro da lista. {status !== 'CLOSED' && 'PRÉVIA — não é relatório definitivo.'}</p>
      <div className="esf-table-scroll"><table className="esf-table"><caption>Produção mensal por procedimento</caption><thead><tr><th scope="col">Código de referência</th><th scope="col">Procedimento</th><th scope="col">Quantidade</th></tr></thead><tbody>{productionProcedures.map(p => <tr key={p.id}><td>{p.code}</td><th scope="row">{p.label}</th><td>{summary.find(s => s.procedureId === p.id)?.quantity ?? 'Não informado'}</td></tr>)}</tbody></table></div>
      <div className="esf-no-print"><div className="dialog-actions"><button className="v2-secondary" type="button" disabled={!data.canExport} onClick={() => window.print()}>Imprimir / salvar PDF</button>{data.canExport && !data.demo && <a className="v2-secondary" href={`/api/v1/esf/production/export?${query}`}>Exportar Excel</a>}</div>{data.demo && <p className="v2-muted">Exportação Excel disponível após persistência em homologação. A impressão desta tela é uma demonstração.</p>}
        {data.monthly && <><label className="v2-field"><span>Justificativa de devolução / reabertura</span><textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><div className="dialog-actions">
          {status === 'OPEN' && data.canCreate && <button className="v2-button" disabled={busy} onClick={() => command('submit')}>Enviar ao gerente</button>}
          {status === 'IN_REVIEW' && data.canReview && <button className="v2-secondary" disabled={busy} onClick={() => command('return')}>Devolver para correção</button>}
          {status === 'IN_REVIEW' && data.canClose && <button className="v2-button" disabled={busy} onClick={() => command('close')}>Validar e fechar mapa</button>}
          {status === 'CLOSED' && data.canReopen && <button className="v2-secondary" disabled={busy} onClick={() => command('reopen')}>Reabrir com justificativa</button>}
        </div></>}
      </div>
    </section>
    <details className="v2-panel v2-section esf-no-print"><summary>Consolidação anual · {filters.month.slice(0, 4)}</summary><p className="v2-muted">Soma dos lançamentos existentes. Total parcial quando algum mês não tem informação. O fechamento continua sendo mensal.</p><div className="esf-table-scroll"><table className="esf-table"><caption>JAN a DEZ e total anual</caption><thead><tr><th scope="col">Procedimento</th>{monthNames.map(m => <th scope="col" key={m}>{m}</th>)}<th scope="col">Total</th></tr></thead><tbody>{annualProductionRows(data.annual, filters.month.slice(0, 4)).map(p => <tr key={p.id}><th scope="row">{p.label}</th>{p.months.map((quantity, i) => <td key={i}>{quantity ?? '—'}</td>)}<td>{p.total ?? 'Não informado'}{p.total !== null && p.partial ? ' (parcial)' : ''}</td></tr>)}</tbody></table></div></details></>}
  </>;
}
