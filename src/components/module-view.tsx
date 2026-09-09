"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleAlert, Filter, LockKeyhole, Plus, Search, WifiOff, X } from "lucide-react";
import type { ModuleDefinition, ModuleRecord } from "@/lib/modules";

const tones = {
  green: { bg: "#dceee4", color: "#175f4c" }, amber: { bg: "#faecd9", color: "#9c5b18" },
  red: { bg: "#f7e3e1", color: "#a33e3a" }, blue: { bg: "#e0eef4", color: "#286f92" }, gray: { bg: "#edf1ee", color: "#5f716a" }
};

type Field = { key: string; label: string; type?: "text" | "datetime-local" | "number" | "textarea"; options?: string[]; required?: boolean; defaultValue?: string };
const createConfigs: Record<string, { resource: string; fields: Field[] }> = {
  conhecimento: { resource: "knowledge", fields: [
    { key: "title", label: "Título", required: true }, { key: "type", label: "Tipo", options: ["TEMPLATE", "GOOD_PRACTICE", "LESSON_LEARNED", "MANUAL", "POLICY", "FAQ"], required: true, defaultValue: "TEMPLATE" },
    { key: "domain", label: "Domínio", required: true, defaultValue: "GOVERNANCA" }, { key: "accessLevel", label: "Nível de acesso", options: ["INTERNAL", "PUBLIC_INSTITUTIONAL", "RESTRICTED"], required: true, defaultValue: "INTERNAL" }
  ] },
  protocolos: { resource: "protocols", fields: [
    { key: "code", label: "Código", required: true }, { key: "title", label: "Título", required: true }, { key: "domain", label: "Domínio", required: true, defaultValue: "QUALIDADE" }
  ] },
  indicadores: { resource: "indicators", fields: [
    { key: "code", label: "Código", required: true }, { key: "name", label: "Nome", required: true }, { key: "definition", label: "Definição institucional", required: true },
    { key: "unit", label: "Unidade", required: true, defaultValue: "PERCENTUAL" }, { key: "periodicity", label: "Periodicidade", required: true, defaultValue: "MENSAL" },
    { key: "source", label: "Fonte", required: true, defaultValue: "EXECUCOES" }, { key: "domain", label: "Domínio", required: true, defaultValue: "QUALIDADE" },
    { key: "betterDirection", label: "Melhor direção", options: ["HIGHER", "LOWER", "RANGE", "EQUAL"], required: true, defaultValue: "HIGHER" }
  ] },
  reunioes: { resource: "meetings", fields: [
    { key: "title", label: "Título", required: true }, { key: "startsAt", label: "Início", type: "datetime-local", required: true }, { key: "location", label: "Local" }
  ] },
  melhoria: { resource: "action-plans", fields: [
    { key: "title", label: "Título do plano 5W2H", required: true }, { key: "dueAt", label: "Prazo", type: "datetime-local" }
  ] },
  qualidade: { resource: "audit-models", fields: [
    { key: "name", label: "Nome do modelo", required: true }, { key: "auditType", label: "Tipo", options: ["INTERNAL", "EXTERNAL"], defaultValue: "INTERNAL", required: true },
    { key: "domain", label: "Domínio", defaultValue: "QUALIDADE", required: true }, { key: "periodicity", label: "Periodicidade", defaultValue: "MENSAL" },
    { key: "versionNumber", label: "Número da versão", type: "number", defaultValue: "1", required: true }, { key: "criterion", label: "Primeiro critério", type: "textarea", required: true }
  ] },
  pessoas: { resource: "people", fields: [
    { key: "name", label: "Nome", required: true }, { key: "category", label: "Categoria profissional", required: true }, { key: "roleName", label: "Função" },
    { key: "employmentType", label: "Vínculo" }, { key: "weeklyHours", label: "Carga horária semanal", type: "number", defaultValue: "40" }
  ] },
  patrimonio: { resource: "asset-inventories", fields: [{ key: "title", label: "Título do inventário", required: true }] },
  estoque: { resource: "stock-inventories", fields: [{ key: "title", label: "Título do inventário", required: true }] },
  seguranca: { resource: "safety-events", fields: [
    { key: "eventAt", label: "Data e hora do evento", type: "datetime-local", required: true }, { key: "eventType", label: "Tipo parametrizado", required: true },
    { key: "location", label: "Local" }, { key: "description", label: "Descrição objetiva", type: "textarea", required: true }, { key: "harmClassification", label: "Classificação de dano" }
  ] },
  ouvidoria: { resource: "ombudsman", fields: [
    { key: "channel", label: "Canal", required: true }, { key: "manifestationType", label: "Tipo de manifestação", required: true }, { key: "subject", label: "Assunto", required: true },
    { key: "description", label: "Descrição", type: "textarea", required: true }, { key: "priority", label: "Prioridade", options: ["LOW", "NORMAL", "HIGH", "CRITICAL"], defaultValue: "NORMAL", required: true }, { key: "dueAt", label: "Prazo", type: "datetime-local" }
  ] }
};

function initialForm(moduleSlug: string) {
  return Object.fromEntries((createConfigs[moduleSlug]?.fields ?? []).map((field) => [field.key, field.defaultValue ?? ""]));
}

export function ModuleView({ module, initialQuery = "", organizationId, unitId }: { module: ModuleDefinition; initialQuery?: string; organizationId: string; unitId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => initialForm(module.slug));
  const [createMessage, setCreateMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<ModuleRecord | null>(null);
  const [commandMessage, setCommandMessage] = useState("");
  const [commandRunning, setCommandRunning] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const records = useMemo(() => module.records.filter((record) => `${record.title} ${record.meta} ${record.status}`.toLowerCase().includes(query.toLowerCase())), [module.records, query]);
  const gated = module.status === "gated";
  const createConfig = createConfigs[module.slug];

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams(currentSearchParams.toString());
    if (query.trim()) params.set("search", query.trim()); else params.delete("search");
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  async function createRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!createConfig) return;
    setSaving(true);
    setCreateMessage("");
    const payload: Record<string, unknown> = { organizationId, unitId, ...form };
    if (form.startsAt) payload.startsAt = new Date(form.startsAt).toISOString();
    if (form.dueAt) payload.dueAt = new Date(form.dueAt).toISOString();
    if (form.eventAt) payload.eventAt = new Date(form.eventAt).toISOString();
    if (form.versionNumber) payload.versionNumber = Number(form.versionNumber);
    if (form.weeklyHours) payload.weeklyHours = Number(form.weeklyHours);
    if (createConfig.resource === "audit-models") payload.checklistSchema = { criteria: [{ id: crypto.randomUUID(), label: form.criterion, requiresEvidence: false }] };
    delete payload.criterion;
    try {
      const response = await fetch(`/api/v1/${createConfig.resource}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar.");
      setCreateMessage("Registro criado com sucesso.");
      router.refresh();
      window.setTimeout(() => setCreateOpen(false), 500);
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function startMeeting() {
    if (!selected?.id) return;
    setCommandRunning(true);
    setCommandMessage("");
    try {
      const response = await fetch(`/api/v1/meetings/${selected.id}/start`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId: crypto.randomUUID(), expectedVersion: selected.version ?? 1 })
      });
      const body = await response.json() as { error?: string; version?: number };
      if (!response.ok) throw new Error(body.error || "Não foi possível iniciar a reunião.");
      setSelected((current) => current ? { ...current, status: "Em andamento", tone: "blue", version: body.version ?? current.version } : current);
      setCommandMessage("Reunião iniciada e registrada na trilha de auditoria.");
      router.refresh();
    } catch (error) {
      setCommandMessage(error instanceof Error ? error.message : "Não foi possível iniciar a reunião.");
    } finally {
      setCommandRunning(false);
    }
  }

  return (
    <div className="content">
      <div className="module-heading">
        <div><span className="eyebrow">{module.eyebrow}</span><h1 className="page-title">{module.title}</h1><p className="muted module-description">{module.description}</p></div>
        <button ref={createButtonRef} className="primary-button" disabled={gated || !createConfig} onClick={() => setCreateOpen(true)} title={!createConfig ? "Fluxo especializado em preparação" : undefined}><Plus size={16} />{module.primaryAction}</button>
      </div>

      {gated && <div className="gate-banner"><LockKeyhole size={20} /><div><b>Módulo protegido por gate de implantação</b><span>Disponível para configuração e homologação; dados reais dependem dos controles institucionais previstos no plano.</span></div></div>}

      <section className="module-metrics" aria-label={`Resumo de ${module.title}`}>
        {module.metrics.map((metric) => <article className="panel module-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></article>)}
      </section>

      <section className="panel records-panel">
        <div className="records-toolbar">
          <form className="search-box" role="search" onSubmit={submitSearch}><Search size={16} aria-hidden /><label className="sr-only" htmlFor={`search-${module.slug}`}>Pesquisar</label><input id={`search-${module.slug}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar registros..." /><button className="sr-only" type="submit">Pesquisar</button></form>
          <div className="filter-scroll">{module.filters.map((filter) => <button className="filter-button" key={filter}><Filter size={12} />{filter}</button>)}</div>
        </div>
        <div className="record-list" aria-live="polite">
          {records.map((record) => {
            const tone = tones[record.tone];
            return <article className="record-row" key={record.title}>
              <div className="record-state" style={{ background: tone.bg, color: tone.color }}>{record.tone === "green" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}</div>
              <div className="record-copy"><h2>{record.title}</h2><p>{record.meta}</p>{record.progress !== undefined && <div className="mini-progress"><span style={{ width: `${record.progress}%`, background: tone.color }} /></div>}</div>
              <span className="badge" style={{ background: tone.bg, color: tone.color }}>{record.status}</span>
              <button className="row-action" aria-label={`Abrir ${record.title}`} onClick={() => { setSelected(record); setCommandMessage(""); }}><ArrowRight size={16} /></button>
            </article>;
          })}
          {records.length === 0 && <div className="empty-state"><Search size={24} /><b>Nenhum registro encontrado</b><span>Tente remover ou alterar o termo de busca.</span></div>}
        </div>
      </section>
      <div className="offline-note"><WifiOff size={14} /> Esta área mantém rascunhos e operações no dispositivo quando você está sem conexão.</div>
      {createConfig && <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content create-dialog" aria-describedby="create-description" onCloseAutoFocus={(event) => { event.preventDefault(); createButtonRef.current?.focus(); }}>
            <Dialog.Title className="dialog-title">{module.primaryAction}</Dialog.Title>
            <Dialog.Description id="create-description" className="dialog-description">O registro será criado como rascunho no escopo atualmente selecionado.</Dialog.Description>
            <form className="create-form" onSubmit={createRecord}>
              {createConfig.fields.map((field) => <label key={field.key} htmlFor={`create-${field.key}`}>{field.label}
                {field.options ? <select id={`create-${field.key}`} required={field.required} value={form[field.key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
                  : field.type === "textarea" ? <textarea id={`create-${field.key}`} required={field.required} value={form[field.key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} />
                  : <input id={`create-${field.key}`} type={field.type ?? "text"} required={field.required} value={form[field.key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} />}
              </label>)}
              {createMessage && <div className="login-message" role="status">{createMessage}</div>}
              <button className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar rascunho"}</button>
            </form>
            <Dialog.Close className="dialog-close" aria-label="Fechar"><X size={17} /></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>}
      <Dialog.Root open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content record-dialog" aria-describedby="record-description">
            <Dialog.Title className="dialog-title">{selected?.title}</Dialog.Title>
            <Dialog.Description id="record-description" className="dialog-description">{selected?.meta}</Dialog.Description>
            {selected && <div className="record-detail-grid">
              <div><span>Status</span><strong>{selected.status}</strong></div>
              <div><span>Versão</span><strong>{selected.version ?? "—"}</strong></div>
              <div><span>Escopo</span><strong>{unitId ? "UBS selecionada" : "Organização"}</strong></div>
              <div><span>Sincronização</span><strong>{selected.id ? "Rastreável" : "Somente leitura"}</strong></div>
            </div>}
            {selected?.progress !== undefined && <div className="detail-progress"><div><span>Progresso</span><strong>{selected.progress}%</strong></div><div className="mini-progress"><span style={{ width: `${selected.progress}%` }} /></div></div>}
            {commandMessage && <div className="login-message" role="status">{commandMessage}</div>}
            <div className="dialog-actions">
              {module.slug === "reunioes" && selected && selected.tone !== "green" && <button className="primary-button" disabled={commandRunning || !selected.id} onClick={startMeeting}>{commandRunning ? "Iniciando..." : "Iniciar reunião"}</button>}
              <Dialog.Close className="secondary-button">Fechar</Dialog.Close>
            </div>
            <Dialog.Close className="dialog-close" aria-label="Fechar"><X size={17} /></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
