'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, Search, ShieldCheck, CheckCircle2 } from 'lucide-react';
import './cnes-unit-import.css';
import { brazilStates, type CnesMunicipality, type CnesUnit, type CnesImportResult } from '@/lib/domain/cnes';

export function CnesUnitImport({ organizationId, organizationName, demo }: { organizationId: string; organizationName: string; demo: boolean }) {
  const router = useRouter();
  const [uf, setUf] = useState('CE');
  const [municipalities, setMunicipalities] = useState<CnesMunicipality[]>([]);
  const [municipality, setMunicipality] = useState('');
  const [type, setType] = useState('2');
  const [cnes, setCnes] = useState('');
  const [rows, setRows] = useState<CnesUnit[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [fetchedAt, setFetchedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const [result, setResult] = useState<CnesImportResult | null>(null);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const selectionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review || result) stepHeading.current?.focus(); else if (searched) selectionHeading.current?.focus(); }, [review, result, searched]);

  const visibleRows = rows.filter(row => `${row.name} ${row.cnes} ${row.address.neighborhood}`.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')));
  function clearResults() { setRows([]); setFilter(''); setSelection([]); setNextOffset(null); setSearched(false); setFiltersOpen(true); setReview(false); setError(''); setFetchedAt(''); }
  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    if (!navigator.onLine) throw new Error('Conecte-se à internet para consultar ou cadastrar unidades. Sua seleção foi preservada.');
    const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(65000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Não foi possível concluir. Tente novamente.');
    return body as T;
  }
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error && !(cause instanceof TypeError) && !(cause instanceof SyntaxError) && cause.name !== 'TimeoutError' ? cause.message : 'Não foi possível confirmar a resposta. Sua seleção foi preservada; tente novamente para consultar o resultado sem duplicar cadastros.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function loadMunicipalities() {
    await run(async () => {
      const data = await request<{ municipalities: CnesMunicipality[] }>(`/api/v1/admin/cnes?action=municipalities&uf=${uf}`);
      setMunicipalities(data.municipalities);
    });
  }
  async function search(offset = 0) {
    await run(async () => {
      const query = new URLSearchParams({ uf, municipality, type, offset: String(offset) });
      if (cnes) query.set('cnes', cnes);
      const data = await request<{ units: CnesUnit[]; nextOffset: number | null; fetchedAt: string }>(`/api/v1/admin/cnes?${query}`);
      setRows(previous => offset === 0 ? data.units : [...new Map([...previous, ...data.units].map(row => [row.cnes, row])).values()]);
      if (offset === 0) { setSelection([]); setFiltersOpen(false); }
      setNextOffset(data.nextOffset); setSearched(true); setFetchedAt(data.fetchedAt);
    });
  }
  function toggle(code: string) {
    if (selection.includes(code)) setSelection(selection.filter(value => value !== code));
    else if (selection.length < 20) setSelection([...selection, code]);
    else setError('Selecione até 20 unidades por cadastro. Depois, você poderá importar outro lote.');
  }
  async function confirm() {
    await run(async () => {
      const input = { organizationId, uf, municipality, type, selection: [...selection].sort() };
      const fingerprint = JSON.stringify(input);
      if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
      const data = await request<CnesImportResult>('/api/v1/admin/cnes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, operationId: operation.current.id }) });
      setResult(data); router.refresh();
    });
  }
  if (result) return <section className="v2-panel v2-section"><h2 ref={stepHeading} tabIndex={-1} style={{ scrollMarginTop: 120 }}>{result.mode === 'demo' ? 'Simulação concluída' : 'Cadastro confirmado'}</h2><p role="status">{result.created.length} unidade(s) {result.mode === 'demo' ? 'seriam cadastradas' : 'cadastrada(s)'}. {result.skipped.length} já existente(s), sem alteração.</p>{result.mode === 'demo' && <p className="v2-alert">Nenhum dado foi gravado nesta demonstração.</p>}<ul>{result.created.map(row => <li key={row.cnes}>{row.name} — CNES {row.cnes}</li>)}</ul>{result.skipped.length > 0 && <><h3>Já cadastradas</h3><ul>{result.skipped.map(row => <li key={row.cnes}>{row.name} — CNES {row.cnes}</li>)}</ul></>}<p>A unidade de trabalho atual não foi alterada.</p><Link href="/administracao/unidades" className="v2-button">Voltar às unidades</Link></section>;
  return <div className="cnes-workspace">
    <ol className="cnes-steps" aria-label="Etapas do cadastro">{['Localizar', 'Selecionar', 'Revisar e cadastrar'].map((label, index) => <li key={label} aria-current={(review ? 2 : searched ? 1 : 0) === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    {demo && <p className="cnes-demo"><ShieldCheck size={18} aria-hidden /><span><strong>Modo de teste.</strong> Consulta real ao CNES; nenhum cadastro será gravado nesta demonstração.</span></p>}
    <p className="cnes-destination">Cadastrar na organização: <strong>{organizationName}</strong></p>
    <section aria-busy={busy}>
      {error && <p role="alert" className="v2-alert" data-tone="error">{error}</p>}
      {review ? <div className="cnes-review v2-panel"><h2 ref={stepHeading} tabIndex={-1} style={{ scrollMarginTop: 120 }}>Revisar {selection.length} unidade(s)</h2><p>Destino: <strong>{organizationName}</strong>. Confira os endereços e a atualização dos cadastros. Unidades existentes serão preservadas.</p>
        {rows.filter(row => selection.includes(row.cnes)).map(row => <UnitRow key={row.cnes} row={row} />)}
        <div className="dialog-actions"><button className="v2-secondary" disabled={busy} onClick={() => setReview(false)}>Voltar à seleção</button><button className="v2-button" disabled={busy} onClick={confirm}>{busy ? 'Confirmando...' : 'Cadastrar selecionadas'}</button></div>
      </div> : <>
        {!filtersOpen && <div className="cnes-query-summary"><div><MapPin size={18} aria-hidden /><span><strong>{municipalities.find(m => m.code === municipality)?.name}/{uf}</strong> · {type === '2' ? 'Unidades básicas / Centros de saúde' : 'Postos de saúde'}{cnes && ` · CNES ${cnes}`}</span></div><button className="v2-secondary" disabled={busy} onClick={() => setFiltersOpen(true)}>Alterar busca</button></div>}
        {filtersOpen && <form className="cnes-filters v2-panel" onSubmit={event => { event.preventDefault(); void search(); }}>
          <fieldset disabled={busy}><legend>1. Localização e tipo de unidade</legend>
            <label>UF<select value={uf} onChange={event => { setUf(event.target.value); setMunicipalities([]); setMunicipality(''); clearResults(); }}>{Object.keys(brazilStates).map(value => <option key={value}>{value}</option>)}</select></label>
            <button type="button" className="v2-secondary cnes-load" onClick={loadMunicipalities}>{busy && !municipalities.length ? 'Carregando...' : 'Carregar municípios'}</button>
            <label>Município<select required value={municipality} onChange={event => { setMunicipality(event.target.value); clearResults(); }}><option value="">{municipalities.length ? 'Selecione o município' : 'Carregue os municípios da UF'}</option>{municipalities.map(value => <option key={value.code} value={value.code}>{value.name}</option>)}</select></label>
            <label>Tipo de estabelecimento<select value={type} onChange={event => { setType(event.target.value); clearResults(); }}><option value="2">Centro de saúde / Unidade básica</option><option value="1">Posto de saúde</option></select></label>
            <label>CNES específico (opcional)<input inputMode="numeric" pattern="[0-9]{7}" maxLength={7} value={cnes} onChange={event => { setCnes(event.target.value.replace(/\D/g, '')); clearResults(); }} placeholder="7 dígitos" /></label>
            <button className="v2-button cnes-search" disabled={!municipality || busy}><Search size={18} aria-hidden />{busy ? 'Consultando...' : 'Buscar unidades'}</button>
          </fieldset>
        </form>}
        {!searched && <div className="cnes-empty"><Building2 size={32} aria-hidden /><h2>Encontre as unidades do município</h2><p>Escolha a localização acima para consultar a base oficial e montar seu lote de cadastro.</p></div>}
        {searched && <div className="cnes-results"><div className="cnes-result-heading"><div><p className="v2-eyebrow">CNES · {municipalities.find(m => m.code === municipality)?.name}/{uf}</p><h2 ref={selectionHeading} tabIndex={-1} style={{ scrollMarginTop: 120 }}>Unidades encontradas</h2><p role="status">{rows.length} carregadas · {rows.filter(row => row.alreadyRegistered).length} já cadastradas{nextOffset !== null ? ' · há mais resultados' : ' · consulta completa'}</p></div><label className="cnes-local-filter">Filtrar resultados carregados<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Nome, CNES ou bairro" /></label></div><p className="cnes-timestamp">Consulta: {new Date(fetchedAt).toLocaleString('pt-BR')}. Atualização da fonte indicada em cada unidade.</p>
          {rows.length > 0 && <div className="cnes-list-actions"><button className="v2-secondary" disabled={busy || !visibleRows.some(row => !row.alreadyRegistered && !selection.includes(row.cnes)) || selection.length === 20} onClick={() => setSelection([...new Set([...selection, ...visibleRows.filter(row => !row.alreadyRegistered).map(row => row.cnes)])].slice(0, 20))}>Selecionar disponíveis (até 20)</button><button className="v2-secondary" disabled={busy || !selection.length} onClick={() => setSelection([])}>Limpar seleção</button><span>{visibleRows.length} exibidas</span></div>}
          {!rows.length && <p className="v2-empty">Nenhuma unidade ativa encontrada neste recorte.</p>}
          {rows.length > 0 && !visibleRows.length && <p className="cnes-empty">Nenhum resultado carregado corresponde ao filtro. Limpe a pesquisa ou carregue mais unidades.</p>}
          <div className="cnes-cards">{visibleRows.map(row => <article className="cnes-card" data-selected={selection.includes(row.cnes)} data-existing={row.alreadyRegistered} key={row.cnes}><div className="cnes-card-top"><Building2 size={21} aria-hidden /><span className="cnes-code">CNES {row.cnes}</span>{row.alreadyRegistered && <span className="cnes-existing"><CheckCircle2 size={14} aria-hidden />Já cadastrada</span>}</div><label className="cnes-choice"><input type="checkbox" disabled={busy || row.alreadyRegistered} checked={selection.includes(row.cnes)} onChange={() => toggle(row.cnes)} aria-label={`${row.alreadyRegistered ? 'Já cadastrada' : 'Selecionar'} ${row.name} CNES ${row.cnes}`} /><span>{row.name}</span></label><p className="cnes-address"><MapPin size={16} aria-hidden /><span>{[row.address.street, row.address.neighborhood].filter(Boolean).join(' · ') || 'Endereço não informado'}</span></p><div className="cnes-card-footer"><span>{row.address.city}/{row.address.state}</span><span>Atualização: {row.sourceUpdatedAt ? row.sourceUpdatedAt.split('-').reverse().join('/') : 'não informada'}</span></div></article>)}</div>
          {nextOffset !== null && <button className="v2-secondary" disabled={busy} onClick={() => search(nextOffset)}>Carregar mais unidades</button>}
          <div className="cnes-selection-bar"><div><strong>{selection.length} de 20 selecionadas</strong><p>{selection.length ? 'Sua seleção é mantida ao filtrar e carregar mais.' : 'Selecione as unidades que deseja cadastrar.'}</p></div><button className="v2-button" disabled={busy || selection.length === 0} onClick={() => { setError(''); setReview(true); }}>Revisar {selection.length} selecionada(s)</button></div>
        </div>}
      </>}
    </section>
    <p className="cnes-source"><ShieldCheck size={16} aria-hidden /><span>Fonte: <a href="https://apidadosabertos.saude.gov.br/v1" target="_blank" rel="noreferrer">CNES · Ministério da Saúde</a>. Somente unidades ativas. Consulta e cadastro exigem conexão.</span></p>
  </div>;
}

function UnitRow({ row }: { row: CnesUnit }) {
  return <article className="v2-record"><div><h3>{row.name}</h3><p>CNES {row.cnes} · {row.type === '2' ? 'Unidade básica / Centro de saúde' : 'Posto de saúde'}</p><p className="v2-muted">{[row.address.street, row.address.neighborhood, `${row.address.city}/${row.address.state}`, row.address.postalCode && `CEP ${row.address.postalCode}`].filter(Boolean).join(' · ')}</p><p className="v2-muted">Atualização na fonte: {row.sourceUpdatedAt ? row.sourceUpdatedAt.split('-').reverse().join('/') : 'Não informada'}</p></div></article>;
}
