'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { mvpForms } from '@/lib/mvp-forms';
import { safeReturnTo, uiLabel } from '@/lib/ui-labels';
import type { WorkspaceContext } from '@/lib/server/workspace';
import { DraftTools } from './draft-tools';

export function CreateMvpRecord({resource,workspace}: {resource:string;workspace:WorkspaceContext}) {
  const config = mvpForms[resource];
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = safeReturnTo(search.get('returnTo'),`/${config.module}`);
  const [values,setValues] = useState<Record<string,string>>(()=>Object.fromEntries(config.fields.map(f=>[f.key,f.initial ?? ''])));
  const [message,setMessage] = useState('');
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false);
  const [operationId,setOperationId] = useState<string>(()=>crypto.randomUUID());
  const pendingBody = useRef<string | null>(null);
  const canCreate = workspace.permissions.some(p=>(p.domain==='*'||p.domain===config.module)&&(p.operations.includes('*')||p.operations.includes('criar')));
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setMessage('');setErrors({});
    if (!navigator.onLine) { setMessage('Sem conexão. Salve no dispositivo e envie quando a conexão voltar.'); return; }
    setBusy(true);
    try {
      const payload:Record<string,unknown> = {...values,organizationId:workspace.organizationId,unitId:workspace.unitId,operationId};
      for (const key of ['startsAt','dueAt']) { if (values[key]) payload[key]=new Date(values[key]).toISOString(); else delete payload[key]; }
      pendingBody.current ??= JSON.stringify(payload);
      const response = await fetch(`/api/v1/${resource}`,{method:'POST',headers:{'content-type':'application/json'},body:pendingBody.current});
      const body = await response.json();
      if (!response.ok) { if(response.status<500){pendingBody.current=null;setOperationId(crypto.randomUUID());} if (body.issues) setErrors(Object.fromEntries(body.issues.map((i:{path:string[]})=>[i.path[0],'Revise este campo.']))); throw new Error(body.error || 'Não foi possível salvar. Seus dados permanecem no formulário.'); }
      router.push(`/registros/${resource}/${body.id}?returnTo=${encodeURIComponent(returnTo)}`); router.refresh();
    } catch(error) { setMessage((error instanceof Error ? error.message : 'Falha de conexão. Seus dados permanecem no formulário.')+(pendingBody.current?' A nova tentativa reenviará os mesmos dados para evitar duplicação.':'')); }
    finally { setBusy(false); }
  }
  return <div className="content v2-page"><Link className="v2-back" href={returnTo}>← Voltar à lista</Link><header><p className="eyebrow">{workspace.unitName}</p><h1 className="page-title">{config.title}</h1><p className="v2-muted">Preencha os dados de identificação. As próximas etapas estarão disponíveis após salvar.</p></header>
    {!canCreate ? <p className="v2-alert">Seu perfil permite consultar esta área, mas não criar registros.</p> : <section className="v2-panel v2-section"><form className="v2-form" onSubmit={submit}>
      {config.fields.map(field=><label className="v2-field" key={field.key}><span>{field.label}{field.required?' *':''}</span>{field.options ? <select name={field.key} value={values[field.key]} onChange={e=>setValues({...values,[field.key]:e.target.value})}>{field.options.map(o=><option key={o} value={o}>{uiLabel(o)}</option>)}</select> : field.type==='textarea' ? <textarea name={field.key} required={field.required} minLength={field.minLength} maxLength={field.maxLength} rows={5} value={values[field.key]} onChange={e=>setValues({...values,[field.key]:e.target.value})} aria-invalid={Boolean(errors[field.key])} aria-describedby={`${field.key}-hint`} /> : <input name={field.key} type={field.type ?? 'text'} required={field.required} minLength={field.minLength} maxLength={field.maxLength} value={values[field.key]} onChange={e=>setValues({...values,[field.key]:e.target.value})} aria-invalid={Boolean(errors[field.key])} aria-describedby={`${field.key}-hint`} />}<small id={`${field.key}-hint`}>{errors[field.key] ?? field.hint}</small></label>)}
      {message && <p className="v2-alert" role="alert">{message}</p>}<div className="dialog-actions"><Link className="v2-secondary" href={returnTo}>Voltar</Link><button className="v2-button" disabled={busy}>{busy?'Enviando…':'Salvar e continuar'}</button></div>
    </form><DraftTools draftKey={`create:${resource}`} title={config.title} values={()=>({...values,__operation:operationId,__pending:pendingBody.current ?? ''})} onRestore={saved=>{setValues(Object.fromEntries(config.fields.map(f=>[f.key,saved[f.key] ?? f.initial ?? ''])));if(saved.__operation)setOperationId(saved.__operation);pendingBody.current=saved.__pending || null;}} workspace={workspace} /></section>}
  </div>;
}
