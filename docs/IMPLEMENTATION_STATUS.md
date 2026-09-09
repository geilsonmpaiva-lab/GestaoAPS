# Estado da implantação

## Entregue neste marco

- Aplicação Next.js mobile-first, PWA instalável, shell responsivo e telas de todos os domínios.
- Autenticação Supabase sem cadastro público, renovação de sessão, recuperação de senha e logout global.
- Modelo PostgreSQL de todas as ondas, com RLS, grants mínimos, escopo por organização/UBS, soft delete, versão otimista, auditoria append-only, outbox, anexos privados e feature flags.
- API `/api/v1` para consultas, publicação de protocolo, bootstrap/deltas/lotes/conflitos de sincronização, registro de dispositivo e importação XLSX em duas fases.
- Listagens e dashboard conectados ao Supabase, formulários acessíveis para os cadastros centrais e comandos transacionais para aprovação/publicação, conclusão de execução, tratamento de desvio e encerramento de reunião.
- Ponte governada Protocolo → Execução → Fórmula → Medição → Meta, com AST validada também no banco, versão de fórmula preservada e classificação transacional do desvio.
- Ciclo de melhoria contínua com política por indicador/UBS, abertura automática e deduplicada de NC/plano, ações 5W2H, conclusão com evidência e verificação de eficácia auditável.
- Jornada de reuniões com pauta, presença validada por vínculo, encaminhamentos e conversão transacional da decisão em plano/ação 5W2H.
- Onda 4 com modelos de auditoria versionados e imutáveis após publicação, execução controlada, evidências por critério e geração automática de NC/plano para resultados não conformes.
- Fundação da Onda 5 com escalas sem sobreposição, movimentações patrimoniais append-only e saldo de estoque por lote alterado somente por comando transacional, sem permitir saldo negativo.
- Onda 6 protegida por feature flags também no PostgreSQL, com auditoria append-only de cada consulta, análise de segurança do paciente e resposta de ouvidoria como comandos versionados.
- Consolidação com exportações CSV/XLSX autorizadas e protegidas contra fórmulas, teste k6 para 50 concorrentes, teste de teclado/foco e preparação segura do ensaio mensal de restauração.
- Drill-down acessível nas listas, com estado, versão, escopo, progresso e transição contextual para início de reunião em desktop e dispositivos móveis.
- Ciclos governados de versões para Conhecimento e Protocolos, início de execução preservando a versão publicada e evidências privadas em duas fases com validação real de hash/tamanho e download temporário auditado.
- Análise crítica vinculada à medição e ao plano, ações com progresso/bloqueio/comentários e justificativa obrigatória para prazo ou responsável, além de leitura de notificações sem resolução indevida de alertas críticos.
- Busca e filtros executados no backend, conhecimento contextual publicado e links de drill-down que reutilizam os mesmos recortes das contagens do dashboard.
- Auditorias bloqueadas quando faltar critério ou evidência obrigatória; inventários patrimonial e de estoque com contagem, divergência e ajuste explícito; requisitos e cálculo de cobertura de pessoas.
- Convites administrativos com escopo e perfil validados, definição de nova senha no fluxo de recuperação e promoção de módulos por feature flags governadas.
- Cofre IndexedDB cifrado, limite offline de 72 horas, fila idempotente, registro e revogação de dispositivo, limpeza no logout e visibilidade de pendências/armazenamento.
- Motor de fórmulas por AST sem `eval`, dashboard por exceção, documentação operacional, backup cifrado, CI, testes unitários, Playwright e pgTAP.

## Antes da homologação integrada

- Supabase provisionado em São Paulo (`sa-east-1`), com 21 migrations aplicadas, 89 testes pgTAP aprovados e job operacional de alertas agendado a cada 15 minutos em 9 de setembro de 2026. O ambiente local usa `.env.local` ignorado pelo Git.
- Provisionar a Vercel em `gru1` e cadastrar os segredos de ambiente no host.
- Configurar SMTP de convites, destino externo de backup, alertas de falha e exercício de restauração.
- Executar a homologação institucional dos templates, taxonomias, metas, retenção e matriz de acesso; o produto não inventa esses conteúdos.

## Antes do piloto e das ondas sensíveis

- Homologar a matriz institucional de acesso e o ciclo completo com dados sintéticos.
- Realizar testes de carga, acessibilidade manual, instalação PWA e recuperação de desastre nos dispositivos-alvo.
- Somente liberar dados reais/sensíveis depois dos gates contratuais, LGPD, retenção, resposta a incidentes e infraestrutura paga descritos no plano.
