export type ModuleStatus = "active" | "pilot" | "gated";

export type ModuleRecord = {
  id?: string;
  version?: number;
  title: string;
  meta: string;
  status: string;
  tone: "green" | "amber" | "red" | "blue" | "gray";
  progress?: number;
  href?: string;
  resource?: string;
  rawStatus?: string;
  responsibleId?: string;
  responsibleName?: string;
  dueAt?: string;
};

export type ModuleDefinition = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: string;
  status: ModuleStatus;
  metrics: Array<{ label: string; value: string; note: string }>;
  records: ModuleRecord[];
  filters: string[];
  pageInfo?: { page: number; pageSize: number; total: number };
};

export const modules: Record<string, ModuleDefinition> = {
  conhecimento: {
    slug: "conhecimento", eyebrow: "Camada de conhecimento", title: "Biblioteca institucional",
    description: "Protocolos, boas práticas e lições aprendidas em um acervo versionado e pesquisável.", primaryAction: "Novo conteúdo", status: "active",
    metrics: [{ label: "Publicados", value: "38", note: "+4 neste mês" }, { label: "Em revisão", value: "6", note: "2 aguardam aprovação" }, { label: "A vencer", value: "3", note: "Nos próximos 30 dias" }],
    filters: ["Todos os tipos", "Domínio", "Vigência", "Responsável"],
    records: [
      { title: "Organização mensal da sala de vacina", meta: "Protocolo · Qualidade · v2.1", status: "Publicado", tone: "green" },
      { title: "Acolhimento de novos profissionais", meta: "Boa prática · Pessoas · v1.0", status: "Em revisão", tone: "amber" },
      { title: "Redução de divergências no inventário", meta: "Lição aprendida · Estoque", status: "Publicado", tone: "green" },
      { title: "Roteiro para reuniões de equipe", meta: "Modelo · Governança · v1.3", status: "Rascunho", tone: "gray" }
    ]
  },
  protocolos: {
    slug: "protocolos", eyebrow: "Execução ponta a ponta", title: "Protocolos gerenciais",
    description: "Transforme orientação em execução rastreável, com checklist, evidência e resultado.", primaryAction: "Criar protocolo", status: "active",
    metrics: [{ label: "Publicados", value: "25", note: "4 domínios" }, { label: "Execuções abertas", value: "9", note: "2 vencem hoje" }, { label: "Conformidade", value: "92%", note: "+6% no mês" }],
    filters: ["Todos os status", "Domínio", "Executor", "Vigência"],
    records: [
      { title: "Auditoria mensal da sala de vacina", meta: "QUA-001 · Versão 2.1 · Mensal", status: "Executar hoje", tone: "red", progress: 0 },
      { title: "Verificação de medicamentos próximos ao vencimento", meta: "EST-004 · Versão 1.4 · Semanal", status: "Em andamento", tone: "blue", progress: 65 },
      { title: "Conferência de escala profissional", meta: "PES-002 · Versão 1.2 · Mensal", status: "Concluído", tone: "green", progress: 100 },
      { title: "Inspeção de equipamentos essenciais", meta: "PAT-003 · Versão 1.0 · Trimestral", status: "Programado", tone: "gray" }
    ]
  },
  indicadores: {
    slug: "indicadores", eyebrow: "Desempenho", title: "Indicadores e metas",
    description: "Resultados, metas e tendências com fórmula, fonte e responsabilidade explícitas.", primaryAction: "Cadastrar indicador", status: "active",
    metrics: [{ label: "Dentro da meta", value: "12", note: "67% do catálogo" }, { label: "Fora da meta", value: "4", note: "2 com plano" }, { label: "Sem dado", value: "2", note: "Competência agosto" }],
    filters: ["Competência agosto", "Todos os status", "Domínio", "Responsável"],
    records: [
      { title: "Conformidade dos protocolos mensais", meta: "Percentual · Fonte: execuções", status: "92% / meta 95%", tone: "amber", progress: 92 },
      { title: "Ações concluídas no prazo", meta: "Percentual · Fonte: planos de ação", status: "65% / meta 85%", tone: "red", progress: 65 },
      { title: "Cobertura da escala assistencial", meta: "Percentual · Fonte: escalas", status: "Sem dado", tone: "gray" },
      { title: "Resolutividade de não conformidades", meta: "Percentual · Fonte: qualidade", status: "88% / meta 80%", tone: "green", progress: 88 }
    ]
  },
  melhoria: {
    slug: "melhoria", eyebrow: "Ciclo de melhoria", title: "Não conformidades e planos",
    description: "Trate desvios com responsáveis, prazos, evidências e verificação de eficácia.", primaryAction: "Abrir plano 5W2H", status: "active",
    metrics: [{ label: "NC abertas", value: "5", note: "1 crítica" }, { label: "Ações atrasadas", value: "7", note: "4 responsáveis" }, { label: "Eficácia pendente", value: "3", note: "Aguardam avaliação" }],
    filters: ["Todas as origens", "Status", "Responsável", "Prazo"],
    records: [
      { title: "Divergência entre saldo físico e sistema", meta: "NC-2026-031 · Estoque · Ana Lima", status: "Atrasado", tone: "red", progress: 40 },
      { title: "Evidência ausente na auditoria mensal", meta: "NC-2026-029 · Qualidade · Paulo Reis", status: "Em andamento", tone: "blue", progress: 70 },
      { title: "Cobertura incompleta do turno da tarde", meta: "NC-2026-027 · Pessoas · Júlia Melo", status: "Bloqueado", tone: "amber", progress: 25 },
      { title: "Atualização do mapa patrimonial", meta: "PA-2026-018 · Patrimônio", status: "Verificar eficácia", tone: "green", progress: 100 }
    ]
  },
  reunioes: {
    slug: "reunioes", eyebrow: "Decisão rastreável", title: "Reuniões e encaminhamentos",
    description: "Da pauta à ação: registre decisões e acompanhe cada encaminhamento.", primaryAction: "Agendar reunião", status: "pilot",
    metrics: [{ label: "Próximas", value: "3", note: "Nos próximos 7 dias" }, { label: "Encaminhamentos", value: "11", note: "4 vencem esta semana" }, { label: "Atas pendentes", value: "2", note: "Aguardam fechamento" }],
    filters: ["Próximas e passadas", "Tipo", "Responsável", "Status"],
    records: [
      { id: "00000000-0000-4000-8000-000000000301", version: 1, title: "Reunião mensal da equipe", meta: "Amanhã, 14h · Sala de reuniões", status: "Agendada · 3 pendências", tone: "amber" },
      { id: "00000000-0000-4000-8000-000000000302", version: 1, title: "Comitê local de qualidade", meta: "08 set, 10h · Videoconferência", status: "Agendada · pauta aberta", tone: "blue" },
      { id: "00000000-0000-4000-8000-000000000303", version: 2, title: "Alinhamento de escala", meta: "29 ago · 12 participantes", status: "Ata concluída", tone: "green" }
    ]
  },
  qualidade: {
    slug: "qualidade", eyebrow: "Onda 4", title: "Gestão da qualidade", description: "Auditorias configuráveis, evidências, resultados e eficácia.", primaryAction: "Novo modelo", status: "pilot",
    metrics: [{ label: "Auditorias abertas", value: "4", note: "1 crítica" }, { label: "Conformidade", value: "89%", note: "Meta 92%" }, { label: "NC reincidentes", value: "2", note: "Últimos 90 dias" }], filters: ["Tipo", "Período", "Auditor", "Status"],
    records: [{ title: "Organização e segurança da sala de vacina", meta: "Auditoria interna · Mensal", status: "Em execução", tone: "blue", progress: 58 }, { title: "Gestão documental", meta: "Auditoria interna · Trimestral", status: "Programada", tone: "gray" }, { title: "Condições de armazenamento", meta: "Auditoria externa · Semestral", status: "Concluída", tone: "green", progress: 100 }]
  },
  pessoas: {
    slug: "pessoas", eyebrow: "Onda 5", title: "Gestão de pessoas", description: "Força de trabalho, escalas, eventos e cobertura da unidade.", primaryAction: "Novo profissional", status: "gated",
    metrics: [{ label: "Profissionais", value: "42", note: "39 ativos" }, { label: "Turnos descobertos", value: "2", note: "Próximos 7 dias" }, { label: "Eventos no mês", value: "6", note: "Férias e afastamentos" }], filters: ["Categoria", "Vínculo", "Período", "Status"],
    records: [{ title: "Cobertura do turno de sexta-feira", meta: "Equipe Azul · 13h–19h", status: "Descoberto", tone: "red" }, { title: "Escala de setembro", meta: "42 profissionais · 168 turnos", status: "Publicada", tone: "green" }, { title: "Férias programadas", meta: "3 profissionais · Setembro", status: "Confirmado", tone: "blue" }]
  },
  patrimonio: {
    slug: "patrimonio", eyebrow: "Onda 5", title: "Patrimônio", description: "Inventário, localização, condição e movimentação dos bens da UBS.", primaryAction: "Novo inventário", status: "gated",
    metrics: [{ label: "Itens ativos", value: "318", note: "12 categorias" }, { label: "Em manutenção", value: "8", note: "2 essenciais" }, { label: "Divergências", value: "5", note: "Inventário atual" }], filters: ["Categoria", "Localização", "Condição", "Status"],
    records: [{ title: "Inventário anual 2026", meta: "241 de 318 itens conferidos", status: "76% concluído", tone: "blue", progress: 76 }, { title: "Autoclave — Sala de esterilização", meta: "PAT-00982 · Manutenção corretiva", status: "Indisponível", tone: "red" }, { title: "Computadores da recepção", meta: "6 itens · Última conferência 28 ago", status: "Conforme", tone: "green" }]
  },
  estoque: {
    slug: "estoque", eyebrow: "Onda 5", title: "Estoque gerencial", description: "Lotes, validade, movimentações e alertas sem depender de planilhas.", primaryAction: "Novo inventário", status: "gated",
    metrics: [{ label: "Itens abaixo do mínimo", value: "6", note: "2 críticos" }, { label: "Próximos do vencimento", value: "14", note: "Até 60 dias" }, { label: "Divergências", value: "3", note: "Inventário mensal" }], filters: ["Categoria", "Validade", "Saldo", "Status"],
    records: [{ title: "Luvas de procedimento M", meta: "Saldo 180 · Mínimo 300", status: "Abaixo do mínimo", tone: "red", progress: 60 }, { title: "Soro fisiológico 0,9%", meta: "Lote SF2408 · Validade 18 out", status: "Vence em 46 dias", tone: "amber" }, { title: "Inventário da farmácia", meta: "492 de 510 itens", status: "Em andamento", tone: "blue", progress: 96 }]
  },
  seguranca: {
    slug: "seguranca", eyebrow: "Acesso restrito · Onda 6", title: "Segurança do paciente", description: "Registro e tratamento gerencial de eventos sob governança reforçada.", primaryAction: "Registrar notificação", status: "gated",
    metrics: [{ label: "Eventos abertos", value: "—", note: "Módulo protegido" }, { label: "Análises pendentes", value: "—", note: "Módulo protegido" }, { label: "Planos ativos", value: "—", note: "Módulo protegido" }], filters: ["Período", "Classificação", "Responsável", "Status"],
    records: [{ title: "Liberação condicionada", meta: "Exige infraestrutura Pro, matriz de acesso e validação LGPD.", status: "Feature gate", tone: "amber" }]
  },
  ouvidoria: {
    slug: "ouvidoria", eyebrow: "Acesso restrito · Onda 6", title: "Ouvidoria interna", description: "Manifestações, tratamento, resposta e recorrência com acesso auditado.", primaryAction: "Nova manifestação", status: "gated",
    metrics: [{ label: "Manifestações", value: "—", note: "Módulo protegido" }, { label: "Prazos vencidos", value: "—", note: "Módulo protegido" }, { label: "Temas recorrentes", value: "—", note: "Módulo protegido" }], filters: ["Canal", "Tipo", "Prioridade", "Status"],
    records: [{ title: "Liberação condicionada", meta: "Exige regras de retenção, acesso e prazos institucionais.", status: "Feature gate", tone: "amber" }]
  },
  administracao: {
    slug: "administracao", eyebrow: "Fundação", title: "Administração", description: "Organizações, UBS, usuários, perfis, domínios, configurações e auditoria.", primaryAction: "Convidar usuário", status: "active",
    metrics: [{ label: "UBS", value: "6", note: "Todas ativas" }, { label: "Usuários", value: "128", note: "116 ativos" }, { label: "Eventos auditados", value: "1.248", note: "Últimos 30 dias" }], filters: ["UBS", "Perfil", "Domínio", "Status"],
    records: [{ title: "UBS Jardim Aurora", meta: "CNES 0000000 · 42 usuários", status: "Ativa", tone: "green" }, { title: "UBS Vila Esperança", meta: "CNES 0000001 · 31 usuários", status: "Ativa", tone: "green" }, { title: "Revisão da matriz de acesso", meta: "6 UBS · Atualizada em 28 ago", status: "Pendente", tone: "amber" }]
  }
};
