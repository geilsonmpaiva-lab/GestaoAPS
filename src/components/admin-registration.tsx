"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Plus, UsersRound } from "lucide-react";
import { domainLabels, inviteSchema, mayDelegate, operationLabels, roleLabels, unitSchema, type AdminCatalog, type AdminRole } from "@/lib/domain/admin-registration";
import type { WorkspaceContext } from "@/lib/server/workspace";

export function AdminRegistration({ area, creating, workspace, catalog }: { area: "usuarios" | "unidades"; creating: boolean; workspace: WorkspaceContext; catalog: AdminCatalog }) {
  const query = useSearchParams();
  const path = `/administracao/${area}`;
  const search = query.get("search") ?? "";
  const status = query.get("status") ?? "";
  const unit = query.get("unit") ?? "";
  const returnTo = query.get("returnTo")?.startsWith(`${path}?`) ? query.get("returnTo")! : path;
  const allowedInvite = catalog.grants.some(g => ["ADMIN_SISTEMA", "GESTOR_ORGANIZACAO", "GERENTE_UBS"].includes(g.role) && (g.domains.includes("*") || g.domains.includes("administracao")) && (g.role === "ADMIN_SISTEMA" || g.operations.includes("criar")));
  const canCreate = area === "unidades" ? catalog.canCreateUnits : allowedInvite;
  const source = area === "unidades" ? catalog.units.map(u => ({ ...u, meta: `CNES ${u.cnes || "não informado"}`, unitId: u.id })) : catalog.users.map(u => ({ ...u, meta: `${u.email} · ${roleLabels[u.role]} · ${catalog.units.find(unit => unit.id === u.unitId)?.name ?? "Organização"}` }));
  const rows = source.filter(r => (!search || `${r.name} ${r.meta}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))) && (!status || r.status === status) && (!unit || r.unitId === unit)).sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
  const page = Math.max(1, Math.min(Math.ceil(rows.length / 25) || 1, Number.parseInt(query.get("page") ?? "1", 10) || 1));
  const statusLabels: Record<string,string> = { ACTIVE: "Ativo", INACTIVE: "Inativo", INVITED: "Convidado", SUSPENDED: "Suspenso" };
  function pageHref(page: number) { const next = new URLSearchParams(query); next.set("page", String(page)); return `${path}?${next}`; }
  return <>
    <Link className="v2-back" href={creating ? returnTo : "/administracao"}>← {creating ? "Voltar à lista" : "Administração"}</Link>
    <header className="v2-page-header"><div><p className="v2-eyebrow">{workspace.organizationName}</p><h1>{creating ? area === "usuarios" ? "Convidar usuário" : "Cadastrar unidade" : area === "usuarios" ? "Usuários" : "Unidades"}</h1><p>Cadastros da organização, limitados às unidades e vínculos que seu perfil pode administrar.</p></div>{!creating && canCreate && <Link className="v2-button" href={`${path}/novo?returnTo=${encodeURIComponent(`${path}${query.size ? `?${query}` : ""}`)}`}><Plus size={18} />{area === "usuarios" ? "Convidar usuário" : "Cadastrar unidade"}</Link>}</header>
    {!creating && area === "unidades" && canCreate && <Link className="v2-secondary" href="/administracao/unidades/cnes">Buscar no CNES</Link>}
    {catalog.demo && <p className="v2-alert">Demonstração: cadastros são simulados, não persistem e não enviam e-mails.</p>}
    {creating ? canCreate ? <RegistrationForm key={area} area={area} catalog={catalog} workspace={workspace} returnTo={returnTo} /> : <p className="v2-alert">Seu perfil não permite este cadastro. Unidades novas exigem autorização de gestão da organização.</p> : <>
      <nav className="v2-tabs" aria-label="Cadastros administrativos"><Link href="/administracao/usuarios" aria-current={area === "usuarios" ? "page" : undefined}><UsersRound size={16} aria-hidden /> Usuários</Link><Link href="/administracao/unidades" aria-current={area === "unidades" ? "page" : undefined}><Building2 size={16} aria-hidden /> Unidades</Link></nav>
      <section className="v2-panel">
        <form className="v2-toolbar" action={path} role="search"><label className="v2-field">Pesquisar<input name="search" defaultValue={search} maxLength={100} placeholder={area === "usuarios" ? "Nome ou e-mail" : "Nome ou CNES"} /></label><label className="v2-field">Situação<select name="status" defaultValue={status}><option value="">Todas</option>{(area === "usuarios" ? ["ACTIVE","INVITED","SUSPENDED"] : ["ACTIVE","INACTIVE"]).map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>{area === "usuarios" && <label className="v2-field">Unidade<select name="unit" defaultValue={unit}><option value="">Todas as autorizadas</option>{catalog.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}<button className="v2-button">Pesquisar</button>{(search || status || unit) && <Link className="v2-secondary" href={path}>Limpar filtros</Link>}</form>
        <p className="v2-muted" role="status">{rows.length} {area === "usuarios" ? "vínculo(s) de usuário" : "unidade(s)"} · ordem alfabética · 25 por página</p>
        {rows.slice((page-1)*25,page*25).map(r => <article className="v2-record" key={r.id}><div><h2>{r.name}</h2><p className="v2-muted">{r.meta}</p></div><span className="v2-status" data-tone={r.status === "ACTIVE" ? "success" : r.status === "SUSPENDED" ? "error" : "warning"}>{statusLabels[r.status] ?? r.status}</span></article>)}
        {!rows.length && <div className="v2-empty"><h2>Nenhum cadastro encontrado</h2><p>Confira os filtros ou inicie um cadastro, se autorizado.</p></div>}
        <nav className="v2-pagination" aria-label="Paginação">{page > 1 ? <Link className="v2-secondary" href={pageHref(page-1)}>Anterior</Link> : <span />}<span>Página {page} de {Math.max(1,Math.ceil(rows.length/25))}</span>{page*25 < rows.length ? <Link className="v2-secondary" href={pageHref(page+1)}>Próxima</Link> : <span />}</nav>
      </section>
    </>}
  </>;
}

function RegistrationForm({ area, catalog, workspace, returnTo }: { area: "usuarios" | "unidades"; catalog: AdminCatalog; workspace: WorkspaceContext; returnTo: string }) {
  const router = useRouter();
  const [name,setName] = useState(""); const [email,setEmail] = useState(""); const [cnes,setCnes] = useState("");
  const [unitId,setUnitId] = useState(workspace.unitId ?? catalog.units[0]?.id ?? "");
  const [role,setRole] = useState<AdminRole>("LEITOR"); const [domains,setDomains] = useState<string[]>([]); const [operations,setOperations] = useState<string[]>(["visualizar"]);
  const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [done,setDone] = useState(""); const [partial,setPartial] = useState(false);
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const grants = catalog.grants.filter(g => g.unitId === null || g.unitId === unitId);
  const canChoose = (d: string, o: string) => grants.some(g => mayDelegate(g,unitId || null,role,[d],[o]));
  const validInvite = grants.some(g => mayDelegate(g,unitId || null,role,domains,operations));
  const canOrg = catalog.grants.some(g => g.unitId === null && g.role !== "GERENTE_UBS");
  const roles = (Object.keys(roleLabels) as AdminRole[]).filter(r => r !== "ADMIN_SISTEMA" && grants.some(g => Object.keys(domainLabels).some(d => mayDelegate(g,unitId || null,r,[d],["visualizar"]))));
  const toggle = (values: string[],value: string) => values.includes(value) ? values.filter(v => v !== value) : [...values,value];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!navigator.onLine) { setError("Conecte-se para confirmar o cadastro. Os campos continuam nesta tela."); return; }
    const fields = new FormData(event.currentTarget);
    const input = area === "usuarios" ? { name, email: email.trim(), organizationId: workspace.organizationId, unitId: unitId || null, role, domains, operations } : { name, cnes, organizationId: workspace.organizationId, address: { street: String(fields.get("street") ?? ""), city: String(fields.get("city") ?? ""), state: String(fields.get("state") ?? "").toUpperCase(), postalCode: String(fields.get("postalCode") ?? "").replace(/\D/g,"") } };
    const fingerprint = JSON.stringify(input);
    if (!operation.current || operation.current.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
    const body = area === "usuarios" ? input : { ...input, operationId: operation.current.id };
    const parsed = (area === "usuarios" ? inviteSchema : unitSchema).safeParse(body);
    if (!parsed.success) { setError("Confira os campos obrigatórios: nome, identificação e permissões selecionadas."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/admin/${area === "usuarios" ? "invites" : "units"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) { if (result.partial) setPartial(true); throw new Error(result.error || "Não foi possível confirmar o cadastro."); }
      setDone(result.mode === "demo" ? "Simulação concluída. Nenhum dado foi gravado e nenhum e-mail foi enviado." : area === "usuarios" ? "Convite enviado e vínculo confirmado. A pessoa definirá sua senha pelo link recebido no e-mail." : "Unidade cadastrada. A unidade de trabalho atual não foi alterada.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error && !(cause instanceof TypeError) && !(cause instanceof SyntaxError) ? cause.message : "Falha de conexão. Os campos foram preservados; tente novamente."); }
    finally { setBusy(false); }
  }
  if (done) return <section className="v2-panel v2-section"><h2>{area === "usuarios" ? "Convite processado" : "Cadastro processado"}</h2><p className="v2-alert" data-tone="success" role="status">{done}</p><Link className="v2-button" href={returnTo}>Voltar à lista</Link></section>;
  return <section className="v2-panel v2-section"><p className="v2-muted">{area === "usuarios" ? "Acesso exclusivamente por convite. Não informe ou compartilhe senhas. Selecione apenas as permissões necessárias." : "Informe o nome e o CNES da UBS. A organização é definida pelo contexto autorizado; o endereço é opcional."} Cadastros administrativos exigem conexão.</p>
    <form className="detail-form" onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy || partial}><legend>{area === "usuarios" ? "Identificação e acesso" : "Identificação da unidade"}</legend>
        <label>{area === "usuarios" ? "Nome completo" : "Nome da unidade"}<input required minLength={2} maxLength={160} value={name} onChange={e => setName(e.target.value)} autoComplete={area === "usuarios" ? "name" : "off"} /></label>
        {area === "usuarios" ? <><label>E-mail do convite<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Unidade de acesso<select required={!canOrg} value={unitId} onChange={e => {setUnitId(e.target.value);setRole("LEITOR");setDomains([]);setOperations(["visualizar"]);}}>{canOrg && <option value="">Toda a organização</option>}{catalog.units.filter(u => u.status === "ACTIVE").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Perfil<select value={role} onChange={e => {setRole(e.target.value as AdminRole);setDomains([]);setOperations(["visualizar"]);}}>{roles.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}</select></label>
          <fieldset><legend>Áreas de acesso (selecione ao menos uma)</legend>{Object.entries(domainLabels).filter(([d]) => workspace.enabledModules.includes(d) && canChoose(d,"visualizar")).map(([d,label]) => <label className="admin-permission" key={d}><input type="checkbox" checked={domains.includes(d)} onChange={() => setDomains(toggle(domains,d))} />{label}</label>)}</fieldset>
          <fieldset><legend>Operações permitidas</legend>{Object.entries(operationLabels).filter(([o]) => Object.keys(domainLabels).some(d => canChoose(d,o))).map(([o,label]) => <label className="admin-permission" key={o}><input type="checkbox" checked={operations.includes(o)} onChange={() => setOperations(toggle(operations,o))} />{label}</label>)}</fieldset><p className="v2-muted">O perfil não concede permissões adicionais às operações selecionadas. Permissões indisponíveis não podem ser delegadas.</p></> : <><label>CNES (7 dígitos)<input required inputMode="numeric" pattern="[0-9]{7}" maxLength={7} value={cnes} onChange={e => setCnes(e.target.value.replace(/\D/g,""))} /></label><label>Logradouro e número<input name="street" maxLength={240} autoComplete="street-address" /></label><label>Município<input name="city" maxLength={120} autoComplete="address-level2" /></label><label>UF<input name="state" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" autoComplete="address-level1" /></label><label>CEP<input name="postalCode" inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" maxLength={9} autoComplete="postal-code" /></label></>}
      </fieldset>
      {error && <p className="v2-alert" data-tone="error" role="alert">{error}</p>}
      <div className="dialog-actions"><Link className="v2-secondary" href={returnTo}>Cancelar</Link><button className="v2-button" disabled={busy || partial || (area === "usuarios" && !validInvite)}>{busy ? "Confirmando..." : area === "usuarios" ? "Enviar convite" : "Salvar unidade"}</button></div>
    </form>
  </section>;
}
