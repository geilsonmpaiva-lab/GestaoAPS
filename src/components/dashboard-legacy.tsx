import Link from "next/link";
import { Activity, AlertCircle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, ShieldAlert, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { loadDashboardCounts, loadWorkspaceContext } from "@/lib/server/workspace";

const demoMetrics = [
  { label: "Indicadores fora da meta", value: "4", note: "2 exigem análise", href: "/indicadores?view=outside", icon: Activity, color: "#b8514e", bg: "#f7e3e1" },
  { label: "Ações atrasadas", value: "7", note: "−3 desde segunda", href: "/melhoria?view=overdue-actions", icon: CalendarClock, color: "#dd8d33", bg: "#faecd9" },
  { label: "Não conformidades abertas", value: "5", note: "1 crítica", href: "/melhoria", icon: ShieldAlert, color: "#397fa3", bg: "#e0eef4" },
  { label: "Protocolos no prazo", value: "92%", note: "+6% neste mês", href: "/protocolos?view=completed-executions", icon: CheckCircle2, color: "#175f4c", bg: "#dceee4" }
];

const demoAttentions = [
  { title: "Auditoria mensal da sala de vacina", meta: "Prazo hoje · Qualidade", status: "Crítico", tone: "#f7e3e1", color: "#a33e3a", icon: ShieldAlert },
  { title: "Plano de ação — divergência de estoque", meta: "Venceu há 2 dias · Farmácia", status: "Atrasado", tone: "#faecd9", color: "#a65e16", icon: AlertCircle },
  { title: "Medição de cobertura de escala", meta: "Sem dado · Competência agosto", status: "Pendente", tone: "#e0eef4", color: "#286f92", icon: ClipboardList },
  { title: "Reunião mensal da equipe", meta: "Amanhã, 14h · 3 encaminhamentos", status: "Próximo", tone: "#e4efe9", color: "#175f4c", icon: CalendarClock }
];

export default async function DashboardLegacy() {
  const [dashboard, workspace] = await Promise.all([loadDashboardCounts(), loadWorkspaceContext()]);
  const metrics = dashboard ? [
    { ...demoMetrics[0], value: String(dashboard.outside), note: "Medições consolidadas" },
    { ...demoMetrics[1], value: String(dashboard.overdue), note: "Prazo já vencido" },
    { ...demoMetrics[2], value: String(dashboard.nonconformities), note: "Em tratamento" },
    { ...demoMetrics[3], value: `${dashboard.protocolRate}%`, note: "Execuções concluídas" }
  ] : demoMetrics;
  const attentions = dashboard ? dashboard.notifications.map((notification) => ({
    title: notification.title,
    meta: `${String(notification.kind).replaceAll("_", " ")} · ${notification.due_at ? new Date(notification.due_at).toLocaleDateString("pt-BR") : "Sem prazo"}`,
    status: notification.severity === "CRITICAL" ? "Crítico" : notification.severity === "ATTENTION" ? "Atenção" : "Informativo",
    tone: notification.severity === "CRITICAL" ? "#f7e3e1" : notification.severity === "ATTENTION" ? "#faecd9" : "#e0eef4",
    color: notification.severity === "CRITICAL" ? "#a33e3a" : notification.severity === "ATTENTION" ? "#a65e16" : "#286f92",
    icon: notification.severity === "CRITICAL" ? ShieldAlert : AlertCircle
  })) : demoAttentions;
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  return (
    <AppShell workspace={workspace}>
      <div className="content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 20, flexWrap: "wrap" }}>
          <div>
            <span className="eyebrow"><TrendingUp size={14} /> {dateLabel}</span>
            <h1 className="page-title">O que exige atenção hoje?</h1>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Prioridades consolidadas de {workspace.unitName}.</p>
          </div>
          <Link className="chip" href="/protocolos" style={{ background: "#175f4c", color: "white", borderColor: "#175f4c" }}>Iniciar protocolo <ArrowRight size={14} /></Link>
        </div>

        <section className="metric-grid" aria-label="Resumo gerencial">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Link href={metric.href} className="panel metric" key={metric.label} style={{ "--metric-color": metric.color, "--metric-bg": metric.bg, "--metric-tint": metric.bg } as React.CSSProperties}>
                <div className="metric-head"><div className="metric-icon"><Icon size={18} /></div><span className="metric-trend">Ver detalhes <ArrowRight size={12} /></span></div>
                <div><div className="metric-value">{metric.value}</div><div className="metric-label">{metric.label}</div><div style={{ fontSize: 10, color: metric.color, fontWeight: 750, marginTop: 4 }}>{metric.note}</div></div>
              </Link>
            );
          })}
        </section>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-head">
              <div><h2 className="panel-title">Fila de atenção</h2><p className="panel-subtitle">Ordenada por criticidade e prazo.</p></div>
              <Link href="/melhoria" className="chip">Ver todas <ArrowRight size={13} /></Link>
            </div>
            <div className="attention-list">
              {attentions.map((item) => {
                const Icon = item.icon;
                return (
                  <div className="attention-item" key={item.title}>
                    <div className="attention-icon" style={{ background: item.tone, color: item.color }}><Icon size={18} /></div>
                    <div><div className="attention-title">{item.title}</div><div className="attention-meta">{item.meta}</div></div>
                    <span className="badge" style={{ background: item.tone, color: item.color }}>{item.status}</span>
                  </div>
                );
              })}
              {attentions.length === 0 && <div className="empty-state"><CheckCircle2 size={24} /><b>Nenhuma pendência aberta</b><span>A fila autorizada está em dia.</span></div>}
            </div>
          </article>

          <aside className="panel">
            <div className="panel-head"><div><h2 className="panel-title">Ciclo de gestão</h2><p className="panel-subtitle">Progresso da competência atual.</p></div><span className="badge" style={{ background: "#dceee4", color: "#175f4c" }}>Setembro</span></div>
            <div className="progress-row"><div className="progress-meta"><b>Protocolos executados</b><span>23/25</span></div><div className="progress-track"><div className="progress-value" style={{ width: "92%" }} /></div></div>
            <div className="progress-row"><div className="progress-meta"><b>Indicadores apurados</b><span>14/18</span></div><div className="progress-track"><div className="progress-value" style={{ width: "78%", background: "#397fa3" }} /></div></div>
            <div className="progress-row"><div className="progress-meta"><b>Ações concluídas</b><span>17/26</span></div><div className="progress-track"><div className="progress-value" style={{ width: "65%", background: "#dd8d33" }} /></div></div>
            <div style={{ margin: "4px 18px 18px", padding: 15, borderRadius: 14, background: "#f1f6f2", border: "1px solid #e1eae4" }}>
              <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 5 }}>Próximo marco</div>
              <div style={{ font: "600 17px/1.25 Georgia, serif", letterSpacing: "-.02em" }}>Fechar as medições de agosto</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>4 dias restantes · 4 responsáveis</div>
            </div>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
