import Link from "next/link";
import { Activity, ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import DashboardLegacy from "@/components/dashboard-legacy";
import { loadDashboardV2, loadWorkspaceContext } from "@/lib/server/workspace";

export default async function DashboardPage() {
  const workspace = await loadWorkspaceContext();
  if (!workspace.uxV2) return <DashboardLegacy />;
  const dashboard = await loadDashboardV2(workspace);
  const cards = [
    { label: "Medições fora da meta", value: dashboard.outside, href: "/indicadores?view=outside", icon: Activity, module: "indicadores" },
    { label: "Ações atrasadas", value: dashboard.overdue, href: "/melhoria?view=overdue-actions", icon: CalendarClock, module: "melhoria" },
    { label: "Não conformidades abertas", value: dashboard.nonconformities, href: "/melhoria", icon: ShieldAlert, module: "melhoria" },
    { label: "Execuções concluídas", value: dashboard.completed, href: "/protocolos?view=completed-executions", icon: CheckCircle2, module: "protocolos" }
  ].filter((card) => workspace.enabledModules.includes(card.module));
  const severityLabels: Record<string, string> = { CRITICAL: "Crítico", ATTENTION: "Atenção", INFORMATION: "Informativo" };
  return <AppShell workspace={workspace}><div className="content ux-dashboard">
    <div className="module-heading"><div><span className="eyebrow">Sua operação hoje</span><h1 className="page-title">Prioridades da unidade</h1><p className="muted">{workspace.unitName} · {workspace.organizationName}</p></div>{workspace.enabledModules.includes("protocolos") && <Link className="primary-button" href="/protocolos"><ClipboardCheck size={18} />Ver protocolos</Link>}</div>
    <p className="muted">{dashboard.demo ? "Demonstração: painel sem registros operacionais carregados." : `Atualizado às ${new Date(dashboard.updatedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}. Totais do escopo selecionado, em todos os períodos.`}</p>
    <section className="metric-grid" aria-label="Resumo operacional">{cards.map(({ icon: Icon, ...card }) => <Link className="panel metric" href={card.href} key={card.label}><div className="metric-head"><Icon size={22} /><span className="metric-trend">Ver registros <ArrowRight size={14} /></span></div><strong className="metric-value">{card.value}</strong><span className="metric-label">{card.label}</span></Link>)}</section>
    <section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><h2 className="panel-title">Fila de atenção</h2><p className="panel-subtitle">Criticidade primeiro, depois o prazo mais próximo.</p></div></div><div className="attention-list">{dashboard.notifications.length ? dashboard.notifications.map((item) => <div className="attention-item" key={item.id}><ShieldAlert size={20} /><div>{item.href ? <Link className="attention-title" href={item.href}>{item.title}</Link> : <span className="attention-title">{item.title}</span>}<p className="attention-meta">{item.due_at ? `Prazo: ${new Date(item.due_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "Sem prazo definido"}</p></div><span className="badge">{severityLabels[item.severity] ?? item.severity}</span></div>) : <div className="empty-state"><CheckCircle2 size={28} /><b>Nenhuma notificação pendente</b><span>Consulte também os registros nos cards de prioridade.</span></div>}</div></article>
    <aside className="panel"><div className="panel-head"><div><h2 className="panel-title">Continue o trabalho</h2><p className="panel-subtitle">Acesso direto às etapas do ciclo.</p></div></div><div className="record-list">{[{ slug: "conhecimento", title: "Consultar conhecimento", href: "/conhecimento" }, { slug: "protocolos", title: "Acompanhar execuções", href: "/protocolos?view=executions" }, { slug: "melhoria", title: "Acompanhar planos", href: "/melhoria?view=plans" }, { slug: "reunioes", title: "Organizar reuniões", href: "/reunioes" }].filter((item) => workspace.enabledModules.includes(item.slug)).map((item) => <Link className="attention-item" href={item.href} key={item.slug}>{item.title}<ArrowRight size={16} /></Link>)}</div></aside></section>
  </div></AppShell>;
}
