import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  if (!line || line.trimStart().startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator > 0 && !process.env[line.slice(0, separator).trim()]) {
    process.env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase não configurado em .env.local.");
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const ids = {
  meetingsFlag: "00000000-0000-4000-8000-000000000901",
  knowledge: "10000000-0000-4000-8000-000000000001",
  knowledgeVersion: "10000000-0000-4000-8000-000000000002",
  protocol: "20000000-0000-4000-8000-000000000001",
  protocolVersion: "20000000-0000-4000-8000-000000000002",
  form: "20000000-0000-4000-8000-000000000003",
  execution: "30000000-0000-4000-8000-000000000001",
  response: "30000000-0000-4000-8000-000000000002",
  attachment: "40000000-0000-4000-8000-000000000001",
  evidenceLink: "40000000-0000-4000-8000-000000000002",
  indicator: "50000000-0000-4000-8000-000000000001",
  formula: "50000000-0000-4000-8000-000000000002",
  binding: "50000000-0000-4000-8000-000000000003",
  target: "50000000-0000-4000-8000-000000000004",
  measurement: "50000000-0000-4000-8000-000000000005",
  analysis: "50000000-0000-4000-8000-000000000006",
  nonconformity: "60000000-0000-4000-8000-000000000001",
  plan: "60000000-0000-4000-8000-000000000002",
  action: "60000000-0000-4000-8000-000000000003",
  effectiveness: "60000000-0000-4000-8000-000000000004",
  meeting: "70000000-0000-4000-8000-000000000001",
  agenda: "70000000-0000-4000-8000-000000000002",
  participant: "70000000-0000-4000-8000-000000000003",
  referral: "70000000-0000-4000-8000-000000000004",
};

async function one(table, configure) {
  const { data, error } = await configure(client.from(table).select("*").limit(1)).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Registro-base ausente em ${table}.`);
  return data;
}

async function ensure(table, row) {
  const { data: existing, error: lookupError } = await client.from(table).select("id").eq("id", row.id).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return false;
  const { error } = await client.from(table).insert(row);
  if (error) throw new Error(`${table}: ${error.message}`);
  return true;
}

const organization = await one("organizations", (query) => query.eq("name", "Secretaria Municipal de Acaraú"));
const unit = await one("units", (query) => query.eq("organization_id", organization.id).eq("cnes", "3657973"));
const profile = await one("profiles", (query) => query.eq("email", "geilsonmpaiva@gmail.com"));
const scope = { organization_id: organization.id, unit_id: unit.id };
const authored = { created_by: profile.id };
const maintained = { ...authored, updated_by: profile.id };
const label = "[HOMOLOGAÇÃO SINTÉTICA]";
const now = new Date();
const year = now.getUTCFullYear();
const competency = `${year}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

const rows = [
  ["feature_flags", { id: ids.meetingsFlag, ...scope, key: "reunioes", enabled: true, reason: `${label} Módulo necessário para o ciclo MVP das ondas 0–3.`, updated_by: profile.id }],
  ["knowledge_items", { id: ids.knowledge, ...scope, type: "GOOD_PRACTICE", title: `${label} Abertura administrativa da UBS`, domain: "gestao", tags: ["homologacao", "sintetico", "mvp"], access_level: "INTERNAL", status: "PUBLISHED", responsible_id: profile.id, ...maintained }],
  ["knowledge_versions", { id: ids.knowledgeVersion, ...scope, knowledge_item_id: ids.knowledge, version_number: 1, content: { aviso: "Conteúdo exclusivamente sintético, sem validade normativa ou clínica.", objetivo: "Validar rastreabilidade do ciclo MVP.", passos: ["Verificar item A", "Registrar evidência", "Concluir checklist"] }, references_list: [{ tipo: "synthetic", descricao: "Sem referência institucional" }], valid_from: `${year}-01-01`, status: "PUBLISHED", approved_by: profile.id, approved_at: now.toISOString(), published_at: now.toISOString(), ...authored }],
  ["protocols", { id: ids.protocol, ...scope, code: "HML-MVP-001", title: `${label} Checklist de abertura`, domain: "gestao", status: "PUBLICADO", responsible_id: profile.id, ...maintained }],
  ["protocol_versions", { id: ids.protocolVersion, ...scope, protocol_id: ids.protocol, version_number: 1, content: { aviso: "Protocolo sintético para homologação; não usar como orientação institucional.", knowledgeItemId: ids.knowledge, etapas: [{ ordem: 1, titulo: "Conferência sintética" }] }, valid_from: `${year}-01-01`, status: "PUBLICADO", approved_by: profile.id, approved_at: now.toISOString(), published_at: now.toISOString(), ...authored }],
  ["form_versions", { id: ids.form, ...scope, protocol_version_id: ids.protocolVersion, name: `${label} Checklist`, version_number: 1, schema: { fields: [{ key: "itens_conformes", type: "number", required: true }, { key: "itens_avaliados", type: "number", required: true }] }, evidence_rules: [{ field: "itens_conformes", required: true }], scoring_rule: { type: "percentage" }, status: "PUBLISHED", ...authored }],
  ["indicators", { id: ids.indicator, ...scope, code: "HML-MVP-PCT", name: `${label} Percentual de conformidade`, objective: "Validar cálculo e tratamento de desvio", definition: "Razão sintética entre itens conformes e avaliados.", unit: "%", periodicity: "MENSAL", source: "EXECUCAO_SINTETICA", domain: "gestao", responsible_id: profile.id, better_direction: "HIGHER", validation_rules: { synthetic: true }, status: "ACTIVE", ...maintained }],
  ["indicator_formula_versions", { id: ids.formula, ...scope, indicator_id: ids.indicator, version_number: 1, variables: [{ name: "conformes" }, { name: "avaliados" }], expression_ast: { type: "binary", operator: "*", left: { type: "binary", operator: "/", left: { type: "variable", name: "conformes" }, right: { type: "variable", name: "avaliados" } }, right: { type: "literal", value: 100 } }, valid_from: `${year}-01-01`, ...authored }],
  ["protocol_indicator_bindings", { id: ids.binding, ...scope, protocol_version_id: ids.protocolVersion, indicator_id: ids.indicator, formula_version_id: ids.formula, status: "ACTIVE", ...authored }],
  ["targets", { id: ids.target, ...scope, indicator_id: ids.indicator, starts_on: `${year}-01-01`, ends_on: `${year}-12-31`, comparison: "GTE", target_value: 90, attention_rule: { value: 80 }, ...maintained }],
  ["executions", { id: ids.execution, ...scope, protocol_version_id: ids.protocolVersion, executor_id: profile.id, status: "COMPLETED", started_at: new Date(now.getTime() - 3600000).toISOString(), completed_at: now.toISOString(), accepted_at: now.toISOString(), result: { itensConformes: 7, itensAvaliados: 10 }, compliance: "70%", notes: `${label} execução encerrada para comprovação do MVP`, ...maintained }],
  ["execution_responses", { id: ids.response, ...scope, execution_id: ids.execution, field_key: "itens_conformes", value: 7, compliant: false, observation: `${label} desvio intencional`, ...maintained }],
  ["measurements", { id: ids.measurement, ...scope, indicator_id: ids.indicator, formula_version_id: ids.formula, competency, value: 70, status: "FORA_META", origin_type: "EXECUTION", origin_id: ids.execution, calculation_inputs: { conformes: 7, avaliados: 10 }, ...maintained }],
  ["nonconformities", { id: ids.nonconformity, ...scope, code: "NC-HML-MVP-001", origin_type: "MEASUREMENT", origin_id: ids.measurement, classification: "MAJOR", description: `${label} Desvio intencional: resultado 70% para meta sintética de 90%.`, responsible_id: profile.id, due_at: new Date(now.getTime() + 7 * 86400000).toISOString(), status: "CLOSED", ...maintained }],
  ["action_plans", { id: ids.plan, ...scope, origin_type: "NONCONFORMITY", origin_id: ids.nonconformity, title: `${label} Tratar desvio do indicador`, responsible_id: profile.id, due_at: new Date(now.getTime() + 7 * 86400000).toISOString(), status: "CONCLUIDO", ...maintained }],
  ["actions", { id: ids.action, ...scope, action_plan_id: ids.plan, what: "Revisar o checklist sintético", why: "Demonstrar o tratamento rastreável do desvio", where_text: "UBS Paulo VI — ambiente de homologação", when_at: now.toISOString(), who_id: profile.id, how: "Revisão simulada e registro de evidência sintética", how_much: 0, status: "CONCLUIDO", percentage: 100, completed_at: now.toISOString(), ...maintained }],
  ["critical_analyses", { id: ids.analysis, ...scope, measurement_id: ids.measurement, analysis: `${label} Resultado propositalmente abaixo da meta para validar o fluxo.`, cause: "Dados sintéticos definidos para provocar desvio.", decision: "Executar e verificar plano sintético.", action_plan_id: ids.plan, ...maintained }],
  ["meetings", { id: ids.meeting, ...scope, title: `${label} Reunião de análise do MVP`, starts_at: new Date(now.getTime() - 7200000).toISOString(), ends_at: now.toISOString(), location: "Ambiente virtual de homologação", organizer_id: profile.id, status: "COMPLETED", minutes: `${label} O ciclo foi analisado e o encaminhamento sintético foi registrado.`, ...maintained }],
  ["meeting_agenda_items", { id: ids.agenda, ...scope, meeting_id: ids.meeting, position: 1, title: "Análise do desvio sintético", description: "Avaliar encadeamento do MVP.", decision: "Manter evidências e validar rastreabilidade.", ...maintained }],
  ["meeting_participants", { id: ids.participant, ...scope, meeting_id: ids.meeting, user_id: profile.id, attended: true }],
  ["referrals", { id: ids.referral, ...scope, meeting_id: ids.meeting, agenda_item_id: ids.agenda, description: `${label} Conferir rastreabilidade no dashboard`, responsible_id: profile.id, due_at: now.toISOString(), priority: "NORMAL", status: "COMPLETED", completed_at: now.toISOString(), ...maintained }],
];

const created = [];
for (const [table, row] of rows) if (await ensure(table, row)) created.push(table);

const evidence = Buffer.from("tipo;descricao\nhomologacao;Evidencia exclusivamente sintetica do ciclo MVP sem dados reais\n", "utf8");
const objectPath = `${organization.id}/${unit.id}/INTERNAL/${ids.attachment}-homologacao.csv`;
const { error: uploadError } = await client.storage.from("evidence").upload(objectPath, evidence, { contentType: "text/csv", upsert: false });
if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) throw uploadError;
const digest = createHash("sha256").update(evidence).digest("hex");
if (await ensure("attachments", { id: ids.attachment, ...scope, bucket: "evidence", object_path: objectPath, file_name: "evidencia-homologacao-mvp.csv", content_type: "text/csv", byte_size: evidence.length, sha256: digest, classification: "INTERNAL", description: `${label} Evidência sem dados reais`, status: "AVAILABLE", ...maintained })) created.push("attachments");
if (await ensure("evidence_links", { id: ids.evidenceLink, ...scope, attachment_id: ids.attachment, entity_type: "executions", entity_id: ids.execution, evidence_kind: "HOMOLOGACAO_SINTETICA", ...authored })) created.push("evidence_links");
if (await ensure("effectiveness_checks", { id: ids.effectiveness, ...scope, action_plan_id: ids.plan, effective: true, evaluated_at: now.toISOString(), evaluator_id: profile.id, evidence_attachment_id: ids.attachment, requires_new_action: false, notes: `${label} Eficácia confirmada apenas para validação técnica.`, ...authored })) created.push("effectiveness_checks");

const checks = {};
for (const [name, table, id] of [
  ["flagReunioes", "feature_flags", ids.meetingsFlag],
  ["conhecimento", "knowledge_versions", ids.knowledgeVersion], ["protocolo", "protocol_versions", ids.protocolVersion],
  ["execucao", "executions", ids.execution], ["evidencia", "attachments", ids.attachment],
  ["indicador", "indicators", ids.indicator], ["meta", "targets", ids.target],
  ["medicao", "measurements", ids.measurement], ["naoConformidade", "nonconformities", ids.nonconformity],
  ["plano", "action_plans", ids.plan], ["acao", "actions", ids.action],
  ["eficacia", "effectiveness_checks", ids.effectiveness], ["reuniao", "meetings", ids.meeting],
]) {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("id", id);
  if (error) throw error;
  checks[name] = count === 1;
}
if (Object.values(checks).some((value) => !value)) throw new Error("O ciclo sintético ficou incompleto.");

console.log(JSON.stringify({ ok: true, label, created: [...new Set(created)], checks }, null, 2));
