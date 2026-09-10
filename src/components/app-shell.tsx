"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, BarChart3, BookOpenText, Boxes, Building2, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, HeartHandshake, Home, LogOut, Menu, PackageSearch, Settings2, ShieldCheck, Sparkles, Stethoscope, Users2, X } from "lucide-react";
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
  { slug: "qualidade", label: "Qualidade", icon: CheckCircle2 },
  { slug: "pessoas", label: "Pessoas", icon: Users2 },
  { slug: "patrimonio", label: "Patrimônio", icon: PackageSearch },
  { slug: "estoque", label: "Estoque", icon: Boxes },
  { slug: "seguranca", label: "Segurança", icon: ShieldCheck },
  { slug: "ouvidoria", label: "Ouvidoria", icon: HeartHandshake },
  { slug: "administracao", label: "Administração", icon: Settings2 }
];

export function AppShell({ children, workspace }: { children: React.ReactNode; workspace?: WorkspaceContext }) {
  return workspace?.uxV2 ? <ModernShell workspace={workspace}>{children}</ModernShell> : <AppShellLegacy workspace={workspace}>{children}</AppShellLegacy>;
}

function ModernShell({ children, workspace }: { children: React.ReactNode; workspace: WorkspaceContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [account, setAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const items = navigation.filter((item) => !item.slug || workspace.enabledModules.includes(item.slug));
  const mobileItems = ["", "protocolos", "melhoria", "reunioes"].flatMap((slug) => items.filter((item) => item.slug === slug));
  const resourceModules: Record<string, string> = { knowledge: "conhecimento", "knowledge-versions": "conhecimento", protocols: "protocolos", "protocol-versions": "protocolos", executions: "protocolos", indicators: "indicadores", measurements: "indicadores", nonconformities: "melhoria", "action-plans": "melhoria", actions: "melhoria", meetings: "reunioes", referrals: "reunioes" };
  const pathParts = pathname.split("/");
  const activeModule = ["registros", "cadastros"].includes(pathParts[1]) ? resourceModules[pathParts[2]] : pathParts[1];
  const isActive = (slug: string) => slug === activeModule;

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
  return <div className="ux-v2 v2-shell">
    <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo principal</a>
    <aside className="v2-sidebar">
      <Link href="/" className="v2-brand" aria-label="SGC UBS — início"><span><Stethoscope size={24} aria-hidden /></span><div><strong>SGC UBS</strong><small>Gestão integrada</small></div></Link>
      <div className="v2-nav-caption">Seu espaço de trabalho</div>
      <nav aria-label="Navegação principal">{navLinks}</nav>
      <div className="v2-sidebar-note"><ShieldCheck size={18} aria-hidden /><span>Conhecimento, evidência<br />e melhoria contínua.</span></div>
    </aside>
    <div className="v2-main-wrap">
      <header className="v2-topbar">
        <div className="v2-workspace"><Building2 size={20} aria-hidden /><div><span className="v2-organization">{workspace.organizationName}</span>{workspace.scopes.length > 1 ? <label className="v2-scope-control"><span className="sr-only">Unidade de trabalho</span><select disabled={busy} value={`${workspace.organizationId}:${workspace.unitId ?? ""}`} onChange={(event) => void changeScope(event.target.value)}>{workspace.scopes.map((scope) => <option key={`${scope.organizationId}:${scope.unitId}`} value={`${scope.organizationId}:${scope.unitId ?? ""}`}>{scope.unitName} · {scope.organizationName}</option>)}</select></label> : <strong>{workspace.unitName}</strong>}</div></div>
        <div className="v2-account-tools"><span className="v2-environment">{workspace.environmentLabel}</span><OfflineStatus workspace={workspace} /><Dialog.Root open={account} onOpenChange={setAccount}><Dialog.Trigger asChild><button className="v2-account-trigger" aria-label={`Abrir conta de ${workspace.userName}`}><span className="v2-avatar">{workspace.userInitials}</span><ChevronDown size={14} aria-hidden /></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="ux-v2 v2-overlay" /><Dialog.Content className="ux-v2 v2-dialog v2-account-dialog"><Dialog.Title>Minha conta</Dialog.Title><Dialog.Description>{workspace.userName}</Dialog.Description><div className="v2-account-info"><Building2 size={18} aria-hidden /><span>{workspace.unitName}</span></div><button className="v2-secondary" disabled={busy} onClick={() => void signOut("local")}><LogOut size={18} aria-hidden />Sair deste dispositivo</button><button className="v2-secondary" disabled={busy} onClick={() => void signOut("global")}>Encerrar todas as sessões</button><p className="v2-muted">Ao sair, os dados offline deste navegador serão removidos.</p>{message && <p className="v2-alert" role="alert">{message}</p>}<Dialog.Close className="v2-icon-button v2-dialog-close" aria-label="Fechar conta"><X size={20} /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root></div>
      </header>
      {message && !account && <div className="v2-alert" role="alert">{message}</div>}
      <main id="conteudo-principal" tabIndex={-1}>{children}</main>
    </div>
    <nav className="v2-mobile-nav" aria-label="Navegação móvel">{mobileItems.map((item) => <Link key={item.slug} href={`/${item.slug}`} aria-current={isActive(item.slug) ? "page" : undefined}><item.icon size={21} aria-hidden /><span>{item.slug === "melhoria" ? "Melhoria" : item.label}</span></Link>)}<Dialog.Root open={drawer} onOpenChange={setDrawer}><Dialog.Trigger asChild><button aria-label="Mais áreas e navegação"><Menu size={21} aria-hidden /><span>Mais</span></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="ux-v2 v2-overlay" /><Dialog.Content className="ux-v2 v2-dialog v2-drawer"><Dialog.Title>Áreas de trabalho</Dialog.Title><Dialog.Description>{workspace.unitName}</Dialog.Description><nav aria-label="Todas as áreas">{navLinks}</nav><Dialog.Close className="v2-icon-button v2-dialog-close" aria-label="Fechar navegação"><X size={20} /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root></nav>
  </div>;
}

export { AlertTriangle };
