"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle, BarChart3, BookOpenText, Boxes, Building2, CalendarDays,
  CheckCircle2, ClipboardCheck, Gauge, HeartHandshake, Home, PackageSearch,
  LogOut, Settings2, ShieldCheck, Sparkles, Stethoscope, Users2
} from "lucide-react";
import { OfflineStatus } from "@/components/offline-status";
import { createSupabaseBrowserClient } from "@/lib/client/supabase";
import { OfflineVault } from "@/lib/offline/vault";
import type { WorkspaceContext } from "@/lib/server/workspace";

const primary = [
  { href: "/", label: "Visão geral", icon: Home },
  { href: "/conhecimento", label: "Conhecimento", icon: BookOpenText },
  { href: "/protocolos", label: "Protocolos", icon: ClipboardCheck },
  { href: "/indicadores", label: "Indicadores", icon: BarChart3 },
  { href: "/melhoria", label: "Melhoria contínua", icon: Sparkles },
  { href: "/reunioes", label: "Reuniões", icon: CalendarDays }
];

const domains = [
  { href: "/qualidade", label: "Qualidade", icon: CheckCircle2 },
  { href: "/pessoas", label: "Pessoas", icon: Users2 },
  { href: "/patrimonio", label: "Patrimônio", icon: PackageSearch },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/seguranca", label: "Segurança", icon: ShieldCheck },
  { href: "/ouvidoria", label: "Ouvidoria", icon: HeartHandshake }
];

function NavItem({ item, pathname }: { item: (typeof primary)[number]; pathname: string }) {
  const Icon = item.icon;
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return <Link className="nav-link" data-active={active} href={item.href}><Icon size={17} aria-hidden />{item.label}</Link>;
}

export function AppShell({ children, workspace }: { children: React.ReactNode; workspace?: WorkspaceContext }) {
  const pathname = usePathname();
  const router = useRouter();
  async function signOut() {
    await OfflineVault.purge();
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const client = createSupabaseBrowserClient();
      await client.auth.signOut({ scope: "global" });
    }
    router.replace("/login");
    router.refresh();
  }
  return (
    <>
    <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo principal</a>
    <div className="app-grid">
      <aside className="sidebar" aria-label="Navegação principal">
        <Link href="/" className="brand" aria-label="SGC UBS — início">
          <span className="brand-mark"><Stethoscope size={23} strokeWidth={2.2} /></span>
          <span><span className="brand-name">SGC UBS</span><span className="brand-note">Gestão integrada</span></span>
        </Link>
        <nav>
          <div className="nav-label">Operação</div>
          {primary.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)}
          <div className="nav-label">Domínios</div>
          {domains.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)}
        </nav>
        <div className="sidebar-foot">
          <Link className="nav-link" data-active={pathname.startsWith("/administracao")} href="/administracao"><Settings2 size={17} />Administração</Link>
        </div>
      </aside>
      <main className="main" id="conteudo-principal" tabIndex={-1}>
        <header className="topbar">
          <div className="chip" title={workspace?.organizationName}><Building2 size={14} /> {workspace?.unitName ?? "UBS Jardim Aurora"} <span aria-hidden>⌄</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div className="chip"><Gauge size={14} /> {workspace?.environmentLabel ?? "Ambiente de demonstração"}</div>
            <OfflineStatus />
            <button className="avatar" aria-label={`Encerrar todas as sessões de ${workspace?.userName ?? "Ana Lima"} e sair`} title="Sair" onClick={signOut}>{workspace?.userInitials ?? <LogOut size={15} />}</button>
          </div>
        </header>
        {children}
      </main>
      <nav className="mobile-bar" aria-label="Navegação móvel">
        {primary.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <Link key={item.href} className="mobile-link" data-active={active} href={item.href}><Icon size={18} />{item.label.split(" ")[0]}</Link>;
        })}
        <Link className="mobile-link" data-active={pathname.startsWith("/administracao")} href="/administracao"><Settings2 size={18} />Mais</Link>
      </nav>
    </div>
    </>
  );
}

export { AlertTriangle };
