export type ImportTemplate = {
  label: string;
  sheetName: string;
  columns: Array<{ key: string; label: string; required: boolean; example: string }>;
};

export const importTemplates: Record<string, ImportTemplate> = {
  "organizacoes-ubs": {
    label: "Organizações e UBS", sheetName: "UBS",
    columns: [
      { key: "organizacao", label: "Organização", required: true, example: "Secretaria Municipal de Saúde" },
      { key: "ubs", label: "UBS", required: true, example: "UBS Jardim Aurora" },
      { key: "cnes", label: "CNES", required: false, example: "0000000" },
      { key: "timezone", label: "Fuso horário", required: true, example: "America/Sao_Paulo" }
    ]
  },
  usuarios: {
    label: "Usuários e vínculos", sheetName: "Usuários",
    columns: [
      { key: "nome", label: "Nome", required: true, example: "Ana Lima" },
      { key: "email", label: "E-mail", required: true, example: "ana.lima@municipio.gov.br" },
      { key: "ubs", label: "UBS", required: true, example: "UBS Jardim Aurora" },
      { key: "perfil", label: "Perfil", required: true, example: "GERENTE_UBS" },
      { key: "dominios", label: "Domínios", required: true, example: "*" }
    ]
  },
  conhecimento: {
    label: "Conhecimento", sheetName: "Conteúdos",
    columns: [
      { key: "titulo", label: "Título", required: true, example: "Roteiro para reunião de equipe" },
      { key: "tipo", label: "Tipo", required: true, example: "TEMPLATE" },
      { key: "dominio", label: "Domínio", required: true, example: "GOVERNANCA" },
      { key: "tags", label: "Tags", required: false, example: "reunioes;planejamento" },
      { key: "nivel_acesso", label: "Nível de acesso", required: true, example: "INTERNAL" }
    ]
  },
  protocolos: {
    label: "Protocolos", sheetName: "Protocolos",
    columns: [
      { key: "codigo", label: "Código", required: true, example: "QUA-001" },
      { key: "titulo", label: "Título", required: true, example: "Auditoria mensal da organização da UBS" },
      { key: "dominio", label: "Domínio", required: true, example: "QUALIDADE" },
      { key: "frequencia", label: "Frequência", required: false, example: "MENSAL" },
      { key: "responsavel_email", label: "Responsável técnico", required: true, example: "responsavel@municipio.gov.br" }
    ]
  },
  indicadores: {
    label: "Indicadores e metas", sheetName: "Indicadores",
    columns: [
      { key: "codigo", label: "Código", required: true, example: "IND-001" },
      { key: "nome", label: "Nome", required: true, example: "Conformidade dos protocolos mensais" },
      { key: "definicao", label: "Definição", required: true, example: "Preencher com definição institucional validada" },
      { key: "unidade", label: "Unidade", required: true, example: "PERCENTUAL" },
      { key: "periodicidade", label: "Periodicidade", required: true, example: "MENSAL" },
      { key: "fonte", label: "Fonte", required: true, example: "EXECUCOES" },
      { key: "dominio", label: "Domínio", required: true, example: "QUALIDADE" },
      { key: "melhor_direcao", label: "Melhor direção", required: true, example: "HIGHER" },
      { key: "regra_meta", label: "Regra da meta", required: false, example: "Preencher somente após validação institucional" }
    ]
  }
};
