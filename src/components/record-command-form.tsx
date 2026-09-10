"use client";
import { useContext, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftTools, DraftWorkspace } from "./draft-tools";

export type CommandField = { name: string; label: string; type?: "text" | "textarea" | "number" | "date" | "datetime-local" | "checkbox"; options?: { value: string; label: string }[]; required?: boolean; defaultValue?: string; min?: number; max?: number; minLength?: number; pattern?: string };
export type CommandFormProps = { title: string; endpoint: string; expectedVersion?: number; fields?: CommandField[]; payload?: Record<string, unknown>; transform?: (values: Record<string, unknown>) => Record<string, unknown>; method?: "POST" | "PUT"; redirectResource?: string; children?: React.ReactNode; onSuccess?: (result: Record<string, unknown>) => void; disabled?: boolean; extraDraft?:{value:string;restore:(value:string)=>void} };

export function CommandForm({ title, endpoint, expectedVersion, fields = [], payload = {}, transform, method = "POST", redirectResource, children, onSuccess, disabled, extraDraft }: CommandFormProps) {
  const router = useRouter();
  const prefix = useId();
  const operation = useRef<string | null>(null);
  const pendingBody = useRef<string | null>(null);
  const workspace = useContext(DraftWorkspace);
  const [edits,setEdits] = useState<Record<string,string>>({});
  const fieldValue = (field:CommandField) => edits[field.name] ?? field.defaultValue ?? '';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  function restore(saved:Record<string,string>) {
    if (saved.__extra && extraDraft) extraDraft.restore(saved.__extra);
    setEdits(Object.fromEntries(fields.map(field=>[field.name,saved[field.name] ?? field.defaultValue ?? ''])));
    operation.current=saved.__operation || null;
    pendingBody.current=saved.__pending || null;
    if (saved.__version !== String(expectedVersion ?? '')) { setConflict(true); setFailed(true); setMessage('O rascunho usa outra versão. Seus dados foram recuperados, mas precisam de revisão antes de confirmar.'); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || conflict) return;
    const form = event.currentTarget;
    const values: Record<string, unknown> = {};
    const data = new FormData(form);
    for (const field of fields) {
      const raw = data.get(field.name);
      if (field.type === "checkbox") values[field.name] = raw === "on";
      else if (raw !== null && raw !== "") values[field.name] = field.type === "number" ? Number(raw) : field.type === "datetime-local" ? new Date(String(raw)).toISOString() : String(raw);
    }
    setBusy(true); setFailed(false); setMessage("");
    operation.current ??= crypto.randomUUID();
    try {
      if (!navigator.onLine) throw new Error("Sem conexão. Salve o rascunho no dispositivo abaixo e confirme após reconectar.");
      const body = { ...payload, ...values, operationId: operation.current, ...(expectedVersion !== undefined ? { expectedVersion } : {}) };
      pendingBody.current ??= JSON.stringify(transform ? transform(body) : body);
      const response = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: pendingBody.current });
      const result = await response.json();
      if (response.status === 409) { setConflict(true); throw new Error("Este registro mudou. Revise a versão atual antes de reenviar. Seus campos permanecem nesta página."); }
      if (!response.ok) {
        if (response.status < 500) {operation.current = null; pendingBody.current=null;}
        throw new Error(response.status === 403 ? "Seu perfil não permite esta operação." : response.status === 401 ? "Sua sessão expirou. Entre novamente para continuar." : "Não foi possível confirmar. Revise os campos obrigatórios, o estado do registro e suas permissões.");
      }
      operation.current = null;
      pendingBody.current = null;
      setMessage("Salvo e confirmado pelo servidor.");
      onSuccess?.(result);
      const nextId = redirectResource === "action-plans" ? result.actionPlanId ?? result.id : result.id;
      if (redirectResource && typeof nextId === "string") router.push(`/registros/${redirectResource}/${nextId}?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      else router.refresh();
    } catch (error) { setFailed(true); setMessage((error instanceof Error ? error.message : "Falha de conexão. Tente novamente.") + (pendingBody.current && !conflict ? ' A nova tentativa reenviará exatamente a mesma operação para evitar duplicação.' : '')); }
    finally { setBusy(false); }
  }
  return <section className="panel detail-section"><h2>{title}</h2><form className="detail-form" onSubmit={submit} aria-busy={busy}>
    {fields.map(field => <label key={field.name} htmlFor={`${prefix}-${field.name}`}>{field.label}{field.required ? " *" : ""}
      {field.options ? <select id={`${prefix}-${field.name}`} name={field.name} required={field.required} value={fieldValue(field)} onChange={e=>setEdits({...edits,[field.name]:e.target.value})}><option value="">Selecione</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        : field.type === "textarea" ? <textarea id={`${prefix}-${field.name}`} name={field.name} required={field.required} value={fieldValue(field)} onChange={e=>setEdits({...edits,[field.name]:e.target.value})} minLength={field.minLength} rows={5} />
          : <input id={`${prefix}-${field.name}`} name={field.name} type={field.type ?? "text"} required={field.required} value={field.type==='checkbox' ? undefined : fieldValue(field)} checked={field.type==='checkbox' ? fieldValue(field)==='true' : undefined} onChange={e=>setEdits({...edits,[field.name]:field.type==='checkbox'?String(e.target.checked):e.target.value})} min={field.min} max={field.max} minLength={field.minLength} pattern={field.pattern} step={field.type === "number" ? "any" : undefined} />}
    </label>)}
    {children}
    {message && <p id={`${prefix}-message`} role={failed ? "alert" : "status"} className={failed ? "form-error" : "form-success"}>{message}</p>}
    {conflict && <button type="button" className="secondary-button" onClick={() => router.refresh()}>Consultar versão atual</button>}
    <button type="submit" className="primary-button" disabled={disabled || busy || conflict}>{busy ? "Confirmando…" : title}</button>
  </form>{workspace && (fields.length>0 || extraDraft) && <DraftTools workspace={workspace} draftKey={`command:${endpoint}`} title={title} values={()=>({...Object.fromEntries(fields.map(field=>[field.name,fieldValue(field)])),__version:String(expectedVersion ?? ''),__operation:operation.current ?? '',__pending:pendingBody.current ?? '',__extra:extraDraft?.value ?? ''})} onRestore={restore} />}</section>;
}
