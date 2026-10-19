# Reforma da experiência APS — 19/10/2026

Objetivo aprovado: registrar uma vez na equipe, acompanhar revisão na UBS e consolidar no município. Referência de interação: SimuLab local, sem identidade QuaLean. A reforma preserva identidades, registros, versões fechadas, auditoria, RLS e comandos transacionais.

## Decisões de produto

- Público inicial: profissional da equipe; gerência e referência técnica recebem filas próprias.
- Função + área + abrangência; cargo profissional não concede acesso. Dados nominais e exportação nominal dependem de concessão específica pela autoridade designada.
- Acúmulo de responsabilidades explícito; autoaprovação não passa a ser liberada pela reforma visual.
- Entrada canônica para novos acompanhamentos de hanseníase e tuberculose em Vigilância; mapas ESF anteriores permanecem identificados como arquivo/modelo de origem. Nenhuma equivalência incompleta é tratada como migração ou consolidação histórica concluída.
- Paleta SGC própria: fundo #F6F7F8, superfície branca, texto #1F2937 e ação #23704B. Sem assets, assinatura ou cores de marca QuaLean.

## Implementação e contrato

`ux_aps_v3` é um rollout de apresentação. Seu uso integrado exige Preview + ambiente staging + organização sintética explicitamente configurada. Produção e organização institucional não entram nessa interface. Override `SGC_UX_APS_V3=false` faz a reversão; demonstração local exige `SGC_UX_APS_V3=true`.

Nova navegação: Meu trabalho, Registros da equipe, Revisão e fechamento, Resultados, Qualidade e organização e Administração. As rotas antigas continuam disponíveis. Cada backend continua conferindo autorizações, independentemente de visibilidade no menu.

- `GET /api/v1/workspace/capabilities`: metadados de capacidades efetivas por área/equipe, conferidos com o JWT; não retorna registros nominais ou snapshots.
- `GET /api/v1/work-items`: entregas por competência/equipe/área, totais integrais da fonte mensal, filtro por situação/pesquisa e paginação de 25; não retorna nomes de pessoas acompanhadas.
- Listas de equipes visíveis não são interpretadas como permissão de produção. Totais de uma equipe jamais são atribuídos às demais.
- Visão municipal de Vigilância exige a concessão municipal na RPC existente, além do vínculo da organização. Um vínculo organizacional isolado não concede essa consolidação.
- Produção V3 separa novo lançamento, lista, mapa/fechamento e consolidação anual. Vigilância separa registros, consolidação e fechamento/relatórios, preservando filtros, versões e retry.
- Administração agrupa por identidade verificada, mostra vínculos existentes como Personalizado legado e apresenta prévia humana do convite. Não se deduz acesso nominal de um perfil.

A migration de preparação sintética cria uma RPC adicional; sua aplicação não altera flags ou registros. Invocada por administrador ativo da organização sintética, ela insere apenas flags ausentes para testes de produção e do rollout V3. Não substitui configurações explicitamente desabilitadas nem aprova catálogos institucionais.

## Sequência e aceite

Atualização da etapa 3: implementação longitudinal e evidências em [APS_LONGITUDINAL.md](APS_LONGITUDINAL.md). O diagnóstico de lacunas registrado abaixo permanece como histórico anterior à implementação. Offline integral e aceite observado/físico continuam pendentes.

1. Protótipo funcional: início, registrar, pendências e gestão de acesso, com demonstração declarada.
2. Jornada real sintética de produção → revisão → devolução/correção → fechamento → PDF/Excel.
3. Entrada canônica dos acompanhamentos e preservação dos arquivos anteriores; validar o mapa de equivalências antes de derivar documentos de campos ainda ausentes.
4. Consistência nas demais rotinas e rascunhos cifrados; a nova aparência não equivale a homologar uma fila offline inédita.
5. Preview, regressão multiusuário/multiUBS, sessão observada e validação física antes de promoção institucional.

O estado de execução e as evidências serão registrados após cada rodada. Testes sintéticos e emulação não substituem aceite observado, leitor de tela ou aparelhos físicos. Nenhuma publicação de produção está autorizada nesta entrega.

## Evidências — rodada de 19/10/2026

- Lint e TypeScript aprovados; 378 testes unitários aprovados, mais o novo cenário de paginação de 53 entregas aprovado em execução focal.
- Regressão V2: 96/96 jornadas em Chromium desktop/mobile e WebKit mobile. Reforma V3: 8/8 jornadas desktop/mobile.
- CI [39312463122](https://github.com/geilsonmpaiva-lab/GestaoAPS/actions/runs/39312463122): aplicação e banco aprovados, incluindo migrations em banco limpo e atualização a partir da 024, com pgTAP.
- Migrations aditivas aplicadas: `20261019194113_aps_access_lifecycle_v1` e `20261019194119_aps_synthetic_setup_v1`. Preparação invocada com JWT do administrador sintético: apenas três flags novas na organização sintética. Nenhum vínculo anterior foi encerrado.
- Comparação antes/depois: mesmas definições/grants das 298 funções anteriores; mesmos hashes de 4 vínculos, 5 perfis, 562 acompanhamentos epidemiológicos, 59 mapas ESF anteriores e 5 flags anteriores.
- Advisors de segurança sem novos achados. Permanecem avisos anteriores de funções definer expostas, extensão em public, proteção de senhas e MFA; tabelas ESF acessadas por RPC continuam com bloqueio direto por RLS. Esses avisos não foram resolvidos por esta reforma.
- Referências dos avisos anteriores: [funções definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [extensões em public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [proteção contra senhas comprometidas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [MFA](https://supabase.com/docs/guides/auth/auth-mfa). O advisor de desempenho também mantém 214 FKs sem índice e 6 alertas de initplan anteriores; nenhuma FK nova sem índice na tabela criada nesta entrega. Índices novos ainda sem uso são esperados enquanto não há comandos reais de encerramento de vínculos.
- Jornada integrada V3 de medicamentos aprovada: novo mapa sintético, item/conferência, falha antes da gravação, retry idempotente, salvamento, reload e PDF fiel. Cálculos conferidos: entradas 15, saídas 12, saldo 103 e demanda 13; autorização de 40 não contabilizada como entrada.
- Jornada integrada de produção aprovada: lançamento 17 → envio → devolução pelo gerente → correção para 19 → reenvio → fechamento. Leitor da UBS B bloqueado ao consultar equipe da UBS A; APIs de capacidades e tarefas sem vazamento do identificador da equipe A.
- Rascunho de Vigilância aprovado após reload: envelope cifrado no IndexedDB, sem nome/SINAN em texto aberto, PIN incorreto rejeitado, PIN correto recupera valores e zero; outra competência não recupera a cópia. Nenhum acompanhamento epidemiológico foi criado por esse teste. Não simula reinício completo do navegador nem perda de rede.
- Inspeção visual do Preview confirmou login, nova navegação, contexto da UBS e início autenticado. O endereço estável apresentou sessão anterior incompatível com a organização sintética; o endereço isolado do deploy permitiu o acesso sintético, sem remover cookies ou reduzir proteções.

### Repetição final

- Repetição final integrada: 3/3 jornadas aprovadas (1,4 minuto), incluindo células exatas da produção em PDF/Excel, mapa de medicamentos e rascunho cifrado. PDF de produção e medicamentos gerados como artefatos locais de teste.
- Correção adicional de sessão incompatível no Preview: navegação leva ao login sem loop, API continua 403, recuperação permanece disponível. Sem purge ou signout automático por essa correção.
- Correção P1 de revogação específica implementada: RPC adicional retorna somente SHA-256 das autorizações do próprio ator sintético; inclui concessões de Vigilância, vínculos/vigências, participação e estados de equipes/UBS. Baseline cifrado reservado e prazo são confirmados atomicamente. Alteração bloqueia o cofre; falha de consulta não renova nem apaga. Cofre legado com dados e sem baseline fica em quarentena, não recebe autorização nova silenciosamente. Migration `20261019200442_offline_authorization_fingerprint_v1` aplicada após [CI 39315701158](https://github.com/geilsonmpaiva-lab/GestaoAPS/actions/runs/39315701158) aprovar banco limpo, atualização e aplicação.
- Após essas correções: 405 testes unitários, lint, TypeScript e builds demo/integrado aprovados; 96 jornadas V2 e 8 V3 aprovadas. RPC verificada com JWT dos três perfis: retorna somente metadados do próprio ator e bloqueia a organização institucional. Advisors de segurança sem novos achados. Repetição integrada pós-RPC: 3/3 jornadas aprovadas (1,7 minuto). Os hashes dos registros anteriores e das 298 funções anteriores continuam iguais após a terceira migration.
- Estado: etapas 1–2 entregues tecnicamente em homologação; etapas 3–4 permanecem incompletas, com contratos e lacunas abaixo. A etapa 5 depende do aceite observado/físico. Não foi feito merge em main nem deploy de produção.

### Ordem preservada para a próxima entrega

A etapa 3 não está concluída. A auditoria identificou que os casos canônicos atuais são vinculados a uma competência; acrescentar campos visuais não resolve acompanhamento longitudinal. Também não há equivalência institucional aprovada para SINAN → número de notificação, contatos → contatos examinados e tipo informado → classificação operacional. Não serão inferidas essas equivalências, nem copiados históricos por mês. A extensão precisa de acompanhamentos históricos e projeção documental explícita antes de declarar entrada única completa. A etapa 4 depende desse contrato, além das validações offline abaixo.

Contrato recomendado para a etapa 3, antes de implementação:

- Núcleo atual preservado; complemento append-only ligado ao caso e à versão, escrito pela mesma transação de uma RPC adicional. Cliente antigo não pode apagar complemento ao substituir seu payload conhecido.
- Identidade do caso separada dos acompanhamentos por competência. Notificação original não é reescrita para simular acompanhamento mensal.
- Número de notificação confirmado, contatos examinados e classificação operacional são campos distintos dos valores ambíguos da origem; nenhum preenchimento automático entre eles.
- Hanseníase: município de residência, último comparecimento, contatos examinados, classificação operacional informada, grau/data de incapacidade e tipo/data de alta, além da identificação e data do acompanhamento.
- Tuberculose: baciloscopias 1–6, mudança de tratamento, contatos examinados, situações 9/12, encerramento/data, culturas, HIV, histopatologia e TDO. Sem converter mês de acompanhamento em mês do calendário, classificar resultados ou recomendar tratamento.
- Cabeçalhos explícitos e versionados: data, responsável pelo preenchimento, regional/município/técnico quando exigidos. Organização não será presumida município nem exportador presumido responsável técnico.
- PDF por projeção pura do snapshot autorizado para os SVGs existentes, sem criar cópia em mapas ESF. Campos sem célula vão para anexo; relatório nominal somente da equipe com concessão explícita, nunca do consolidado municipal.
- Fechamento congela núcleo, complemento e cabeçalhos da mesma revisão; reabertura não muda a impressão histórica.

Para a etapa 4, não cachear HTML/RSC autenticado. Preparar explicitamente snapshots cifrados sem nomes e cobertura por recorte, renderizados no shell público `/offline`. Concessões específicas de equipe/área/nominal precisam ser revalidadas antes de renovar autorização do cofre; falha ou revogação bloqueia a cópia, sem excluir pendências. Ampliação nominal/anexos aguarda esse contrato e suas provas de revogação, expiração, retomada de aba e reinício sem rede.

### Pendências de aceite

- Equivalência completa entre campos canônicos de Vigilância e documentos ESF; não unir históricos ou declarar relatórios equivalentes sem esse mapeamento.
- Fila e navegação autenticada offline completas dos novos acompanhamentos, incluindo anexos e recuperação após reinício sem rede. Rascunho cifrado isolado não comprova essa entrega.
- Política institucional de acúmulo/autoaprovação excepcional e concessão nominal pela autoridade designada; esta entrega não altera permissões antigas automaticamente.
- Aceite observado com profissionais, leitor de tela e instalação/persistência em aparelhos físicos.

Um erro técnico da consulta à Vercel expôs o token local no retorno da ferramenta. A consulta foi abandonada e a verificação continuou pelo navegador autenticado; é necessária a revogação/rotação desse token. Credenciais não foram adicionadas ao repositório.
