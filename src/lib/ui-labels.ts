const labels: Record<string, string> = {
  DRAFT: 'Rascunho', RASCUNHO: 'Rascunho', IN_REVIEW: 'Em revisão', EM_REVISAO: 'Em revisão', APPROVED: 'Aprovado', APROVADO: 'Aprovado', PUBLISHED: 'Publicado', PUBLICADO: 'Publicado', OBSOLETE: 'Obsoleto', SUSPENDED: 'Suspenso', ACTIVE: 'Ativo', INTERNAL: 'Interno', PUBLIC_INSTITUTIONAL: 'Institucional público', RESTRICTED: 'Restrito', TEMPLATE: 'Modelo', GOOD_PRACTICE: 'Boa prática', LESSON_LEARNED: 'Lição aprendida', MANUAL: 'Manual', POLICY: 'Política', FAQ: 'Perguntas frequentes', PROCEDURE: 'Procedimento', PROTOCOL: 'Protocolo', STANDARD: 'Norma', FLOW: 'Fluxo', TECHNICAL_REFERENCE: 'Referência técnica', EXTERNAL_DOCUMENT: 'Documento externo', HIGHER: 'Quanto maior, melhor', LOWER: 'Quanto menor, melhor', RANGE: 'Dentro de uma faixa', EQUAL: 'Igual ao valor de referência', OPEN: 'Aberta', CLOSED: 'Encerrada', COMPLETED: 'Concluída', IN_PROGRESS: 'Em andamento', SCHEDULED: 'Agendada', PENDING_SYNC: 'Aguardando envio', AVAILABLE: 'Disponível', PENDING: 'Pendente', MAJOR: 'Maior', MINOR: 'Menor', CRITICAL: 'Crítica', NORMAL: 'Normal', HIGH: 'Alta', LOW: 'Baixa', SEM_DADO: 'Sem dados', DENTRO_META: 'Dentro da meta', FORA_META: 'Fora da meta', ATENCAO: 'Atenção', NAO_INICIADO: 'Não iniciada', EM_ANDAMENTO: 'Em andamento', BLOQUEADO: 'Bloqueada', CONCLUIDO: 'Concluída', CANCELADO: 'Cancelada', CANCELLED: 'Cancelada', CANCELLED_BY_USER: 'Cancelada', FAILED: 'Falhou'
};
export function uiLabel(value: string) { return labels[value] ?? value.replaceAll('_', ' ').toLocaleLowerCase('pt-BR'); }
export function safeReturnTo(value: string | null | undefined, fallback = '/') {
  if (!value || value.length > 16384 || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  try {
    let url = new URL(value, 'https://sgc.invalid');
    for (let depth = 0; depth < 8; depth++) {
      if (url.origin !== 'https://sgc.invalid') return fallback;
      // Detail relationships have explicit parent links. Back goes to the original
      // filtered list instead of growing an encoded browser-history stack.
      const nested = url.pathname.startsWith('/registros/') && url.searchParams.get('returnTo');
      if (!nested) { url.searchParams.delete('returnTo'); return url.pathname + url.search; }
      if (!nested.startsWith('/') || nested.startsWith('//') || /[\\\r\n]/.test(nested)) return fallback;
      url = new URL(nested, 'https://sgc.invalid');
    }
    return fallback;
  } catch { return fallback; }
}

export function recordHref(resource: string, id: string, returnTo: string) {
  return `/registros/${encodeURIComponent(resource)}/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}
