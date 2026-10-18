type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const resourceNames: Record<string, string> = {
  knowledge: 'Conhecimento', protocols: 'Protocolo', executions: 'Execução de protocolo',
  indicators: 'Indicador', nonconformities: 'Desvio', 'action-plans': 'Plano de ação',
  actions: 'Ação', meetings: 'Reunião', referrals: 'Encaminhamento',
  analyses: 'Análise crítica', effectiveness: 'Verificação de eficácia',
  bindings: 'Vínculo de indicador', targets: 'Meta institucional', comments: 'Comentário',
};

/** Calendar dates never pass through a timezone conversion. Instants use Brasília. */
export function displayDate(value: unknown, instant = false): string {
  if (!value) return '';
  const raw = String(value);
  if (!instant && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', ...(instant ? { timeStyle: 'short' as const } : {}),
  }).format(date) + (instant ? ' (Brasília)' : '');
}

export function recordTitle(row: Row, resource = ''): string {
  for (const key of ['title', 'name', 'what', 'description', 'code']) {
    if (text(row[key])) return text(row[key]);
  }
  const suffix = text(row.id) ? ` · ${text(row.id).slice(0, 8)}` : '';
  if (row.version_number != null) {
    const parent = text(row.reference_title);
    return `${parent || ({'knowledge-versions':'Conhecimento', 'protocol-versions':'Protocolo', formulas:'Fórmula'}[resource] ?? 'Documento')} · versão ${row.version_number}${parent ? '' : suffix}`;
  }
  if (row.competency) return `Medição de ${displayDate(row.competency)}`;
  if (resource === 'comments' && text(row.comment)) return text(row.comment);
  return `${resourceNames[resource] || 'Registro'}${suffix}`;
}

export const relationLabel: Record<string, string> = {
  'knowledge-versions': 'Versões do conhecimento', 'protocol-versions': 'Versões do protocolo',
  forms: 'Checklists', executions: 'Execuções', formulas: 'Fórmulas versionadas', targets: 'Metas',
  measurements: 'Medições', analyses: 'Análises críticas', nonconformities: 'Desvios',
  'action-plans': 'Planos de ação', actions: 'Ações', effectiveness: 'Verificações de eficácia',
  agenda: 'Pauta', participants: 'Presenças', referrals: 'Encaminhamentos', responses: 'Respostas registradas',
  bindings: 'Indicadores vinculados', comments: 'Comentários',
};
