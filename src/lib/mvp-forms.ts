export type MvpField = { key: string; label: string; type?: 'text' | 'datetime-local' | 'textarea'; options?: string[]; required?: boolean; minLength?: number; maxLength?: number; initial?: string; hint?: string };
export const mvpForms: Record<string, { module: string; title: string; fields: MvpField[] }> = {
  knowledge: { module: 'conhecimento', title: 'Novo conteúdo', fields: [
    { key: 'title', label: 'Título', required: true, minLength: 3, maxLength: 240 },
    { key: 'type', label: 'Tipo de conteúdo', options: ['TEMPLATE','GOOD_PRACTICE','LESSON_LEARNED','MANUAL','POLICY','FAQ','PROCEDURE','PROTOCOL','STANDARD','FLOW','TECHNICAL_REFERENCE','EXTERNAL_DOCUMENT'], initial: 'TEMPLATE' },
    { key: 'domain', label: 'Domínio institucional', required: true, minLength: 2, maxLength: 80, hint: 'Use a classificação aprovada pela organização.' },
    { key: 'accessLevel', label: 'Visibilidade', options: ['INTERNAL','PUBLIC_INSTITUTIONAL'], initial: 'INTERNAL' }
  ] },
  protocols: { module: 'protocolos', title: 'Criar protocolo', fields: [
    { key: 'code', label: 'Código', required: true, minLength: 2, maxLength: 40 }, { key: 'title', label: 'Título', required: true, minLength: 3, maxLength: 240 }, { key: 'domain', label: 'Domínio institucional', required: true, minLength: 2, maxLength: 80 }
  ] },
  indicators: { module: 'indicadores', title: 'Cadastrar indicador', fields: [
    { key: 'code', label: 'Código', required: true, minLength: 2, maxLength: 40 }, { key: 'name', label: 'Nome', required: true, minLength: 3, maxLength: 240 }, { key: 'definition', label: 'Definição institucional', type: 'textarea', required: true, minLength: 3, maxLength: 2000 }, { key: 'unit', label: 'Unidade de medida', required: true, maxLength: 40, hint: 'Por exemplo: percentual, quantidade ou dias.' }, { key: 'periodicity', label: 'Periodicidade', required: true, minLength: 2, maxLength: 40 }, { key: 'source', label: 'Fonte dos dados', required: true, minLength: 2, maxLength: 120 }, { key: 'domain', label: 'Domínio institucional', required: true, minLength: 2, maxLength: 80 }, { key: 'betterDirection', label: 'Interpretação do resultado', options: ['HIGHER','LOWER','RANGE','EQUAL'], initial: 'HIGHER' }
  ] },
  meetings: { module: 'reunioes', title: 'Agendar reunião', fields: [{ key: 'title', label: 'Título', required: true, minLength: 3, maxLength: 240 }, { key: 'startsAt', label: 'Data e horário de início', type: 'datetime-local', required: true }, { key: 'location', label: 'Local ou sala virtual', maxLength: 240 }] },
  'action-plans': { module: 'melhoria', title: 'Abrir plano de ação', fields: [{ key: 'title', label: 'Título do plano', required: true, minLength: 3, maxLength: 240 }, { key: 'dueAt', label: 'Prazo', type: 'datetime-local' }] }
};
