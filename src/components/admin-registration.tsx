"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronRight, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { adminDomainLabel, domainLabels, endMembershipSchema, groupAdminPeople, inviteAccessPreview, inviteSchema, isAdminDomainEnabled, mayDelegate, mayEndMembership, operationLabels, responsibilityDescriptions, responsibilityLabels, roleLabels, suggestInviteOperations, unitSchema, type AdminCatalog, type AdminPerson, type AdminRole, type AdminUserMembership, type EndMembershipPreview, type SpecificAccessResult } from "@/lib/domain/admin-registration";
import type { WorkspaceContext } from "@/lib/server/workspace";

type RegistrationProps = { area: "usuarios" | "unidades"; creating: boolean; workspace: WorkspaceContext; catalog: AdminCatalog; detailId?: string; specificAccess?: SpecificAccessResult };
export function AdminRegistration(props: RegistrationProps) {
  return props.workspace.uxV3 && props.area === "usuarios" ? <UsersAdministration {...props} /> : <LegacyAdminRegistration {...props} />;
}

const statusLabels: Record<string, string> = { ACTIVE: "Ativo", INACTIVE: "Inativo", INVITED: "Convidado", SUSPENDED: "Suspenso" };
const userPath = "/administracao/usuarios";
function userReturnTo(value: string | null) { return value === userPath || value?.startsWith(`${userPath}?`) ? value : userPath; }
function scopeName(unitId: string | null, catalog: AdminCatalog) { return unitId === null ? "Organização — todas as UBS autorizadas pelo vínculo" : catalog.units.find(unit => unit.id === unitId)?.name ?? "UBS do vínculo"; }

function UsersAdministration({ creating, workspace, catalog, detailId, specificAccess }: RegistrationProps) {
  const query = useSearchParams();
  const search = query.get("search") ?? "";
  const status = query.get("status") ?? "";
  const unit = query.get("unit") ?? "";
  const returnTo = userReturnTo(query.get("returnTo"));
  const people = groupAdminPeople(catalog.users);
  const person = detailId ? people.find(item => item.id === detailId) : undefined;
  const canInvite = catalog.grants.some(grant => ["ADMIN_SISTEMA", "GESTOR_ORGANIZACAO", "GERENTE_UBS"].includes(grant.role) && (grant.domains.includes("*") || grant.domains.includes("administracao")) && (grant.role === "ADMIN_SISTEMA" || grant.operations.includes("criar")));
  const filtered = people.filter(item => (!search || `${item.name} ${item.email}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))) && (!status || item.status === status) && (!unit || item.memberships.some(member => member.unitId === null || member.unitId === unit)));
  const page = Math.max(1, Math.min(Math.ceil(filtered.length / 25) || 1, Number.parseInt(query.get("page") ?? "1", 10) || 1));
  const currentList = `${userPath}${query.size ? `?${query}` : ""}`;
  function pageHref(value: number) { const next = new URLSearchParams(query); next.set("page", String(value)); return `${userPath}?${next}`; }
  return <>
    <Link className="v2-back" href={creating || detailId ? returnTo : "/administracao"}>← {creating || detailId ? "Voltar aos usuários" : "Administração"}</Link>
    <header className="v2-page-header"><div><p className="v2-eyebrow">Pessoas e acessos · {workspace.organizationName}</p><h1>{creating ? "Convidar uma pessoa" : person ? person.name : "Usuários e acessos"}</h1><p>{creating ? "Defina onde a pessoa vai trabalhar e quais ações poderá realizar." : person ? "Confira os vínculos de acesso desta pessoa no recorte que você administra." : "Uma pessoa, seus vínculos e suas responsabilidades no sistema."}</p></div>{!creating && !detailId && canInvite && <Link className="v2-button" href={`${userPath}/novo?returnTo=${encodeURIComponent(currentList)}`}><Plus size={18} aria-hidden />Convidar pessoa</Link>}</header>
    {catalog.demo && <p className="v2-alert">Demonstração: os cadastros são simulados e não enviam e-mails.</p>}
    {catalog.membershipDetails && catalog.membershipDetails !== "available" && <p className="v2-alert" data-tone="warning" role="status">Alguns detalhes dos vínculos não puderam ser consultados. Eles aparecem separadamente, sem estimar permissões. <Link href={detailId ? `${userPath}/${detailId}?returnTo=${encodeURIComponent(returnTo)}` : currentList}>Consultar novamente</Link></p>}
    {creating ? canInvite ? <RegistrationForm area="usuarios" modern catalog={catalog} workspace={workspace} returnTo={returnTo} /> : <p className="v2-alert">Seu acesso permite consultar usuários, mas não enviar convites.</p> : person ? <UserAccessDetail person={person} catalog={catalog} workspace={workspace} specificAccess={specificAccess} /> : detailId ? <p className="v2-alert">Pessoa não disponível neste recorte de acesso.</p> : <>
      <form className="v2-toolbar v3-admin-filters" action={userPath} role="search"><label className="v2-field">Pesquisar pessoa<input name="search" defaultValue={search} maxLength={100} placeholder="Nome ou e-mail" /></label><label className="v2-field">Situação da conta<select name="status" defaultValue={status}><option value="">Todas</option>{["ACTIVE", "INVITED", "SUSPENDED"].map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><label className="v2-field">Unidade de atuação<select name="unit" defaultValue={unit}><option value="">Todas as autorizadas</option>{catalog.units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="v2-button">Filtrar</button>{(search || status || unit) && <Link className="v2-secondary" href={userPath}>Limpar</Link>}</form>
      <section className="v2-panel v3-admin-list" aria-label="Pessoas autorizadas"><p className="v2-muted" role="status">{filtered.length} pessoa(s) · 25 por página</p>{filtered.slice((page - 1) * 25, page * 25).map(item => <article className="v2-record v3-admin-person" key={item.id}><div><h2><Link href={`${userPath}/${item.id}?returnTo=${encodeURIComponent(currentList)}`}>{item.name}</Link></h2><p className="v2-muted">{item.email}</p><p>{item.memberships.length} vínculo(s) · {[...new Set(item.memberships.map(member => scopeName(member.unitId, catalog)))].join(" · ")}</p></div><div><span className="v2-status" data-tone={item.status === "ACTIVE" ? "success" : item.status === "SUSPENDED" ? "error" : "warning"}>{statusLabels[item.status] ?? item.status}</span><Link className="v2-secondary" href={`${userPath}/${item.id}?returnTo=${encodeURIComponent(currentList)}`} aria-label={`Ver acessos de ${item.name}`}>Ver acessos<ChevronRight size={16} aria-hidden /></Link></div></article>)}{!filtered.length && <div className="v2-empty"><h2>Nenhuma pessoa encontrada</h2><p>Altere os filtros ou convide uma pessoa, se tiver autorização.</p></div>}<nav className="v2-pagination" aria-label="Paginação dos usuários">{page > 1 ? <Link className="v2-secondary" href={pageHref(page - 1)}>Anterior</Link> : <span />}<span>Página {page} de {Math.max(1, Math.ceil(filtered.length / 25))}</span>{page * 25 < filtered.length ? <Link className="v2-secondary" href={pageHref(page + 1)}>Próxima</Link> : <span />}</nav></section>
    </>}
  </>;
}

function UserAccessDetail({ person, catalog, workspace, specificAccess }: { person: AdminPerson; catalog: AdminCatalog; workspace: WorkspaceContext; specificAccess?: SpecificAccessResult }) {
  return <div className="v3-access-grid">
    <section className="v2-panel v2-section">
      <h2>Conta de acesso</h2><p>{person.email}</p><p>Situação: <strong>{statusLabels[person.status] ?? person.status}</strong></p>
      <p className="v2-muted">A conta identifica quem entra no sistema. Cargo, profissão e lotação são cadastros diferentes e não concedem permissões.</p>
    </section>
    <section className="v2-panel v2-section">
      <h2>Vínculos e responsabilidades</h2>
      <p className="v2-muted">Cada vínculo se aplica às áreas e à unidade indicadas. Os vínculos existentes estão identificados como Personalizado legado.</p>
      {person.memberships.map(member => <article className="v3-access-membership" key={member.id}>
        <h3>{scopeName(member.unitId, catalog)}</h3>
        <p><span className="v2-status" data-tone="neutral">Personalizado legado</span> · {responsibilityLabels[member.role]}</p>
        {member.startsAt && <p className="v2-muted">Vigência: {new Date(member.startsAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} até {member.endsAt ? new Date(member.endsAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "sem término definido"}.</p>}
        <MembershipCapabilities member={member} />
        {catalog.accessLifecycleEnabled && mayEndMembership(catalog.grants, member, workspace.userId) && <EndMembershipAction member={member} />}
      </article>)}
    </section>
    <SpecificAccessSections result={specificAccess} personId={person.id} />
  </div>;
}

const epidemiologyAreaLabels: Record<string, string> = { hanseniase: "Hanseníase", tuberculose: "Tuberculose", sifilis: "Sífilis", hiv: "HIV", "obitos-infantis": "Óbitos infantis", "obito-materno": "Óbito materno", "obito-fetal": "Óbito fetal", leishmaniose: "Leishmaniose", dengue: "Dengue" };
function SpecificAccessSections({ result, personId }: { result?: SpecificAccessResult; personId: string }) {
  const router = useRouter();
  const access = result?.access?.userId === personId ? result.access : undefined;
  if (!access) return <section className="v2-panel v2-section"><h2>Equipes e permissões específicas</h2><p className="v2-alert" role="status">{result?.error ?? "Consulta indisponível: as permissões específicas não foram confirmadas e não serão inferidas do perfil."}</p><button className="v2-secondary" type="button" onClick={() => router.refresh()}>Consultar novamente</button></section>;
  return <>
    <section className="v2-panel v2-section"><h2>Participação nas equipes</h2>
      <p className="v2-muted">Participações explícitas no recorte que você administra. A participação sozinha não concede operações: o vínculo, a situação da equipe e as regras de cada formulário também são verificados.</p>
      {!access.accountActive && <p className="v2-alert">A conta não está ativa no cadastro. As concessões abaixo não significam acesso liberado.</p>}
      {access.teams.length ? access.teams.map(team => <article className="v3-access-membership" key={team.id}><h3>{team.teamName}</h3><p>{team.unitName} · Equipe {team.teamStatus === "ACTIVE" ? "ativa" : "inativa"}</p></article>) : <p>Nenhuma participação explícita registrada neste recorte. Vínculos gerenciais podem abranger equipes da UBS conforme as regras de cada formulário.</p>}
    </section>
    <section className="v2-panel v2-section"><h2>Permissões específicas de Vigilância</h2>
      <p className="v2-muted">Concessões cadastradas, sem dados de pacientes. O acesso depende também de conta, vínculo, área, unidade e equipe ativos. Não é concedido automaticamente pelo perfil.</p>
      <p className="v2-alert">Somente consulta. Administrar contas não autoriza conceder ou ampliar acesso nominal nesta tela.</p>
      {access.epidemiology.length ? access.epidemiology.map(grant => <article className="v3-access-membership" key={grant.id}>
        <h3>{grant.municipal ? "Consolidação municipal" : grant.unitName ?? "UBS da concessão"}{grant.teamName ? ` · ${grant.teamName}` : ""}</h3>
        <p>{grant.areas.map(area => epidemiologyAreaLabels[area] ?? area).join(" · ")}</p>
        <p><span className="v2-status" data-tone={grant.enabled ? "success" : "neutral"}>{grant.enabled ? "Concessão habilitada" : "Concessão desabilitada"}</span></p>
        <dl className="v3-access-capabilities">{[
          ["Consultar registros nominais", grant.nominal], ["Preencher e enviar", grant.canWrite], ["Revisar", grant.canReview],
          ["Validar tecnicamente", grant.canValidate], ["Fechar e reabrir", grant.canClose], ["Consolidar município", grant.municipal],
        ].map(([label, allowed]) => <div key={String(label)}><dt>{label}</dt><dd>{allowed ? "Sim, consta na concessão" : "Não concedido"}</dd></div>)}</dl>
      </article>) : <p>Nenhuma concessão específica de Vigilância registrada no recorte administrado. Concessões fora desse recorte não são exibidas.</p>}
    </section>
  </>;
}

function MembershipCapabilities({ member }: { member: AdminUserMembership }) {
  const { domains, operations } = member;
  if (!domains || !operations) return <p className="v2-alert">Detalhamento de permissões indisponível. O perfil, sozinho, não permite determinar o acesso.</p>;
  return <>
    <dl className="v3-access-capabilities">{domains.map(domain => <div key={domain}>
      <dt><strong>{adminDomainLabel(domain)}</strong></dt>
      <dd>{member.role === "ADMIN_SISTEMA" ? "Operações administrativas amplas neste vínculo; as restrições específicas de cada área continuam aplicáveis." : operations.map(operation => operationLabels[operation as keyof typeof operationLabels] ?? operation).join(" · ") || "Nenhuma operação registrada"}</dd>
    </div>)}</dl>
    {domains.some(domain => domain === "*" || domain.startsWith("esf.") || domain.startsWith("vigilancia.")) && <p className="v2-alert">Equipes ESF e permissões específicas da Vigilância são verificadas separadamente. Este resumo de vínculo não confirma acesso nominal, exportação nominal ou fechamento técnico.</p>}
  </>;
}

function EndMembershipAction({ member }: { member: AdminUserMembership }) {
  const [preview, setPreview] = useState<EndMembershipPreview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState("");
  const endpoint = `/api/v1/admin/memberships/${member.id}/end`;
  useEffect(() => {
    if (!pending) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pending]);
  async function loadPreview() {
    if (!navigator.onLine) { setError("Conecte-se para conferir o acesso atual antes de encerrar."); return; }
    setBusy(true); setError(""); setConfirmed(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível conferir este vínculo.");
      if (data.membershipId !== member.id || data.userId !== member.userId || !data.expectedFingerprint) throw new Error("A prévia do vínculo não pôde ser confirmada.");
      setPreview(data as EndMembershipPreview);
    } catch (cause) { setError(cause instanceof TypeError || cause instanceof SyntaxError ? "Falha de conexão ao consultar o vínculo. Tente novamente." : cause instanceof Error ? cause.message : "Não foi possível conferir o vínculo."); }
    finally { setBusy(false); }
  }
  async function endMembership(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!navigator.onLine) { setError("Este comando exige conexão. A justificativa foi preservada."); return; }
    if (!preview || (!pending && !confirmed)) return;
    const body = pending ?? JSON.stringify({ operationId: crypto.randomUUID(), expectedFingerprint: preview.expectedFingerprint, expectedEndsAt: preview.expectedEndsAt, reason: reason.trim(), deviceId: crypto.randomUUID(), localTimestamp: new Date().toISOString() });
    if (!endMembershipSchema.safeParse(JSON.parse(body)).success) { setError("Informe uma justificativa com pelo menos 10 caracteres."); return; }
    setPending(body); setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body });
      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500) { setPending(null); if ([403, 404, 409].includes(response.status)) setPreview(null); }
        throw new Error(data.error || "O encerramento não foi confirmado.");
      }
      if (data.status !== "ENDED" || data.membershipId !== member.id || typeof data.endedAt !== "string") throw new Error("A confirmação do encerramento não pôde ser lida. Tente novamente o mesmo comando.");
      setPending(null); setEndedAt(data.endedAt);
    } catch (cause) { setError(cause instanceof TypeError || cause instanceof SyntaxError ? "A resposta não chegou. Tente novamente o mesmo comando para consultar a confirmação, sem repetir a alteração." : cause instanceof Error ? cause.message : "O encerramento não foi confirmado."); }
    finally { setBusy(false); }
  }
  if (endedAt) return <div className="v2-alert" data-tone="success" role="status"><p>Este vínculo foi encerrado em {new Date(endedAt).toLocaleString("pt-BR")}. A conta e os demais vínculos foram preservados.</p><a className="v2-secondary" href={userPath}>Voltar à lista atualizada</a></div>;
  return <section className="v3-access-lifecycle" aria-label="Encerrar este vínculo">
    {!preview ? <button className="v2-secondary" disabled={busy} type="button" onClick={() => void loadPreview()}>{busy ? "Consultando acesso…" : "Revisar encerramento deste vínculo"}</button> : <form className="detail-form" onSubmit={endMembership}>
      <h4>Confira o vínculo que será encerrado</h4>
      <p><strong>{preview.unitName ?? "Toda a organização"}</strong> · {responsibilityLabels[preview.role]}</p>
      <p>Áreas: {preview.domains.map(adminDomainLabel).join(" · ")}</p>
      <p>Somente este vínculo deixará de autorizar o acesso no servidor. Outros vínculos da pessoa podem continuar concedendo acesso. A conta e os dados registrados serão preservados.</p>
      <fieldset disabled={busy || !!pending}><label>Justificativa do encerramento<textarea required minLength={10} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><label className="admin-permission"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Conferi a unidade e confirmo o encerramento deste vínculo.</label></fieldset>
      <div className="dialog-actions"><button className="v2-secondary" type="button" disabled={busy || !!pending} onClick={() => { setPreview(null); setConfirmed(false); }}>Cancelar encerramento</button><button className="v2-button" type="submit" disabled={busy || (!pending && (!confirmed || reason.trim().length < 10))}>{busy ? "Aguardando confirmação…" : pending ? "Consultar confirmação do mesmo comando" : "Confirmar encerramento do vínculo"}</button></div>
    </form>}
    {pending && <p role="status">Confirmação pendente. Mantenha esta página aberta para consultar o resultado.</p>}
    {error && <p className="v2-alert" role="alert">{error}</p>}
  </section>;
}

function LegacyAdminRegistration({ area, creating, workspace, catalog }: RegistrationProps) {
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

const subscribeReady = () => () => {};
function RegistrationForm({ area, catalog, workspace, returnTo, modern = false }: { area: "usuarios" | "unidades"; catalog: AdminCatalog; workspace: WorkspaceContext; returnTo: string; modern?: boolean }) {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
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
    if (!parsed.success || (area === "usuarios" && !validInvite)) { setError("Confira os campos obrigatórios e escolha apenas permissões que você pode conceder nesta unidade."); return; }
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
      <fieldset disabled={!ready || busy || partial}><legend>{area === "usuarios" ? modern ? "1. Quem vai usar o sistema" : "Identificação e acesso" : "Identificação da unidade"}</legend>
        <label>{area === "usuarios" ? "Nome completo" : "Nome da unidade"}<input required minLength={2} maxLength={160} value={name} onChange={e => setName(e.target.value)} autoComplete={area === "usuarios" ? "name" : "off"} /></label>
        {area === "usuarios" ? <><label>E-mail do convite<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          {modern && <h2>2. Onde e como vai atuar</h2>}
          <label>{modern ? "Unidade de atuação" : "Unidade de acesso"}<select required={!canOrg} value={unitId} onChange={e => {setUnitId(e.target.value);setRole("LEITOR");setDomains([]);setOperations(["visualizar"]);}}>{canOrg && <option value="">Toda a organização</option>}{catalog.units.filter(u => u.status === "ACTIVE").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label>{modern ? "Função no sistema" : "Perfil"}<select value={role} onChange={e => {setRole(e.target.value as AdminRole);setDomains([]);setOperations(["visualizar"]);}}>{roles.map(r => <option key={r} value={r}>{modern ? responsibilityLabels[r] : roleLabels[r]}</option>)}</select></label>
          {modern && <p className="v2-muted">{responsibilityDescriptions[role]} A função no sistema não é o cargo profissional. Ao mudar a função ou a unidade, confirme novamente as áreas e ações.</p>}
          {modern && role === "GESTOR_ORGANIZACAO" && <p className="v2-alert">Gestão municipal é uma responsabilidade ampliada. O convite começa com consulta; personalize as ações administrativas somente após conferir a abrangência escolhida.</p>}
          <fieldset><legend>{modern ? "3. Áreas de trabalho" : "Áreas de acesso (selecione ao menos uma)"}</legend>{Object.entries(domainLabels).filter(([d]) => isAdminDomainEnabled(d, workspace.enabledModules) && canChoose(d,"visualizar")).map(([d,label]) => <label className="admin-permission" key={d}><input type="checkbox" checked={domains.includes(d)} onChange={() => {const next = toggle(domains,d); setDomains(next); if (modern) setOperations(suggestInviteOperations(role,next,grants,unitId || null));}} />{label}</label>)}</fieldset>
          <fieldset><legend>{modern ? "4. O que poderá fazer" : "Operações permitidas"}</legend>{modern ? <><p>Ações sugeridas para {responsibilityLabels[role]}: <strong>{domains.length ? operations.map(operation => operationLabels[operation as keyof typeof operationLabels]).join(" · ") || "Nenhuma ação delegável" : "selecione as áreas de trabalho"}</strong>.</p><p className="v2-muted">As sugestões respeitam os limites do seu acesso. O mesmo conjunto de ações será aplicado a cada área selecionada. A escolha de novas áreas recalcula as sugestões.</p><details><summary>Personalizar ações</summary>{Object.entries(operationLabels).filter(([o]) => domains.length > 0 && grants.some(g => mayDelegate(g,unitId || null,role,domains,[o]))).map(([o,label]) => <label className="admin-permission" key={o}><input type="checkbox" checked={operations.includes(o)} disabled={o === "visualizar"} onChange={() => setOperations(toggle(operations,o))} />{label}</label>)}{!domains.length && <p>Escolha uma área para ver as ações disponíveis.</p>}</details></> : Object.entries(operationLabels).filter(([o]) => Object.keys(domainLabels).some(d => canChoose(d,o))).map(([o,label]) => <label className="admin-permission" key={o}><input type="checkbox" checked={operations.includes(o)} onChange={() => setOperations(toggle(operations,o))} />{label}</label>)}</fieldset>
          {modern ? <section className="v3-access-summary" aria-label="Prévia do convite"><h2><ShieldCheck size={20} aria-hidden /> Confira o acesso antes de convidar</h2><p><strong>{name || "Pessoa convidada"}</strong> · {responsibilityLabels[role]} · {scopeName(unitId || null, catalog)}</p>{inviteAccessPreview(domains, operations).map(item => <p key={item.domain}><strong>{item.label}:</strong> {item.actions.join(" · ")}</p>)}{!domains.length && <p>Selecione as áreas de trabalho para completar o convite.</p>}{domains.includes("esf.producao") && <p className="v2-muted">Produção ESF: o acesso às equipes depende de vínculo específico. Perfis de gestão autorizados podem abranger as equipes da UBS.</p>}<p className="v2-muted">Este convite não configura permissões nominais da Vigilância. As autorizações específicas continuam separadas.</p></section> : <p className="v2-muted">As permissões selecionadas continuam sujeitas às regras de cada área e ao escopo do vínculo.</p>}
        </> : <><label>CNES (7 dígitos)<input required inputMode="numeric" pattern="[0-9]{7}" maxLength={7} value={cnes} onChange={e => setCnes(e.target.value.replace(/\D/g,""))} /></label><label>Logradouro e número<input name="street" maxLength={240} autoComplete="street-address" /></label><label>Município<input name="city" maxLength={120} autoComplete="address-level2" /></label><label>UF<input name="state" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" autoComplete="address-level1" /></label><label>CEP<input name="postalCode" inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" maxLength={9} autoComplete="postal-code" /></label></>}
      </fieldset>
      {error && <p className="v2-alert" data-tone="error" role="alert">{error}</p>}
      <div className="dialog-actions"><Link className="v2-secondary" href={returnTo}>Cancelar</Link><button className="v2-button" disabled={!ready || busy || partial || (area === "usuarios" && !validInvite)}>{busy ? "Confirmando..." : area === "usuarios" ? modern ? "Enviar convite com este acesso" : "Enviar convite" : "Salvar unidade"}</button></div>
    </form>
  </section>;
}
