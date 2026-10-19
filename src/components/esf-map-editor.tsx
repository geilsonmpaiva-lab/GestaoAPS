'use client';
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { EsfField } from '@/lib/esf/catalog';
import { blankMap, calculatedRow, displayMapValue, mapDefinition, mapStatusLabels, validateMap, type EsfMap, type MapInput, type MapPayload, type MapRow, type MapValue } from '@/lib/esf/maps';
import { localEsfDate } from '@/lib/esf/production';
import type { MapListData } from '@/lib/server/esf-maps';
import type { WorkspaceContext } from '@/lib/server/workspace';
import { DraftTools } from '@/components/draft-tools';
import { EsfMapReport } from '@/components/esf-map-report';
import { esfReferenceItems } from '@/lib/esf/reference-items';
import { EsfReceiptField } from '@/components/esf-receipt-field';
import { EsfPaperReport } from '@/components/esf-paper-report';
import { buildMapPaper } from '@/lib/esf/paper';
import { mapPayloadChanged, mapRowTitle } from '@/lib/esf/map-editor-state';

function MapFields({ fields, values, change, disabled, receipt }: { fields: EsfField[]; values: Record<string, MapValue>; change: (key: string, value: MapValue) => void; disabled: boolean; receipt?: { mapId?: string; teamId: string; version: number } }) {
  const fieldGroup = useId();
  return <div className="esf-map-fields">{fields.filter(f => f.type !== 'calculated').map((f, index) => {
    const numeric = ['integer', 'decimal'].includes(f.type), na = values[f.key] === 'Não se aplica';
    return <div className="v2-field" key={f.key}><label><span>{f.label}</span>{f.type === 'attachment' ? null : f.options ? <select aria-label={f.label} autoComplete="off" name={`esf-${fieldGroup}-${index}`} disabled={disabled} value={String(values[f.key] ?? '')} onChange={e => change(f.key, e.target.value)}><option value="">Não informado</option>{f.options.map(o => <option key={o}>{o}</option>)}</select> : <input aria-label={f.label} autoComplete="off" name={`esf-${fieldGroup}-${index}`} type={numeric ? 'number' : f.type === 'date' ? 'date' : 'text'} inputMode={numeric ? 'decimal' : undefined} min={numeric ? 0 : undefined} max={numeric ? 1000000 : undefined} step={numeric ? f.type === 'integer' ? 1 : '0.001' : undefined} maxLength={numeric || f.type === 'date' ? undefined : 1000}
      placeholder={['name', 'motherName', 'patientName', 'professionalId'].includes(f.key) ? '[SINTÉTICO] Nome de teste' : 'Não informado'} disabled={disabled || na} value={na ? '' : values[f.key] ?? ''} onChange={e => change(f.key, numeric ? e.target.value === '' ? null : Number(e.target.value) : e.target.value)} />}</label>
      {f.type === 'attachment' && receipt && <EsfReceiptField {...receipt} disabled={disabled} value={String(values[f.key] ?? '')} change={id => change(f.key, id)} />}
      {numeric && <label className="esf-map-na"><input type="checkbox" disabled={disabled} checked={na} onChange={e => change(f.key, e.target.checked ? 'Não se aplica' : null)} />Não se aplica a {f.label.toLowerCase()}</label>}
      {f.review && <small>{f.review}</small>}{f.type === 'select' && !f.options && <small>Transcrição para conferência; opções institucionais ainda não aprovadas.</small>}</div>;
  })}</div>;
}

const subscribeReady = () => () => {};
export function EsfMapEditor({ form, initial, workspace }: { form: string; initial: MapListData; workspace: WorkspaceContext }) {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const uxV3 = workspace.uxV3 === true;
  const [view, setView] = useState<'fill' | 'review'>(initial.current ? 'review' : 'fill');
  const fillButton = useRef<HTMLButtonElement>(null), reviewButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const def = mapDefinition(form)!;
  const router = useRouter();
  const [map, setMap] = useState<EsfMap | null>(initial.current);
  const [payload, setPayload] = useState<MapPayload>(initial.current?.payload ?? blankMap(form, workspace.userName));
  const [baselineCompetency] = useState(initial.current?.competency ?? localEsfDate().slice(0, 7));
  const [competency, setCompetency] = useState(baselineCompetency);
  const [sectionId, setSectionId] = useState(def.sections[0].id);
  const [row, setRow] = useState<MapRow | null>(null);
  const [values, setValues] = useState<Record<string, MapValue>>({});
  const [page, setPage] = useState(1);
  const [sending, setBusy] = useState(false), [message, setMessage] = useState(''), [reason, setReason] = useState('');
  const [failed, setFailed] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const busy = sending || navigating;
  const [conflict, setConflict] = useState<EsfMap | null>(null);
  const [newId] = useState(() => crypto.randomUUID());
  const pending = useRef<{ fingerprint: string; input: MapInput } | null>(null);
  const baselinePayload = map?.payload ?? blankMap(form, workspace.userName);
  const dirty = mapPayloadChanged(baselinePayload, payload) || competency !== (map?.competency ?? baselineCompetency) || Object.keys(values).length > 0;
  const path = `/formularios-esf/${form}`;
  const section = def.sections.find(s => s.id === sectionId)!;
  const rows = payload.sections[sectionId] ?? [];
  const permission = (op: string) => workspace.permissions.some(p => (p.domain === '*' || p.domain === `esf.${form}`) && (p.operations.includes('*') || p.operations.includes(op)));
  const editable = ready && initial.canWrite && (!map || map.status === 'OPEN') && !busy;
  const teamName = initial.teams.find(t => t.id === initial.teamId)?.name ?? 'Sem equipe autorizada';
  const itemPending = Object.keys(values).length > 0;
  const warnOnLeave = dirty || uxV3 && (busy || reason.trim().length > 0);
  const saveState = busy ? 'Salvando mapa…' : dirty ? 'Alterações não salvas' : map ? `Salvo no sistema · versão ${map.version}` : 'Novo mapa ainda não salvo';
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (warnOnLeave) { e.preventDefault(); e.returnValue = ''; } };
    const protectLink = (e: MouseEvent) => {
      if (!uxV3 || !warnOnLeave || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.href === window.location.href) return;
      if (busy || !window.confirm('Há alterações não salvas neste mapa. Sair agora pode perder esses dados. Deseja sair sem salvar?')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', protectLink, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', protectLink, true); };
  }, [warnOnLeave, uxV3, busy]);

  function addRow(e: React.FormEvent) {
    e.preventDefault();
    if (!editable || !row && rows.length >= 250) return;
    const next = { id: row?.id ?? crypto.randomUUID(), values };
    setPayload(p => ({ ...p, sections: { ...p.sections, [sectionId]: row ? rows.map(r => r.id === row.id ? next : r) : [...rows, next] } }));
    setPage(Math.ceil((row ? rows.length : rows.length + 1) / 25)); setRow(null); setValues({}); setFailed(false);
    setMessage(uxV3 ? 'Item incluído no mapa. Use “Salvar mapa” para guardar os itens e atualizar o PDF. Nada foi salvo automaticamente.' : 'Linha preparada nesta tela. Confirme o mapa no servidor para persistir e atualizar o PDF.');
    if (uxV3) { setView('review'); reviewButton.current?.focus(); }
  }
  async function command(action: MapInput['action']) {
    setBusy(true); setMessage(''); setFailed(false);
    try {
      if (Object.keys(values).length) throw new Error(uxV3 ? 'O item em preenchimento ainda não faz parte do mapa. Use “Adicionar item ao mapa” ou “Atualizar item no mapa” antes de salvar.' : 'Adicione ou atualize a linha nesta tela antes de confirmar o mapa.');
      const base = { entityId: map?.id ?? newId, expectedVersion: map?.version ?? 0, templateId: form, competency, teamId: initial.teamId, action, reason, synthetic: true as const, payload };
      const fingerprint = JSON.stringify(base);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, input: validateMap({ ...base, operationId: crypto.randomUUID(), deviceId: crypto.randomUUID(), localTimestamp: new Date().toISOString() }) };
      const response = await fetch('/api/v1/esf/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current.input) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 && map) { const remote = await fetch(`/api/v1/esf/maps?form=${form}&team=${initial.teamId}&map=${map.id}`, { cache: 'no-store' }); if (remote.ok) setConflict((await remote.json()).current); }
        throw new Error(result.error ?? (uxV3 ? 'Não foi possível salvar. Suas alterações foram preservadas nesta tela; tente novamente ou guarde um rascunho neste dispositivo.' : 'Não foi possível confirmar. Campos e operação preservados.'));
      }
      setMap({ ...base, id: result.id, template_id: form, team_id: initial.teamId, version: result.version, revision: result.revision, status: result.status });
      setReason(''); pending.current = null; setConflict(null); setMessage(uxV3 ? 'Salvo no sistema. O PDF será preenchido com esta versão do mapa.' : 'Confirmado pelo servidor. O PDF usa esta versão salva.');
      startNavigation(() => router.replace(`${path}?team=${initial.teamId}&map=${result.id}`, { scroll: false }));
    } catch (error) { setFailed(true); setMessage(uxV3 && error instanceof TypeError ? 'Não foi possível conectar para salvar. Seus dados continuam nesta tela. Tente novamente ou guarde um rascunho neste dispositivo.' : error instanceof Error ? error.message : 'Falha. Nenhum campo foi descartado.'); }
    finally { setBusy(false); }
  }
  const reportMap: EsfMap = { id: map?.id ?? newId, template_id: form, team_id: initial.teamId, competency, payload, version: map?.version ?? 0, revision: map?.revision ?? 1, status: map?.status ?? 'OPEN' };
  return <div inert={!ready}>
    <section className="v2-panel v2-section"><h2>Homologação com dados sintéticos</h2><p className="v2-alert">Não informe dados reais. Campos nominais exigem o prefixo [SINTÉTICO]. Este mapa não movimenta o estoque operacional, não calcula doses e não aprova regras institucionais.</p>
      <form action={path} autoComplete="off" className="v2-toolbar"><label className="v2-field"><span>Equipe ESF</span><select aria-label="Equipe ESF" name="team" defaultValue={initial.teamId}>{initial.teams.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label><button className="v2-secondary" disabled={warnOnLeave || busy}>Trocar equipe / abrir novo mapa</button></form>
      <p>{workspace.unitName} · {teamName} · {map ? `${mapStatusLabels[map.status]} · versão ${map.version}` : 'Novo mapa não salvo'}</p>
      {!initial.teamId && <p role="alert">Sem equipe ou permissão para este formulário. Cadastre uma equipe sintética autorizada antes de lançar dados.</p>}
    </section>
    <div role={uxV3 && failed ? 'alert' : 'status'} aria-live={uxV3 && failed ? 'assertive' : 'polite'}>{message && <p className="v2-alert">{message}</p>}</div>
    {initial.teamId && <>{uxV3 && <><p role="status">{saveState}</p><nav className="v2-tabs esf-map-screen-controls" aria-label="Etapas do mapa"><button ref={fillButton} type="button" aria-controls={`${panelId}-fill`} aria-current={view === 'fill' ? 'page' : undefined} onClick={() => setView('fill')}>Preencher itens</button><button ref={reviewButton} type="button" aria-controls={`${panelId}-review`} aria-current={view === 'review' ? 'page' : undefined} onClick={() => setView('review')}>Conferir mapa e PDF</button></nav></>}
    <section id={`${panelId}-fill`} className={`v2-panel v2-section${uxV3 && view !== 'fill' ? ' esf-map-screen-hidden' : ''}`}><h2>Cabeçalho do mapa</h2><label className="v2-field"><span>Competência do mapa</span><input type="month" min="2000-01" max="2100-12" value={competency} disabled={!!map || !editable} onChange={e => setCompetency(e.target.value)} /></label>
      <MapFields fields={def.headers} values={payload.headers} disabled={!editable} change={(key, value) => setPayload(p => ({ ...p, headers: { ...p.headers, [key]: value } }))} />
    </section>
    <section className="v2-panel v2-section"><h2>{uxV3 ? view === 'fill' ? 'Preenchimento dos itens' : 'Itens do mapa' : 'Registros do mapa'}</h2><p>Até 250 {uxV3 ? 'itens' : 'linhas'} por seção. A lista exibe 25 por página. Campos calculados aparecem na prévia, não são editáveis.</p>
      {editable && esfReferenceItems[form] && <div className={uxV3 && view !== 'fill' ? 'esf-map-screen-hidden' : undefined}><p>Referências transcritas do modelo revisado, sem aprovação de catálogo ou quantidades. É possível incluir outros itens pela entrada abaixo.</p><button type="button" className="v2-secondary" disabled={rows.length > 0 || Object.keys(values).length > 0} onClick={() => {
        setPayload(p => ({ ...p, sections: { ...p.sections, records: esfReferenceItems[form].map(item => ({ id: crypto.randomUUID(), values: { sourceLine: item.line, itemId: item.label } })) } })); setFailed(false); setMessage(uxV3 ? 'Itens do modelo incluídos sem quantidades. Confira cada item e use “Salvar mapa” para guardar suas alterações.' : 'Linhas documentais preparadas sem quantidades. Confira unidades, lotes e saldos antes de confirmar.');
        if (uxV3) { setView('review'); reviewButton.current?.focus(); }
      }}>{uxV3 ? 'Incluir itens do modelo sem quantidades' : 'Carregar linhas do modelo sem quantidades'}</button></div>}
      {def.sections.length > 1 && <label className="v2-field"><span>Bloco do formulário</span><select aria-label="Bloco do formulário" disabled={Object.keys(values).length > 0} value={sectionId} onChange={e => { setSectionId(e.target.value); setRow(null); setValues({}); setPage(1); }}>{def.sections.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select></label>}
      {editable && <form className={uxV3 && view !== 'fill' ? 'esf-map-screen-hidden' : undefined} autoComplete="off" onSubmit={addRow}><h3>{uxV3 ? row ? 'Editar item' : 'Novo item' : row ? 'Editar linha preparada' : 'Adicionar lançamento'}</h3>{uxV3 && <p className="v2-muted">Preencha os campos e adicione o item ao mapa. Depois, use “Salvar mapa” para guardar todos os itens. Não há salvamento automático.</p>}
      {esfReferenceItems[form]&&<label className="v2-field"><span>Item do formulário revisado</span><select aria-label="Item do formulário revisado" disabled={busy} value={esfReferenceItems[form].find(item=>item.label===values.itemId&&item.line===values.sourceLine)?.line??''} onChange={e=>{const item=esfReferenceItems[form].find(item=>item.line===e.target.value);if(item)setValues(v=>({...v,itemId:item.label,sourceLine:item.line}));}}><option value="">Selecionar item impresso ou informar outro abaixo</option>{esfReferenceItems[form].map(item=><option value={item.line} key={item.line}>{item.line} · {item.label}</option>)}</select><small>Vincula à linha exata do papel. Referência documental, sem aprovação institucional do catálogo. Outros itens serão identificados separadamente na impressão.</small></label>}
      <MapFields fields={section.fields} values={values} disabled={busy} receipt={{ mapId: map?.id, teamId: initial.teamId, version: map?.version ?? 0 }} change={(key, value) => setValues(v => ({ ...v, [key]: value }))} />
      <dl className="esf-report-meta">{section.fields.filter(f => f.type === 'calculated').map(f => <div key={f.key}><dt>{f.label}</dt><dd>{displayMapValue(calculatedRow(form, section.id, values)[f.key])}</dd></div>)}</dl>
      <button className="v2-secondary" disabled={busy || !row && rows.length >= 250}>{uxV3 ? row ? 'Atualizar item no mapa' : 'Adicionar item ao mapa' : row ? 'Atualizar linha nesta tela' : 'Adicionar linha nesta tela'}</button>{Object.keys(values).length > 0 && <button type="button" className="v2-secondary" disabled={busy} onClick={() => { if (window.confirm(uxV3 ? 'Descartar somente a edição deste item? Os itens já adicionados ao mapa serão preservados.' : 'Descartar somente a edição desta linha ainda não adicionada? Os registros já adicionados serão preservados.')) { setRow(null); setValues({}); } }}>Descartar edição não adicionada</button>}</form>}
      <div id={`${panelId}-review`} className={uxV3 && view !== 'review' ? 'esf-map-screen-hidden' : undefined}>
      <p>{rows.length} {uxV3 ? 'item(ns)' : 'registro(s)'} neste bloco{uxV3 ? ` · ${saveState}` : dirty ? ' · Há dados ainda não confirmados no servidor' : ' · Dados confirmados'}</p>
      {uxV3 && editable && <button type="button" className="v2-secondary" onClick={() => { setView('fill'); fillButton.current?.focus(); }}>{itemPending ? 'Continuar item em preenchimento' : 'Adicionar outro item'}</button>}
      {uxV3 && rows.length === 0 && <p className="v2-muted">Nenhum item foi adicionado a este bloco. Abra “Preencher itens” para começar.</p>}
      <ol className="v2-records" start={(page - 1) * 25 + 1}>{rows.slice((page - 1) * 25, page * 25).map((r, i) => {
        const position = (page - 1) * 25 + i + 1, title = uxV3 ? mapRowTitle(section.fields, r.values, position) : `Linha ${position}`;
        return <li className="v2-record" key={r.id}><div><h3>{title}</h3><p>{section.fields.filter(f => r.values[f.key] !== undefined && r.values[f.key] !== '').slice(0, 3).map(f => `${f.label}: ${displayMapValue(r.values[f.key])}`).join(' · ') || 'Registro incompleto'}</p></div>{editable && <button className="v2-secondary" aria-label={uxV3 ? `Editar ${title}` : undefined} disabled={itemPending} onClick={() => { setRow(r); setValues({ ...r.values }); if (uxV3) { setView('fill'); fillButton.current?.focus(); } }}>{uxV3 ? 'Editar item' : `Editar linha ${position}`}</button>}</li>;
      })}</ol>
      <nav aria-label="Paginação dos lançamentos" className="v2-pagination"><button className="v2-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(rows.length / 25))}</span><button className="v2-secondary" disabled={page * 25 >= rows.length} onClick={() => setPage(p => p + 1)}>Próxima</button></nav></div>
    </section>
    <section className="v2-panel v2-section"><h2>{uxV3 ? 'Salvar mapa e revisar' : 'Persistência e relatório'}</h2><p>{uxV3 ? itemPending ? 'Há um item em preenchimento que ainda não foi adicionado ao mapa. Conclua esse item antes de salvar.' : dirty || !map ? 'Use “Salvar mapa” para guardar o cabeçalho e os itens adicionados. O PDF só estará disponível depois de salvar.' : 'Mapa salvo no sistema. O PDF usa esta versão, com os campos preenchidos e os totais calculados.' : dirty ? 'Os dados desta tela ainda não atualizam o PDF salvo.' : 'O PDF será preenchido com a versão confirmada no servidor.'}</p>
      {editable && dirty && !conflict && <button type="button" className="v2-secondary" disabled={busy} onClick={() => {
        if (!window.confirm(uxV3 ? 'Descartar as alterações não salvas deste mapa? Mapas salvos, comprovantes enviados e rascunhos neste dispositivo serão preservados.' : 'Descartar somente as alterações não confirmadas desta tela? Mapas salvos, comprovantes enviados e rascunhos no cofre serão preservados.')) return;
        setPayload(structuredClone(baselinePayload)); setCompetency(map?.competency ?? baselineCompetency); setRow(null); setValues({}); setReason(''); pending.current = null;
        setFailed(false); setMessage(uxV3 ? 'Alterações não salvas descartadas. Nenhum mapa salvo ou rascunho neste dispositivo foi excluído.' : 'Alterações locais descartadas. Nenhum registro salvo ou rascunho do cofre foi excluído.');
      }}>{uxV3 ? 'Descartar alterações não salvas' : 'Descartar alterações não confirmadas'}</button>}
      {editable && <button className="v2-button" disabled={busy || uxV3 && itemPending} onClick={() => command('save')}>{uxV3 ? 'Salvar mapa' : 'Confirmar mapa no servidor'}</button>}
      {map && !dirty && permission('exportar') && <a className="v2-secondary" href={`${path}/impressao?team=${initial.teamId}&map=${map.id}`} target="_blank" rel="noreferrer">Abrir formulário preenchido / PDF</a>}
      {map && !dirty && <div className={uxV3 && view !== 'review' ? 'esf-map-screen-hidden' : undefined}><label className="v2-field"><span>Justificativa de devolução / reabertura</span><textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><div className="dialog-actions">
        {map.status === 'OPEN' && permission('criar') && <button className="v2-secondary" disabled={busy} onClick={() => command('submit')}>Enviar à revisão de teste</button>}
        {map.status === 'IN_REVIEW' && permission('aprovar') && <button className="v2-secondary" disabled={busy} onClick={() => command('return')}>Devolver para correção</button>}
        {map.status === 'IN_REVIEW' && permission('encerrar') && <button className="v2-button" disabled={busy} onClick={() => command('close')}>Fechar mapa de teste</button>}
        {map.status === 'CLOSED' && permission('reabrir') && <button className="v2-secondary" disabled={busy} onClick={() => command('reopen')}>Reabrir mapa de teste</button>}
      </div></div>}
      <p className="v2-muted">Fechamento de teste não é aprovação institucional. Comprovantes fictícios são enviados online ao armazenamento privado. Sincronização automática destes mapas e retomada offline de anexos continuam pendentes; não há descarte automático de pendências.</p>
      {uxV3 && editable && <p className="v2-muted">O rascunho fica salvo somente neste dispositivo e não atualiza o mapa no sistema nem o PDF.{itemPending ? ' Adicione o item em preenchimento ao mapa para poder guardar esse rascunho.' : ''}</p>}
      {editable && !(uxV3 && itemPending) && <DraftTools draftKey={`esf-map:${form}:${initial.teamId}:${map?.id ?? newId}`} workspace={workspace} title={def.template.title} values={{ payload: JSON.stringify(payload), competency }} onRestore={v => {
        try { const restored = JSON.parse(v.payload ?? ''); validateMap({ operationId: crypto.randomUUID(), entityId: map?.id ?? newId, expectedVersion: map?.version ?? 0, templateId: form, competency: v.competency, teamId: initial.teamId, action: 'save', synthetic: true, payload: restored, deviceId: crypto.randomUUID(), localTimestamp: new Date().toISOString() }); if (uxV3 && dirty && !window.confirm('Substituir as alterações não salvas desta tela pelo rascunho neste dispositivo? O mapa salvo no sistema não será alterado.')) return; setPayload(restored); if (!map) setCompetency(v.competency); }
        catch { setFailed(true); setMessage('Rascunho inválido. Nenhuma alteração foi enviada.'); }
      }} />}
    </section>
    {conflict && <section className="v2-panel v2-section"><h2>Conflito: sua cópia foi preservada</h2><p>Compare a prévia desta tela com a versão {uxV3 ? 'salva' : 'confirmada'} abaixo antes de decidir. Não há mesclagem automática.</p><details><summary>{uxV3 ? 'Versão salva no sistema' : 'Versão confirmada no servidor'}</summary><EsfMapReport map={conflict} organization={workspace.organizationName} unit={workspace.unitName} team={teamName} /></details><button className="v2-secondary" onClick={() => { setMap(conflict); setPayload(conflict.payload); setConflict(null); pending.current = null; setFailed(false); setMessage(uxV3 ? 'Versão salva no sistema adotada por sua escolha.' : 'Versão do servidor adotada por escolha explícita.'); }}>{uxV3 ? 'Usar a versão salva no sistema' : 'Substituir esta cópia pela versão do servidor'}</button></section>}
    <details className={`v2-panel v2-section${uxV3 && view !== 'review' ? ' esf-map-screen-hidden' : ''}`}><summary>Prévia fiel ao formulário revisado {uxV3 ? dirty || !map ? '(alterações não salvas)' : '(salvo no sistema)' : dirty ? '(dados não confirmados)' : '(dados confirmados)'}</summary><EsfPaperReport document={buildMapPaper(reportMap,{organization:workspace.organizationName,unit:workspace.unitName,team:teamName})} /></details>
    </>}
    <section className={`v2-panel v2-section${uxV3 && view !== 'review' ? ' esf-map-screen-hidden' : ''}`}><h2>Mapas recentes desta equipe</h2><p>Até 25 mapas recentes. Para abrir um mapa, {uxV3 ? 'salve ou descarte' : 'confirme'} antes suas alterações.</p>{initial.maps.map(m => <p key={m.id}><button className="v2-secondary" disabled={busy || warnOnLeave} onClick={() => router.push(`${path}?team=${initial.teamId}&map=${m.id}`)}>Abrir {m.competency} · {mapStatusLabels[m.status]} · {m.id.slice(0, 8)}</button></p>)}</section>
    <style jsx>{`@media screen { .esf-map-screen-hidden { display: none; } } @media print { .esf-map-screen-controls { display: none; } }`}</style>
  </div>;
}
