"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, BarChart3, BookOpenText, Boxes, Building2, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, ClipboardList, HeartHandshake, Home, Inbox, LogOut, Menu, PackageSearch, Settings2, ShieldCheck, Sparkles, Stethoscope, Users2, X } from "lucide-react";
import { AppShellLegacy } from "@/components/app-shell-legacy";
import { OfflineStatus } from "@/components/offline-status";
import { OfflineVault } from "@/lib/offline/vault";
import { createSupabaseBrowserClient } from "@/lib/client/supabase";
import type { WorkspaceContext } from "@/lib/server/workspace";

const navigation = [
  { slug: "", label: "Início", icon: Home },
  { slug: "conhecimento", label: "Conhecimento", icon: BookOpenText },
  { slug: "protocolos", label: "Protocolos", icon: ClipboardCheck },
  { slug: "indicadores", label: "Indicadores e metas", icon: BarChart3 },
  { slug: "melhoria", label: "Melhoria contínua", icon: Sparkles },
  { slug: "reunioes", label: "Reuniões", icon: CalendarDays },
  { slug: "formularios-esf", label: "Formulários ESF", icon: ClipboardCheck },
  { slug: "vigilancia", label: "Vigilância Epidemiológica", icon: ShieldCheck },
  { slug: "qualidade", label: "Qualidade", icon: CheckCircle2 },
  { slug: "pessoas", label: "Pessoas", icon: Users2 },
  { slug: "patrimonio", label: "Patrimônio", icon: PackageSearch },
  { slug: "estoque", label: "Estoque", icon: Boxes },
  { slug: "seguranca", label: "Segurança", icon: ShieldCheck },
  { slug: "ouvidoria", label: "Ouvidoria", icon: HeartHandshake },
  { slug: "administracao", label: "Administração", icon: Settings2 }
];

const taskNavigation = [
  { slug: "", label: "Meu trabalho", mobileLabel: "Início", icon: Home, modules: [] },
  { slug: "registrar", label: "Registros da equipe", mobileLabel: "Registrar", icon: ClipboardList, modules: ["formularios-esf", "vigilancia", "protocolos"] },
  { slug: "pendencias", label: "Revisão e fechamento", mobileLabel: "Pendências", icon: Inbox, modules: ["formularios-esf", "vigilancia", "protocolos", "conhecimento", "melhoria", "reunioes"] },
  { slug: "resultados", label: "Resultados", mobileLabel: "Resultados", icon: BarChart3, modules: ["indicadores", "formularios-esf", "vigilancia"] },
  { slug: "organizacao", label: "Qualidade e organização", mobileLabel: "Organização", icon: Sparkles, modules: ["conhecimento", "protocolos", "melhoria", "reunioes", "qualidade", "pessoas", "patrimonio", "estoque", "seguranca", "ouvidoria"] },
  { slug: "administracao", label: "Administração", mobileLabel: "Administração", icon: Settings2, modules: ["administracao"] }
];

export function AppShell({ children, workspace }: { children: React.ReactNode; workspace?: WorkspaceContext }) {
  return workspace && (workspace.uxV2 || workspace.uxV3) ? <ModernShell workspace={workspace}>{children}</ModernShell> : <AppShellLegacy workspace={workspace}>{children}</AppShellLegacy>;
}

function ModernShell({ children, workspace }: { children: React.ReactNode; workspace: WorkspaceContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [account, setAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const v3 = Boolean(workspace.uxV3);
  const themeClass = `ux-v2${v3 ? " aps-v3" : ""}`;
  const items = navigation.filter((item) => !item.slug || workspace.enabledModules.includes(item.slug));
  const taskItems = taskNavigation.filter((item) => !item.modules.length || item.modules.some((slug) => workspace.enabledModules.includes(slug)));
  const mobileItems = v3
    ? taskItems.filter((item) => ["", "registrar", "pendencias"].includes(item.slug))
    : ["", "protocolos", "melhoria", "reunioes"].flatMap((slug) => items.filter((item) => item.slug === slug));
  const resourceModules: Record<string, string> = { knowledge: "conhecimento", "knowledge-versions": "conhecimento", protocols: "protocolos", "protocol-versions": "protocolos", executions: "protocolos", indicators: "indicadores", measurements: "indicadores", nonconformities: "melhoria", "action-plans": "melhoria", actions: "melhoria", meetings: "reunioes", referrals: "reunioes" };
  const pathParts = pathname.split("/");
  const activeModule = ["registros", "cadastros"].includes(pathParts[1]) ? resourceModules[pathParts[2]] : pathParts[1];
  const isActive = (slug: string) => slug === activeModule;
  const activeTask = taskItems.some((item) => item.slug === activeModule) ? activeModule
    : ["formularios-esf", "vigilancia", "protocolos"].includes(activeModule) ? "registrar"
    : activeModule === "indicadores" ? "resultados"
    : items.some((item) => item.slug === activeModule) ? "organizacao" : undefined;
  const taskActive = (slug: string) => slug === activeTask;
  const mobileLabel = (slug: string, label: string) => v3 ? taskNavigation.find((item) => item.slug === slug)?.mobileLabel ?? label : slug === "melhoria" ? "Melhoria" : label;

  async function changeScope(value: string) {
    const scope = workspace.scopes.find((item) => `${item.organizationId}:${item.unitId ?? ""}` === value);
    if (!scope) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/v1/workspace/scope", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId: scope.organizationId, unitId: scope.unitId }) });
      if (!response.ok) throw new Error("Não foi possível trocar a unidade. Tente novamente.");
      router.replace("/"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível trocar a unidade."); }
    finally { setBusy(false); }
  }

  async function signOut(scope: "local" | "global") {
    setBusy(true); setMessage("");
    try {
      await OfflineVault.purge();
      const { error } = await createSupabaseBrowserClient().auth.signOut({ scope });
      if (error) throw error;
      router.replace("/login"); router.refresh();
    } catch { setMessage("Não foi possível encerrar a sessão. Tente novamente."); }
    finally { setBusy(false); }
  }

  const navLinks = items.map((item) => <Link key={item.slug} href={`/${item.slug}`} className="v2-nav-link" aria-current={isActive(item.slug) ? "page" : undefined} onClick={() => setDrawer(false)}><item.icon size={20} aria-hidden />{item.label}</Link>);
  const taskLinks = (slugs: string[]) => taskItems.filter((item) => slugs.includes(item.slug)).map((item) => <Link key={item.slug} href={`/${item.slug}`} className="v2-nav-link" aria-current={taskActive(item.slug) ? (isActive(item.slug) ? "page" : "location") : undefined} onClick={() => setDrawer(false)}><item.icon size={20} aria-hidden /><span>{item.label}</span></Link>);
  const extraItems = items.filter((item) => item.slug && item.slug !== "administracao");
  const groupedNavigation = <>
    <div className="aps-nav-group"><p className="v2-nav-caption">Rotina da equipe</p>{taskLinks(["", "registrar", "pendencias"])}</div>
    {taskItems.some((item) => ["resultados", "organizacao", "administracao"].includes(item.slug)) && <div className="aps-nav-group"><p className="v2-nav-caption">Gestão e apoio</p>{taskLinks(["resultados", "organizacao", "administracao"])}</div>}
    {!!extraItems.length && <details className="aps-area-links"><summary>Acessos por área <ChevronDown size={16} aria-hidden /></summary><div>{extraItems.map((item) => <Link key={item.slug} href={`/${item.slug}`} className="v2-nav-link" aria-current={isActive(item.slug) ? "page" : undefined} onClick={() => setDrawer(false)}><item.icon size={18} aria-hidden /><span>{item.label}</span></Link>)}</div></details>}
  </>;
  return <div className={`${themeClass} v2-shell`}>
    <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo principal</a>
    <aside className="v2-sidebar">
      <Link href="/" className="v2-brand" aria-label="SGC UBS — início"><span><Stethoscope size={24} aria-hidden /></span><div><strong>SGC UBS</strong><small>{v3 ? "Atenção primária" : "Gestão integrada"}</small></div></Link>
      {!v3 && <div className="v2-nav-caption">Seu espaço de trabalho</div>}
      <nav aria-label="Navegação principal">{v3 ? groupedNavigation : navLinks}</nav>
      <div className="v2-sidebar-note"><ShieldCheck size={18} aria-hidden /><span>{v3 ? <>Gestão conectada à rotina<br />da sua equipe.</> : <>Conhecimento, evidência<br />e melhoria contínua.</>}</span></div>
    </aside>
    <div className="v2-main-wrap">
      <header className="v2-topbar">
        <div className="v2-workspace"><Building2 size={20} aria-hidden /><div><span className="v2-organization">{workspace.organizationName}</span>{workspace.scopes.length > 1 ? <label className="v2-scope-control"><span className="sr-only">Unidade de trabalho</span><select disabled={busy} value={`${workspace.organizationId}:${workspace.unitId ?? ""}`} onChange={(event) => void changeScope(event.target.value)}>{workspace.scopes.map((scope) => <option key={`${scope.organizationId}:${scope.unitId}`} value={`${scope.organizationId}:${scope.unitId ?? ""}`}>{v3 ? scope.unitName : `${scope.unitName} · ${scope.organizationName}`}</option>)}</select></label> : <strong>{workspace.unitName}</strong>}</div></div>
        <div className="v2-account-tools"><span className="v2-environment">{workspace.environmentLabel}</span><OfflineStatus workspace={workspace} /><Dialog.Root open={account} onOpenChange={setAccount}><Dialog.Trigger asChild><button className="v2-account-trigger" aria-label={`Abrir conta de ${workspace.userName}`}><span className="v2-avatar">{workspace.userInitials}</span><ChevronDown size={14} aria-hidden /></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className={`${themeClass} v2-overlay`} /><Dialog.Content className={`${themeClass} v2-dialog v2-account-dialog`}><Dialog.Title>Minha conta</Dialog.Title><Dialog.Description>{workspace.userName}</Dialog.Description><div className="v2-account-info"><Building2 size={18} aria-hidden /><span>{workspace.unitName}</span></div>{v3 && !!workspace.responsibilities?.length && <p className="v2-muted">Você atua como: {workspace.responsibilities.join(" · ")}</p>}<button className="v2-secondary" disabled={busy} onClick={() => void signOut("local")}><LogOut size={18} aria-hidden />Sair deste dispositivo</button><button className="v2-secondary" disabled={busy} onClick={() => void signOut("global")}>Encerrar todas as sessões</button><p className="v2-muted">Ao sair, os dados offline deste navegador serão removidos.</p>{message && <p className="v2-alert" role="alert">{message}</p>}<Dialog.Close className="v2-icon-button v2-dialog-close" aria-label="Fechar conta"><X size={20} /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root></div>
      </header>
      {message && !account && <div className="v2-alert" role="alert">{message}</div>}
      <main id="conteudo-principal" tabIndex={-1}>{children}</main>
    </div>
    <nav className="v2-mobile-nav" aria-label="Navegação móvel">
      {mobileItems.map((item) => <Link key={item.slug} href={`/${item.slug}`} aria-label={v3 ? `${mobileLabel(item.slug, item.label)} · ${item.label}` : undefined} aria-current={(v3 ? taskActive(item.slug) : isActive(item.slug)) ? (isActive(item.slug) ? "page" : "location") : undefined}>
        <item.icon size={21} aria-hidden /><span>{mobileLabel(item.slug, item.label)}</span>
      </Link>)}
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Trigger asChild><button aria-label="Mais áreas e navegação"><Menu size={21} aria-hidden /><span>Mais</span></button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={`${themeClass} v2-overlay`} />
          <Dialog.Content className={`${themeClass} v2-dialog v2-drawer`}>
            <Dialog.Title>{v3 ? "Seu espaço de trabalho" : "Áreas de trabalho"}</Dialog.Title>
            <Dialog.Description>{workspace.unitName}</Dialog.Description>
            <nav aria-label="Todas as áreas">{v3 ? groupedNavigation : navLinks}</nav>
            <Dialog.Close className="v2-icon-button v2-dialog-close" aria-label="Fechar navegação"><X size={20} /></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </nav>
  </div>;
}

export { AlertTriangle };
