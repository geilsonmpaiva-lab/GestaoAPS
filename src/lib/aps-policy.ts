/** Presentation rollout only. Never grants access to business data. */
export function apsV3Enabled(input: { demo: boolean; environment?: string; vercelEnvironment?: string; organizationId: string; enabled?: boolean; override?: string }) {
  if (input.vercelEnvironment === 'production' || input.override === 'false') return false;
  if (input.demo) return input.override === 'true';
  return input.environment === 'staging' && input.vercelEnvironment === 'preview' &&
    input.organizationId === '362db1a9-bfdd-4334-9436-46b1c0117eab' && (input.enabled === true || input.override === 'true');
}

export const apsAreaLabels: Record<string, string> = {
  'esf.producao': 'Produção da equipe', 'formularios-esf': 'Registros da equipe', vigilancia: 'Vigilância',
  conhecimento: 'Biblioteca', protocolos: 'Protocolos', indicadores: 'Indicadores', melhoria: 'Planos e ações', reunioes: 'Reuniões', administracao: 'Administração',
};

export function mayOperate(permissions: { domain: string; operations: string[] }[], domain: string, operation: string) {
  return permissions.some(p => (p.domain === '*' || p.domain === domain) && (p.operations.includes('*') || p.operations.includes(operation)));
}
