'use client';
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
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

function MapFields({ fields, values, change, disabled, receipt }: { fields: EsfField[]; values: Record<string, MapValue>; change: (key: string, value: MapValue) => void; disabled: boolean; receipt?: { mapId?: string; teamId: string; version: number } }) {
  return <div className="esf-map-fields">{fields.filter(f => f.type !== 'calculated').map(f => {
    const numeric = ['integer', 'decimal'].includes(f.type), na = values[f.key] === 'Não se aplica';
    return <div className="v2-field" key={f.key}><label><span>{f.label}</span>{f.type === 'attachment' ? null : f.options ? <select aria-label={f.label} disabled={disabled} value={String(values[f.key] ?? '')} onChange={e => change(f.key, e.target.value)}><option value="">Não informado</option>{f.options.map(o => <option key={o}>{o}</option>)}</select> : <input aria-label={f.label} type={numeric ? 'number' : f.type === 'date' ? 'date' : 'text'} inputMode={numeric ? 'decimal' : undefined} min={numeric ? 0 : undefined} max={numeric ? 1000000 : undefined} step={numeric ? f.type === 'integer' ? 1 : '0.001' : undefined} maxLength={numeric || f.type === 'date' ? undefined : 1000}
      placeholder={['name', 'motherName', 'patientName', 'professionalId'].includes(f.key) ? '[SINTÉTICO] Nome de teste' : 'Não informado'} disabled={disabled || na} value={na ? '' : values[f.key] ?? ''} onChange={e => change(f.key, numeric ? e.target.value === '' ? null : Number(e.target.value) : e.target.value)} />}</label>
      {f.type === 'attachment' && receipt && <EsfReceiptField {...receipt} disabled={disabled} value={String(values[f.key] ?? '')} change={id => change(f.key, id)} />}
      {numeric && <label className="esf-map-na"><input type="checkbox" disabled={disabled} checked={na} onChange={e => change(f.key, e.target.checked ? 'Não se aplica' : null)} />Não se aplica a {f.label.toLowerCase()}</label>}
      {f.review && <small>{f.review}</small>}{f.type === 'select' && !f.options && <small>Transcrição para conferência; opções institucionais ainda não aprovadas.</small>}</div>;
  })}</div>;
}

const subscribeReady = () => () => {};
export function EsfMapEditor({ form, initial, workspace }: { form: string; initial: MapListData; workspace: WorkspaceContext }) {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const def = mapDefinition(form)!;
  const router = useRouter();
  const [map, setMap] = useState<EsfMap | null>(initial.current);
  const [payload, setPayload] = useState<MapPayload>(initial.current?.payload ?? blankMap(form, workspace.userName));
  const [competency, setCompetency] = useState(initial.current?.competency ?? localEsfDate().slice(0, 7));
  const [sectionId, setSectionId] = useState(def.sections[0].id);
  const [row, setRow] = useState<MapRow | null>(null);
  const [values, setValues] = useState<Record<string, MapValue>>({});
  const [page, setPage] = useState(1);
  const [sending, setBusy] = useState(false), [message, setMessage] = useState(''), [reason, setReason] = useState('');
  const [navigating, startNavigation] = useTransition();
  const busy = sending || navigating;
  const [conflict, setConflict] = useState<EsfMap | null>(null);
  const [newId] = useState(() => crypto.randomUUID());
  const pending = useRef<{ fingerprint: string; input: MapInput } | null>(null);
  const dirty = JSON.stringify(map?.payload ?? blankMap(form, workspace.userName)) !== JSON.stringify(payload) || Object.keys(values).length > 0;
  const path = `/formularios-esf/${form}`;
  const section = def.sections.find(s => s.id === sectionId)!;
  const rows = payload.sections[sectionId] ?? [];
  const permission = (op: string) => workspace.permissions.some(p => (p.domain === '*' || p.domain === `esf.${form}`) && (p.operations.includes('*') || p.operations.includes(op)));
  const editable = ready && initial.canWrite && (!map || map.status === 'OPEN') && !busy;
  const teamName = initial.teams.find(t => t.id === initial.teamId)?.name ?? 'Sem equipe autorizada';
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  function addRow(e: React.FormEvent) {
    e.preventDefault();
    if (!editable || !row && rows.length >= 250) return;
    const next = { id: row?.id ?? crypto.randomUUID(), values };
    setPayload(p => ({ ...p, sections: { ...p.sections, [sectionId]: row ? rows.map(r => r.id === row.id ? next : r) : [...rows, next] } }));
    setPage(Math.ceil((row ? rows.length : rows.length + 1) / 25)); setRow(null); setValues({}); setMessage('Linha preparada nesta tela. Confirme o mapa no servidor para persistir e atualizar o PDF.');
  }
  async function command(action: MapInput['action']) {
    setBusy(true); setMessage('');
    try {
      if (Object.keys(values).length) throw new Error('Adicione ou atualize a linha nesta tela antes de confirmar o mapa.');
      const base = { entityId: map?.id ?? newId, expectedVersion: map?.version ?? 0, templateId: form, competency, teamId: initial.teamId, action, reason, synthetic: true as const, payload };
      const fingerprint = JSON.stringify(base);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, input: validateMap({ ...base, operationId: crypto.randomUUID(), deviceId: crypto.randomUUID(), localTimestamp: new Date().toISOString() }) };
      const response = await fetch('/api/v1/esf/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current.input) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 && map) { const remote = await fetch(`/api/v1/esf/maps?form=${form}&team=${initial.teamId}&map=${map.id}`, { cache: 'no-store' }); if (remote.ok) setConflict((await remote.json()).current); }
        throw new Error(result.error ?? 'Não foi possível confirmar. Campos e operação preservados.');
      }
      setMap({ ...base, id: result.id, template_id: form, team_id: initial.teamId, version: result.version, revision: result.revision, status: result.status });
      setReason(''); pending.current = null; setConflict(null); setMessage('Confirmado pelo servidor. O PDF usa esta versão salva.');
      startNavigation(() => router.replace(`${path}?team=${initial.teamId}&map=${result.id}`, { scroll: false }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha. Nenhum campo foi descartado.'); }
    finally { setBusy(false); }
  }
  const reportMap: EsfMap = { id: map?.id ?? newId, template_id: form, team_id: initial.teamId, competency, payload, version: map?.version ?? 0, revision: map?.revision ?? 1, status: map?.status ?? 'OPEN' };
  return <div inert={!ready}>
    <section className="v2-panel v2-section"><h2>Homologação com dados sintéticos</h2><p className="v2-alert">Não informe dados reais. Campos nominais exigem o prefixo [SINTÉTICO]. Este mapa não movimenta o estoque operacional, não calcula doses e não aprova regras institucionais.</p>
      <form action={path} className="v2-toolbar"><label className="v2-field"><span>Equipe ESF</span><select aria-label="Equipe ESF" name="team" defaultValue={initial.teamId}>{initial.teams.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label><button className="v2-secondary" disabled={dirty || busy}>Trocar equipe / abrir novo mapa</button></form>
      <p>{workspace.unitName} · {teamName} · {map ? `${mapStatusLabels[map.status]} · versão ${map.version}` : 'Novo mapa não salvo'}</p>
      {!initial.teamId && <p role="alert">Sem equipe ou permissão para este formulário. Cadastre uma equipe sintética autorizada antes de lançar dados.</p>}
    </section>
    <div role="status" aria-live="polite">{message && <p className="v2-alert">{message}</p>}</div>
    {initial.teamId && <><section className="v2-panel v2-section"><h2>Cabeçalho do mapa</h2><label className="v2-field"><span>Competência do mapa</span><input type="month" min="2000-01" max="2100-12" value={competency} disabled={!!map || !editable} onChange={e => setCompetency(e.target.value)} /></label>
      <MapFields fields={def.headers} values={payload.headers} disabled={!editable} change={(key, value) => setPayload(p => ({ ...p, headers: { ...p.headers, [key]: value } }))} />
    </section>
    <section className="v2-panel v2-section"><h2>Registros do mapa</h2><p>Até 250 linhas por seção. A lista exibe 25 por página. Campos calculados aparecem na prévia, não são editáveis.</p>
      {editable && esfReferenceItems[form] && <><p>Referências transcritas do modelo revisado, sem aprovação de catálogo ou quantidades. É possível incluir outros itens pela entrada abaixo.</p><button type="button" className="v2-secondary" disabled={rows.length > 0 || Object.keys(values).length > 0} onClick={() => {
        setPayload(p => ({ ...p, sections: { ...p.sections, records: esfReferenceItems[form].map(item => ({ id: crypto.randomUUID(), values: { sourceLine: item.line, itemId: item.label } })) } })); setMessage('Linhas documentais preparadas sem quantidades. Confira unidades, lotes e saldos antes de confirmar.');
      }}>Carregar linhas do modelo sem quantidades</button></>}
      {def.sections.length > 1 && <label className="v2-field"><span>Bloco do formulário</span><select aria-label="Bloco do formulário" disabled={Object.keys(values).length > 0} value={sectionId} onChange={e => { setSectionId(e.target.value); setRow(null); setValues({}); setPage(1); }}>{def.sections.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select></label>}
      {editable && <form onSubmit={addRow}><h3>{row ? 'Editar linha preparada' : 'Adicionar lançamento'}</h3>
      {esfReferenceItems[form]&&<label className="v2-field"><span>Item do formulário revisado</span><select aria-label="Item do formulário revisado" disabled={busy} value={esfReferenceItems[form].find(item=>item.label===values.itemId&&item.line===values.sourceLine)?.line??''} onChange={e=>{const item=esfReferenceItems[form].find(item=>item.line===e.target.value);if(item)setValues(v=>({...v,itemId:item.label,sourceLine:item.line}));}}><option value="">Selecionar item impresso ou informar outro abaixo</option>{esfReferenceItems[form].map(item=><option value={item.line} key={item.line}>{item.line} · {item.label}</option>)}</select><small>Vincula à linha exata do papel. Referência documental, sem aprovação institucional do catálogo. Outros itens serão identificados separadamente na impressão.</small></label>}
      <MapFields fields={section.fields} values={values} disabled={busy} receipt={{ mapId: map?.id, teamId: initial.teamId, version: map?.version ?? 0 }} change={(key, value) => setValues(v => ({ ...v, [key]: value }))} />
      <dl className="esf-report-meta">{section.fields.filter(f => f.type === 'calculated').map(f => <div key={f.key}><dt>{f.label}</dt><dd>{displayMapValue(calculatedRow(form, section.id, values)[f.key])}</dd></div>)}</dl>
      <button className="v2-secondary" disabled={busy || !row && rows.length >= 250}>{row ? 'Atualizar linha nesta tela' : 'Adicionar linha nesta tela'}</button>{Object.keys(values).length > 0 && <button type="button" className="v2-secondary" disabled={busy} onClick={() => { if (window.confirm('Descartar somente a edição desta linha ainda não adicionada? Os registros já adicionados serão preservados.')) { setRow(null); setValues({}); } }}>Descartar edição não adicionada</button>}</form>}
      <p>{rows.length} registro(s) neste bloco{dirty ? ' · Há dados ainda não confirmados no servidor' : ' · Dados confirmados'}</p>
      <ol className="v2-records" start={(page - 1) * 25 + 1}>{rows.slice((page - 1) * 25, page * 25).map((r, i) => <li className="v2-record" key={r.id}><div><h3>Linha {(page - 1) * 25 + i + 1}</h3><p>{section.fields.filter(f => r.values[f.key] !== undefined && r.values[f.key] !== '').slice(0, 3).map(f => `${f.label}: ${displayMapValue(r.values[f.key])}`).join(' · ') || 'Registro incompleto'}</p></div>{editable && <button className="v2-secondary" disabled={Object.keys(values).length > 0} onClick={() => { setRow(r); setValues({ ...r.values }); }}>Editar linha {(page - 1) * 25 + i + 1}</button>}</li>)}</ol>
      <nav aria-label="Paginação dos lançamentos" className="v2-pagination"><button className="v2-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(rows.length / 25))}</span><button className="v2-secondary" disabled={page * 25 >= rows.length} onClick={() => setPage(p => p + 1)}>Próxima</button></nav>
    </section>
    <section className="v2-panel v2-section"><h2>Persistência e relatório</h2><p>{dirty ? 'Os dados desta tela ainda não atualizam o PDF salvo.' : 'O PDF será preenchido com a versão confirmada no servidor.'}</p>
      {editable && <button className="v2-button" disabled={busy} onClick={() => command('save')}>Confirmar mapa no servidor</button>}
      {map && !dirty && permission('exportar') && <a className="v2-secondary" href={`${path}/impressao?team=${initial.teamId}&map=${map.id}`} target="_blank" rel="noreferrer">Abrir formulário preenchido / PDF</a>}
      {map && !dirty && <><label className="v2-field"><span>Justificativa de devolução / reabertura</span><textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><div className="dialog-actions">
        {map.status === 'OPEN' && permission('criar') && <button className="v2-secondary" disabled={busy} onClick={() => command('submit')}>Enviar à revisão de teste</button>}
        {map.status === 'IN_REVIEW' && permission('aprovar') && <button className="v2-secondary" disabled={busy} onClick={() => command('return')}>Devolver para correção</button>}
        {map.status === 'IN_REVIEW' && permission('encerrar') && <button className="v2-button" disabled={busy} onClick={() => command('close')}>Fechar mapa de teste</button>}
        {map.status === 'CLOSED' && permission('reabrir') && <button className="v2-secondary" disabled={busy} onClick={() => command('reopen')}>Reabrir mapa de teste</button>}
      </div></>}
      <p className="v2-muted">Fechamento de teste não é aprovação institucional. Comprovantes fictícios são enviados online ao armazenamento privado. Sincronização automática destes mapas e retomada offline de anexos continuam pendentes; não há descarte automático de pendências.</p>
      {editable && <DraftTools draftKey={`esf-map:${form}:${initial.teamId}:${map?.id ?? newId}`} workspace={workspace} title={def.template.title} values={{ payload: JSON.stringify(payload), competency }} onRestore={v => {
        try { const restored = JSON.parse(v.payload ?? ''); validateMap({ operationId: crypto.randomUUID(), entityId: map?.id ?? newId, expectedVersion: map?.version ?? 0, templateId: form, competency: v.competency, teamId: initial.teamId, action: 'save', synthetic: true, payload: restored, deviceId: crypto.randomUUID(), localTimestamp: new Date().toISOString() }); setPayload(restored); if (!map) setCompetency(v.competency); }
        catch { setMessage('Rascunho inválido. Nenhuma alteração foi enviada.'); }
      }} />}
    </section>
    {conflict && <section className="v2-panel v2-section"><h2>Conflito: sua cópia foi preservada</h2><p>Compare a prévia desta tela com a versão confirmada abaixo antes de decidir. Não há mesclagem automática.</p><details><summary>Versão confirmada no servidor</summary><EsfMapReport map={conflict} organization={workspace.organizationName} unit={workspace.unitName} team={teamName} /></details><button className="v2-secondary" onClick={() => { setMap(conflict); setPayload(conflict.payload); setConflict(null); pending.current = null; setMessage('Versão do servidor adotada por escolha explícita.'); }}>Substituir esta cópia pela versão do servidor</button></section>}
    <details className="v2-panel v2-section"><summary>Prévia fiel ao formulário revisado {dirty ? '(dados não confirmados)' : '(dados confirmados)'}</summary><EsfPaperReport document={buildMapPaper(reportMap,{organization:workspace.organizationName,unit:workspace.unitName,team:teamName})} /></details>
    </>}
    <section className="v2-panel v2-section"><h2>Mapas recentes desta equipe</h2><p>Até 25 mapas recentes. Para abrir um mapa, confirme antes suas alterações.</p>{initial.maps.map(m => <p key={m.id}><button className="v2-secondary" disabled={busy || dirty} onClick={() => router.push(`${path}?team=${initial.teamId}&map=${m.id}`)}>Abrir {m.competency} · {mapStatusLabels[m.status]} · {m.id.slice(0, 8)}</button></p>)}</section>
  </div>;
}
