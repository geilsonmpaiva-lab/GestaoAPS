"use client";
import { useEffect, useState } from "react";
import { OfflineVault } from "@/lib/offline/vault";
import { isNetworkFailure,queueWork, resolveActionWork, synchronizeWork, verifyVault, workPrefix, type PendingWork } from "@/lib/offline/work";
import type { WorkspaceContext } from "@/lib/server/workspace";
import type { DetailData } from "@/lib/server/record-detail";
import type { SavedDraft } from "./draft-tools";
import { RecordDetail } from "./record-detail";
import { mvpForms } from "@/lib/mvp-forms";
import { safeReturnTo } from "@/lib/ui-labels";
import { synchronizeAttachments, type PendingAttachment } from "@/lib/offline/attachments";

const names:Record<string,string>={title:'Título',domain:'Domínio institucional',name:'Nome',code:'Código',instructions:'Conteúdo institucional',notes:'Observações',why:'Por quê',what:'O que será feito',how:'Como',whenAt:'Prazo',percentage:'Progresso',validFrom:'Início da vigência'};
export function OfflineWorkbench(){
  const [pin,setPin]=useState(''),[message,setMessage]=useState('Desbloqueie para consultar os dados cifrados. Nenhuma operação é confirmada sem servidor.'),[busy,setBusy]=useState(false);
  const [workspace,setWorkspace]=useState<WorkspaceContext|null>(null),[vault,setVault]=useState<OfflineVault|null>(null);
  const [drafts,setDrafts]=useState<Array<{id:string;value:SavedDraft}>>([]),[work,setWork]=useState<PendingWork[]>([]),[snapshots,setSnapshots]=useState<DetailData[]>([]),[attachments,setAttachments]=useState<PendingAttachment[]>([]);
  const [selected,setSelected]=useState<DetailData|null>(null),[online,setOnline]=useState(true);
  async function refresh(v:OfflineVault,w:WorkspaceContext){
    await v.assertIdentity(w.userId,w.organizationId);
    setDrafts(await v.listRecords<SavedDraft>(`draft:${w.userId}:${w.organizationId}:${w.unitId??'org'}:`));
    setWork((await v.listRecords<PendingWork>(workPrefix(w))).map(row=>row.value));
    setSnapshots((await v.listRecords<{detail:DetailData;updatedAt:string}>(`snapshot:${w.userId}:${w.organizationId}:${w.unitId??'org'}:`)).map(row=>({...row.value.detail,record:{...row.value.detail.record,offline_saved_at:row.value.updatedAt}})));
    setAttachments((await v.listRecords<PendingAttachment>(`attachment:${w.userId}:${w.organizationId}:${w.unitId??'org'}:`)).map(row=>row.value));
  }
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  useEffect(()=>{
    if(!vault||!workspace)return;
    const check=async()=>{try{if(navigator.onLine){try{await verifyVault(vault,workspace);}catch(error){if(!isNetworkFailure(error))throw error;setOnline(false);}}await refresh(vault,workspace);}catch(error){setVault(null);setWorkspace(null);setSelected(null);setDrafts([]);setSnapshots([]);setWork([]);setAttachments([]);setMessage(error instanceof Error?error.message:'Cofre bloqueado. Pendências preservadas.');}};
    const timer=window.setInterval(()=>void check(),30_000);
    window.addEventListener('online',check);window.addEventListener('sgc-vault-change',checkLocal);
    function checkLocal(){void vault!.assertAuthorized().catch(()=>{setVault(null);setWorkspace(null);setSelected(null);setDrafts([]);setSnapshots([]);setWork([]);setAttachments([]);setMessage('Cofre bloqueado. Reconecte e valide o dispositivo. Pendências preservadas.');});}
    return()=>{window.clearInterval(timer);window.removeEventListener('online',check);window.removeEventListener('sgc-vault-change',checkLocal);};
  },[vault,workspace]);
  async function unlock(){setBusy(true);try{
    const v=await OfflineVault.resume(pin);
    let validatedOnline=false;
    if(navigator.onLine){try{await verifyVault(v);validatedOnline=true;}catch(error){if(!isNetworkFailure(error))throw error;await v.assertAuthorized();setOnline(false);}}
    const w=await v.getRecord<WorkspaceContext>('workspace');
    if(!w)throw new Error('Prepare uma unidade online antes de usar esta área.');
    await v.assertIdentity(w.userId,w.organizationId);
    if(validatedOnline){const response=await fetch('/api/v1/offline/context');if(!response.ok)throw new Error('Entre no sistema online para validar o contexto.');const current=await response.json();if(current.userId!==w.userId||current.organizationId!==w.organizationId||current.unitId!==w.unitId)throw new Error('A conta ou UBS mudou. Selecione o contexto original online antes de sincronizar.');}
    OfflineVault.activate(v);await refresh(v,w);setVault(v);setWorkspace(w);setPin('');setMessage('Cofre desbloqueado. Dados locais podem estar desatualizados; transições aguardam confirmação online.');
  }catch(error){setMessage(error instanceof Error?error.message:'Não foi possível abrir o cofre.');}finally{setBusy(false);}}
  async function sync(){if(!vault||!workspace)return;setBusy(true);try{
    await synchronizeAttachments(vault,workspace);setOnline(true);
    await synchronizeWork(vault,workspace);await refresh(vault,workspace);setMessage('Sincronização verificada. Confira confirmações, falhas e conflitos abaixo; nenhum item foi descartado.');
  }catch(error){setMessage(isNetworkFailure(error)?'Falha de conexão ou tempo excedido. Itens preservados; tente novamente.':error instanceof Error?error.message:'Falha de conexão. Itens preservados.');}finally{setBusy(false);}}
  async function saveDraft(id:string,draft:SavedDraft){if(!vault||!workspace)return;try{await vault.putRecord(id,{...draft,updatedAt:new Date().toISOString()});await refresh(vault,workspace);setMessage('Salvo neste dispositivo.');}catch(error){setMessage(error instanceof Error?error.message:'Falha ao salvar.');}}
  async function prepare(draft:SavedDraft){if(!vault||!workspace)return;try{
    const resource=new URL(draft.href,location.origin).pathname.match(/^\/cadastros\/(knowledge|protocols|indicators|meetings|action-plans)$/)?.[1];
    if(!resource||!mvpForms[resource])throw new Error('Este rascunho deve ser recuperado no formulário original para revisão.');
    const body:Record<string,unknown>=draft.values.__pending?JSON.parse(draft.values.__pending):{...Object.fromEntries(Object.entries(draft.values).filter(([key])=>!key.startsWith('__'))),organizationId:workspace.organizationId,unitId:workspace.unitId,operationId:draft.values.__operation||crypto.randomUUID()};
    for(const key of ['startsAt','dueAt']){if(typeof body[key]==='string'&&body[key])body[key]=new Date(body[key] as string).toISOString();else delete body[key];}
    await queueWork(vault,workspace,draft.title,`/api/v1/${resource}`,'POST',body);await refresh(vault,workspace);setMessage('Aguardando envio. O cadastro só existirá após confirmação do servidor.');
  }catch(error){setMessage(error instanceof Error?error.message:'Não foi possível preparar.');}}
  async function resolve(item:PendingWork,form:HTMLFormElement){if(!vault||!workspace)return;setBusy(true);try{const data=new FormData(form);await resolveActionWork(vault,workspace,item,data.get('strategy') as 'KEEP_SERVER'|'KEEP_CLIENT',String(data.get('justification')));await refresh(vault,workspace);setMessage('Conflito resolvido e auditado pelo servidor.');}catch(error){setMessage(error instanceof Error?error.message:'Resolução não confirmada.');await refresh(vault,workspace).catch(()=>undefined);}finally{setBusy(false);}}
  return <main className="ux-v2 content v2-page" style={{maxWidth:1050,margin:'auto',padding:24}}><p className="eyebrow">SGC-UBS · {online?'Conectado':'Sem conexão'}</p><h1 className="page-title">Área de trabalho offline</h1><p>Use apenas dados autorizados. O navegador pode limpar o armazenamento; sincronize assim que possível.</p>
    <p role="status" className="v2-alert">{message}</p>
    {!vault?<form className="v2-panel v2-section" onSubmit={e=>{e.preventDefault();void unlock();}}><label className="v2-field">PIN local<input type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{6,12}" value={pin} onChange={e=>setPin(e.target.value)}/></label><button className="v2-button" disabled={busy}>Desbloquear cofre</button></form>:<>
      <p><strong>{workspace?.organizationName} · {workspace?.unitName}</strong></p><p>Dados preparados anteriormente nesta conta e UBS. Anexos: {attachments.filter(a=>a.status!=='confirmed').length} · Operações pendentes: {work.filter(w=>w.status!=='confirmed').length}</p>
      <button className="v2-button" disabled={busy} onClick={sync}>Sincronizar pendências</button>{' '}<button className="v2-secondary" onClick={()=>{OfflineVault.active=null;setVault(null);setWorkspace(null);setDrafts([]);setWork([]);setSnapshots([]);setAttachments([]);setSelected(null);}}>Bloquear cofre</button>
      <h2>Registros preparados</h2>{snapshots.length===0&&<p>Abra um registro online e use “Disponibilizar neste dispositivo”.</p>}{snapshots.map(item=><button className="v2-secondary" key={`${item.resource}:${item.record.id}`} onClick={()=>setSelected(item)}>{String(item.record.title||item.record.name||item.record.what||item.resource)}</button>)}
      {selected&&workspace&&<section><button className="v2-secondary" onClick={()=>setSelected(null)}>Voltar aos dados offline</button><p>Snapshot preparado em {new Date(String(selected.record.offline_saved_at)).toLocaleString('pt-BR')}. Sem atualização definitiva enquanto offline.</p><RecordDetail detail={selected} workspace={workspace} returnTo="/offline"/></section>}
      <h2>Rascunhos recuperáveis</h2>{drafts.map(({id,value:draft})=><section className="v2-panel v2-section" key={id}><h3>{draft.title}</h3><p>Salvo em {new Date(draft.updatedAt).toLocaleString('pt-BR')}</p><form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void saveDraft(id,{...draft,values:{...draft.values,...Object.fromEntries([...data.entries()].map(([k,v])=>[k,String(v)]))}});}}>{Object.entries(draft.values).filter(([key])=>!key.startsWith('__')).map(([key,value])=><label className="v2-field" key={key}>{names[key]||key}<textarea name={key} defaultValue={value} readOnly={Boolean(draft.values.__pending)}/></label>)}{draft.values.__pending&&<p>Uma tentativa anterior foi preparada. O conteúdo original será reenviado sem alterações para evitar duplicação.</p>}<button className="v2-secondary">Salvar rascunho cifrado</button></form><button className="v2-button" onClick={()=>prepare(draft)}>Preparar cadastro para envio</button>{' '}<a href={safeReturnTo(draft.href)}>Revisar no formulário online</a></section>)}
      <h2>Fila e conflitos</h2>{work.map(item=><section className="v2-panel v2-section" key={item.id}><h3>{item.title}</h3><p>{({pending:'Aguardando envio',confirmed:'Confirmado pelo servidor',failed:'Falha — preservado para nova tentativa',conflict:'Conflito — entidade bloqueada nesta fila'})[item.status]}</p>{item.error&&<p>{item.error}</p>}{item.status==='conflict'&&<><h4>Versão deste dispositivo</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(item.body,null,2)}</pre><h4>Versão consultada no servidor</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(item.server,null,2)}</pre><p>As duas versões foram preservadas. Revise o registro online com usuário autorizado; esta fila não sobrescreve versões conflitantes.</p></>}</section>)}
      {work.filter(item=>item.status==='conflict'&&/^\/api\/v1\/actions\/[0-9a-f-]{36}\/update$/i.test(item.endpoint)).map(item=><section className="v2-panel v2-section" key={`resolve:${item.id}`}><h3>Resolver: {item.title}</h3><p>Exige permissão de reabertura e edição. O servidor verifica novamente a versão e registra a justificativa.</p><form onSubmit={e=>{e.preventDefault();void resolve(item,e.currentTarget);}}><label className="v2-field">Versão a manter<select name="strategy" defaultValue={String(item.resolutionAttempt?.strategy??'KEEP_SERVER')}><option value="KEEP_SERVER">Manter versão do servidor</option><option value="KEEP_CLIENT">Reaplicar progresso deste dispositivo</option></select></label><label className="v2-field">Justificativa da resolução<textarea name="justification" required minLength={10} maxLength={1000} defaultValue={String(item.resolutionAttempt?.justification??'')}/></label><button className="v2-button" disabled={!online||busy}>Confirmar resolução auditada</button></form></section>)}
      <h2>Anexos preservados</h2>{attachments.map(item=><p key={item.id}>{item.fileName} — {item.status==='confirmed'?'Confirmado pelo servidor':item.error||'Aguardando envio'}</p>)}
    </>}
    {/* Full navigation exits the cached shell without an unavailable RSC fetch. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <p><a className="v2-secondary" href="/">Voltar ao sistema online</a></p></main>;
}
