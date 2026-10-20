# Prontidão institucional do piloto SGC-UBS

Este documento controla os gates que não podem ser aprovados apenas pela equipe técnica. Até a assinatura dos responsáveis, usar somente dados sintéticos ou dados reais formalmente classificados como não sensíveis, minimizados e autorizados.

## Homologação final do MVP em 19 de outubro de 2026

Escopo da etapa 5: homologação técnica sintética, roteiro físico e aceite observado. Não autoriza publicação de produção, alteração de concessões institucionais nem entrada de dados sensíveis reais. O quadro de setembro abaixo é histórico, não uma reconfirmação atual de SMTP, contratos, DNS ou backup.

Versão de referência: `5b6fe7c`, Preview `gestaoaps-ilfzaw9uk-qua-lean-saude.vercel.app`. Endereço estável para a sessão de teste: [homologação SGC UBS](https://gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app/). Registrar o commit efetivamente publicado antes de cada rodada; não usar o domínio institucional de produção. O Supabase é compartilhado, mas os registros de teste devem pertencer exclusivamente a `[HOMOLOGAÇÃO] Município Sintético`.

As contas sintéticas existentes representam administrador, gerente da UBS A e leitor da UBS B. Seus perfis não equivalem à matriz institucional aprovada: concessões por área, equipe e acesso nominal continuam sendo verificadas separadamente. Credenciais e PINs não devem ser anotados neste documento, nos vídeos ou no relatório de defeitos.

### Critérios de decisão

- Homologação técnica: ciclo completo, autorização negativa, persistência, cálculos, relatórios e tratamento de falhas com evidências reproduzíveis.
- Homologação física: executar a seção 6 nos quatro pares de aparelho/navegador, sem tratar emulação como aparelho real.
- Aceite observado: gerente e referência técnica realizam as tarefas sem instrução passo a passo; dificuldades e bloqueios são registrados.
- Liberação institucional: decisão formal separada, condicionada a infraestrutura, backup/restauração, acessos, conteúdo, proteção de dados e contratação. Aprovação técnica não remove esses bloqueios.

Situação da etapa 5: **validação funcional sintética concluída no escopo abaixo; aceite físico/observado pendente; não aprovada para produção**. Campos físicos e assinaturas permanecem em branco até execução real.

### Evidências técnicas da rodada

As jornadas automatizadas usam a aplicação compilada localmente em modo staging, com o Supabase hospedado e contas sintéticas independentes. Isto não equivale a executar a suíte inteira no Preview protegido por SSO. No Preview estável, a inspeção adicional confirmou o aviso sintético, a nova interface e o bloqueio de um link direto de caso A enquanto a UBS B estava selecionada. O contexto foi restaurado para A.

| Verificação | Resultado da rodada | Evidência local |
|---|---|---|
| Build integrado, lint e TypeScript | Aprovados | Comandos de validação da rodada; sem alteração de código da aplicação |
| Testes unitários | 433 aprovados em 60 arquivos | `npm test` |
| PostgreSQL/RLS | 530 asserções aprovadas em 17 arquivos | Banco isolado `sgc_longitudinal_test_final`, sem reset do banco anterior |
| Ciclo gerencial pela interface | Aprovado com administrador, gerente A e leitor B | `tests/integration/cycle.spec.ts`; IDs novos anexados ao relatório Playwright |
| Produção ESF e medicamentos | Três jornadas APS V3 aprovadas | `test-results/aps-staging/` e `playwright-report/aps-staging/` |
| Acompanhamento longitudinal | Duas jornadas aprovadas, duas competências e três perfis | `test-results/longitudinal/` e `playwright-report/longitudinal/` |
| Offline longitudinal | Aprovado: reinício real de processo sem rede, rascunho/anexo, resposta perdida, conflito/RETRY, envio e expiração simulada | `test-results/longitudinal-offline/` |
| Demais formulários/transições offline | Oito jornadas aprovadas; um caso de revogação condicionado ao operador não executado | `test-results/staging/`, `test-results/stage5-forms/` e `playwright-report/stage5-general/` |
| Aparelhos, leitores de tela e sessão observada | Não executados | Matriz e casos F01–F14 abaixo |

O ciclo gerencial confirmou conhecimento publicado → protocolo/checklist publicado → execução pelo gerente → evidência privada → medição 70 comparada com meta sintética 90 → análise/desvio → plano 5W2H → acompanhamento/eficácia → reunião, ata e encaminhamento convertido em ação. Reenvio idempotente, consultas/exportações proibidas ao leitor B, isolamento do gerente A diante de registro B e coerência do total filtrado foram verificados.

Qualificação dos testes: os seletores de login e status foram adaptados à V3; a produção anual passou a ser comparada com todos os meses do Excel, sem presumir que o ano esteja vazio. O teste de impressão longitudinal esperava apenas nós presentes no DOM, que ainda podiam estar ocultos durante o carregamento RSC; agora espera o relatório visível. Os quatro PDFs finais foram extraídos/renderizados e as nove páginas inspecionadas: produção 2, medicamentos 3, hanseníase 2 e tuberculose 2. Evidências em `test-results/stage5-pdf-qa/final/`. Isso não substitui impressão física nem abertura dos XLSX no Excel instalado.

Preservação delimitada: os 562 registros epidemiológicos anteriores mantiveram hash `c63bc58e0b3bdfdf8b3b5ab135cc70f4`; quatro casos anteriores mantiveram `9f742af0b67fca2dc92c13652d99a138`; sete acompanhamentos anteriores mantiveram `dcf5bf482a157caf0ebba134c2eb4513`. Nenhuma migration, concessão institucional ou deploy foi feito nesta rodada. `main` permanece `319d651f30012d1db74d0b66bb480115818739b8`; Preview de referência permanece `5b6fe7c`. Alterações locais limitadas aos testes e a este roteiro.

Consolidação: 15 jornadas distintas aprovadas, contando a repetição focal; um caso condicionado ao operador não executado. A rodada geral terminou inicialmente com oito aprovadas, uma falha de espera e uma não executada. O relatório original foi preservado em `playwright-report/stage5-general/`. Após ajustar a espera da jornada de sincronização, o cenário dos 14 formulários passou integralmente em 5,6 minutos: `test-results/staging/form-operations.json` registra 14 operações; `critical-operations.json` registra 12 transições críticas, com repetição idempotente. As falhas intermediárias de seletor e impressão foram corrigidas nos testes, não omitidas nem atribuídas a aprovação do produto.

Pontos de atenção para o aceite: medir a duração da sincronização com fila extensa e pactuar limite aceitável. Na repetição, as confirmações dos formulários levaram 11–23 segundos; a espera original de 20 segundos do teste não comportou uma rodada, embora as pendências continuassem preservadas. A repetição mantém os timeouts de rede da aplicação e verifica confirmação/duplicação, com até 90 segundos para a jornada de sincronização. Há fundo claro residual nos anexos de produção/medicamentos a avaliar em impressão física, sem sobreposição ou perda de conteúdo na amostra. Teste de carga de 50 usuários concorrentes não foi executado no banco compartilhado. Revogação real de novo dispositivo aprovada na etapa 4 não foi repetida nesta rodada; o caso controlado da suíte geral permanece condicionado à atuação do operador.

## Estado técnico verificado em 9 de setembro de 2026

| Gate | Estado | Evidência / ação necessária |
|---|---|---|
| Supabase em São Paulo | Conforme | Projeto saudável em `sa-east-1`. |
| Vercel em São Paulo | Conforme tecnicamente | Funções configuradas em `gru1`; confirmar plano institucional antes do piloto formal. |
| SMTP transacional | Pendente | Definir provedor, remetente e credenciais; configurar SPF, DKIM e DMARC; testar convite e recuperação. |
| Domínio próprio | Conforme | `gestaoaps.qualeansaude.tech` cadastrado na Vercel, resolvido por CNAME e validado com HTTPS. O domínio principal permanece no servidor atual. |
| Backup externo | Pendente | Não foi identificado destino removível ou nuvem institucional. Definir mídia/serviço, custodiante e retenção. |
| Ciclo MVP sintético | Conforme | Doze elos do ciclo carregados e verificados de forma idempotente. |
| Dispositivos físicos | Pendente | Executar a matriz de homologação abaixo. |
| Governança e LGPD | Pendente | Aprovações nominais, inventário de dados, contratos e plano de incidentes. |

## 1. SMTP transacional

Decisão institucional:

- Provedor: ____________________
- Domínio/subdomínio de envio recomendado: `auth.qualeansaude.tech`
- Remetente recomendado: `nao-responda@auth.qualeansaude.tech`
- Nome do remetente: `SGC-UBS — Secretaria Municipal de Acaraú`
- Responsável pela conta: ____________________
- Data de aprovação: ____/____/________

Critérios de aceite:

- Credenciais exclusivas para o sistema, armazenadas fora do Git.
- SPF e DKIM validados pelo provedor; DMARC iniciado em modo de monitoramento.
- Rastreamento de links desativado para não modificar URLs de autenticação.
- Convite, recuperação de senha e alteração de e-mail testados em destinatários de provedores diferentes.
- Remetente, assunto e conteúdo identificam claramente a instituição e não incluem dados sensíveis.
- Limites de envio e alertas de falha documentados.

## 2. DNS do domínio

Antes da alteração, exportar a zona DNS no hPanel para permitir retorno. Não alterar MX, SPF, DKIM ou outros registros de e-mail existentes.

O MX atual aponta para `qualeansaude.tech`, que por sua vez resolve para o servidor antigo `179.199.149.143`. Por isso, o piloto usará um subdomínio e não alterará o A do domínio principal, evitando impacto nas caixas `@qualeansaude.tech`.

Registro isolado a criar conforme a configuração do projeto Vercel:

| Tipo | Nome | Valor | Estado |
|---|---|---|---|
| CNAME | `gestaoaps` | `cf021c64a01a1750.vercel-dns-017.com` | Conforme |

`https://gestaoaps.qualeansaude.tech` e seu certificado TLS foram validados. O endereço é o Site URL do Supabase e a origem pública configurada na Vercel. `https://gestaoaps.vercel.app/**` permanece autorizado como contingência durante a transição.

## 3. Backup e restauração

Decisões obrigatórias:

- Destino externo: ____________________
- Custodiante principal: ____________________
- Custodiante substituto: ____________________
- Retenção proposta: diário 30 dias; mensal 12 meses — aprovada? ( ) sim ( ) ajustar
- Local separado para a chave AES: ____________________
- Projeto Supabase descartável para ensaio: ____________________

Critérios de aceite:

- Destino não é apenas outra pasta ou partição do mesmo computador.
- Banco e objetos do bucket privado fazem parte do pacote cifrado.
- `npm run backup:verify -- <arquivo>` confirma integridade.
- `npm run backup:prepare-restore -- <arquivo> <pasta-nova>` autentica e extrai o pacote.
- Restauração integral ocorre somente em projeto descartável, seguida de testes RLS, contagens e hashes.
- Falha diária gera alerta ao custodiante; exercício mensal possui ata e evidência.

## 4. Matriz de acesso proposta

A tabela é uma proposta de menor privilégio e exige aprovação da Secretaria. Cada vínculo também deve limitar organização, UBS e domínio.

| Perfil | Escopo padrão | Operações propostas |
|---|---|---|
| `ADMIN_SISTEMA` | Organização, excepcional e nominativo | Todas; não usar para rotina operacional |
| `GESTOR_ORGANIZACAO` | Organização municipal | visualizar, criar, editar, aprovar, publicar, encerrar, reabrir, exportar |
| `GERENTE_UBS` | Uma UBS | visualizar, criar, editar, aprovar, executar, encerrar, reabrir, exportar |
| `RESPONSAVEL_DOMINIO` | UBS e domínios atribuídos | visualizar, criar, editar, aprovar, publicar, exportar |
| `EXECUTOR` | UBS e domínios atribuídos | visualizar, criar, editar, executar |
| `AUDITOR` | UBS e domínios de auditoria | visualizar, criar, editar, executar, encerrar, exportar |
| `LEITOR` | UBS e domínios atribuídos | visualizar |

Segregações obrigatórias: quem redige conteúdo não o aprova sozinho; acesso a Segurança do Paciente, Ouvidoria e Pessoas detalhado é nominativo, justificado, revisado periodicamente e auditado; exportação é concedida somente quando necessária.

Assinaturas: Gestor da organização ____________________; Encarregado/DPO ____________________; Controle interno ____________________; Data ____/____/________.

## 5. Metas, taxonomias, retenção e conteúdo

Nenhum valor clínico ou normativo deve ser criado pela equipe de software.

| Artefato | Dono institucional | Fonte/aprovação | Situação |
|---|---|---|---|
| Protocolos e referências | Coordenação técnica | Documento oficial e vigência | Pendente |
| Fórmulas e variáveis | Responsável pelo indicador | Memória de cálculo validada | Pendente |
| Metas por competência/UBS | Gestão municipal | Ata ou instrumento de pactuação | Pendente |
| Taxonomias e classificações | Comitê de qualidade | Lista controlada e versionada | Pendente |
| Retenção por classe documental | Jurídico/arquivo/DPO | Tabela de temporalidade | Pendente |
| Modelos de reunião e auditoria | Qualidade | Aprovação formal | Pendente |

Cada importação deve ter prévia, relatório de erros, responsável, data, fonte e confirmação transacional. Alterações futuras criam novas versões e preservam o histórico executado.

## 6. Homologação física de PWA e acessibilidade

Executar com pelo menos um aparelho real de cada perfil:

| Plataforma | Navegador | Instalação | Offline/reinício | Sincronização/conflito | 72 h/revogação | Acessibilidade | Resultado |
|---|---|---|---|---|---|---|---|
| Android | Chrome atual |  |  |  |  |  |  |
| iPhone | Safari/PWA atual |  |  |  |  |  |  |
| Windows | Chrome atual |  |  |  |  |  |  |
| Windows | Edge atual |  |  |  |  |  |  |

Verificar também: teclado completo, foco visível, labels anunciados por leitor de tela, zoom de 200%, contraste, orientação, baixo armazenamento, limpeza de dados pelo sistema, anexos interrompidos, fila extensa e nenhum descarte silencioso.

Homologadores: ____________________. Versões dos aparelhos/navegadores: ____________________. Evidências: ____________________. Data: ____/____/________.

### Preparação da sessão física

Reservar um aparelho de teste sem pendências de trabalho e dois navegadores/perfis independentes para edição concorrente. Confirmar o endereço Preview, o aviso de homologação, a organização sintética e a UBS antes de qualquer gravação. Se o acesso Vercel SSO impedir a abertura, registrar o bloqueio; não remover a proteção, transferir cookies nem usar credenciais no roteiro.

Registrar modelo, sistema, versão completa do navegador, modo navegador/PWA, tamanho da tela, rede, espaço livre, data/hora local e commit. Ativar data/hora automática. Criar um identificador da rodada, como `HML-FISICO-AAAAMMDD-APARELHO`, e incluí-lo nos novos registros. Usar nomes iniciados por `[SINTÉTICO]`, arquivos artificiais e competências previamente vazias. Não reaproveitar nem reabrir históricos de outras rodadas.

Guardar evidências em pasta controlada da instituição, sem senhas, PIN, tokens, cookies ou dados reais. Para cada teste, anotar horário, perfil, UBS/equipe, identificadores dos registros, resultado esperado/observado, captura/vídeo e defeito associado. Classificar como Passou, Falhou, Bloqueado ou Não executado; não deixar um bloqueio marcado como aprovado.

### Instalação por plataforma

- Android/Chrome: abrir o Preview online e usar a opção de adicionar/instalar aplicativo oferecida pelo navegador. Confirmar o ícone e a abertura pelo ícone, não apenas uma aba já aberta. Ver [guia do Chrome](https://support.google.com/chrome/answer/9658361?hl=pt-BR&co=GENIE.Platform%3DAndroid).
- iPhone/Safari: compartilhar a página e adicionar à Tela de Início; quando disponível, ativar a abertura como aplicativo web. Abrir pelo ícone e testar separadamente do Safari. O cofre preparado no navegador não deve ser presumido disponível na PWA. Ver [guia da Apple](https://support.apple.com/pt-br/guide/iphone/iphea86e5236/ios).
- Windows/Chrome: instalar pelo controle de aplicativo web do navegador e abrir pelo atalho instalado. Ver [guia do Chrome para computador](https://support.google.com/chrome/answer/9658361?hl=pt-BR).
- Windows/Edge: usar o ícone de instalação ou o menu de aplicativos, conforme a versão, e abrir o aplicativo instalado. Ver [guia do Edge](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge).

Não aceitar notificações, câmera ou outros acessos apenas para completar a instalação. Se forem necessários a uma função específica, registrar a finalidade e pedir a decisão do responsável. Não contratar plano ou desabilitar segurança como parte do teste.

### Casos executáveis em cada aparelho

| ID | Procedimento | Resultado esperado e evidência |
|---|---|---|
| F01 | Instalar, encerrar e reabrir online pelo ícone. Conferir ambiente, organização, UBS e equipe. | Preview correto, contexto visível e nenhuma tela de produção. Captura do aplicativo aberto e versões. |
| F02 | Entrar com cada conta sintética em perfis separados. Leitor B tenta abrir o link de registro novo da UBS A e uma exportação nominal A. Gerente A tenta abrir registro novo B. | Acesso permitido somente no recorte concedido; bloqueios sem nome, conteúdo ou arquivo de outra UBS. Não modificar concessões para fazer o teste passar. |
| F03 | Administrador cria conhecimento/protocolo administrativos de teste, fórmula e meta sintética 90. Gerente executa checklist com valor 70, anexa evidência, conclui, analisa desvio, cria plano/ação 5W2H e verifica eficácia. Registrar reunião, ata e encaminhamento convertido em ação. | Vínculos e versão executada preservados; medição 70 fora da meta; plano e ação visíveis; totais e listas coerentes; repetição não duplica. Capturar IDs de todo o encadeamento. |
| F04 | Na produção ESF de competência vazia, lançar 17, enviar, devolver pelo gerente com justificativa, corrigir para 19, reenviar e fechar. Exportar PDF e Excel. | Mensal 19; ano soma todos os meses existentes, não apenas o novo; zero e não informado distintos; relatórios legíveis e contexto/revisão explícitos. Abrir os arquivos em visualizadores reais. |
| F05 | Criar caso longitudinal sintético e acompanhamento, submeter, revisar com gerente e validar/fechar com referência autorizada. Abrir mês seguinte do mesmo caso. | Um identificador permanente, dois acompanhamentos; snapshot fechado anterior inalterado; dúvidas de origem continuam explícitas. PDF/XLSX preenchidos e consolidados sem nomes quando não nominais. |
| F06 | Preparar online um novo recorte e um existente no cofre. Desativar Wi-Fi e dados móveis; confirmar sem rede. Fechar totalmente navegador/PWA e reabrir pelo ícone. | Shell offline disponível; PIN incorreto não abre; PIN correto recupera somente os recortes preparados. Captura deve mostrar ausência real de rede, não apenas emulação. |
| F07 | Sem rede, editar campos, salvar explicitamente rascunho, anexar PDF/PNG/JPEG artificial e preparar gravação. Encerrar e reabrir outra vez sem rede. | Campos, zero, anexos e fila recuperados. Estado pendente, nunca confirmação de servidor fictícia. Rascunhos não salvos têm aviso; nenhum item desaparece silenciosamente. |
| F08 | Reconectar, sincronizar e interromper a conexão durante envio do anexo. Reconectar e repetir. Preparar envio/revisão/fechamento offline, conforme a permissão, depois sincronizar. | Uma gravação/baixa por operação e um anexo confirmado; hash/tamanho íntegros. Retomada de anexo é reenvio integral idempotente, não promessa de retomada por blocos. Transição só efetiva após confirmação. |
| F09 | Dois dispositivos abrem o mesmo acompanhamento. Um prepara edição sem rede; o outro grava nova versão online. Reconectar o primeiro. | Conflito 409 preservando as duas versões e bloqueando a entidade. Responsável autorizado decide com justificativa; leitor e gerente sem poder de resolução não recebem esse comando. Repetição da decisão não duplica. |
| F10 | Em dispositivo dedicado, preparar rascunho pendente e permanecer realmente sem reconexão por mais de 72 horas. Reabrir. | Conteúdo bloqueado; pendências cifradas não apagadas. Registrar início/fim. Não adiantar o relógio do aparelho nem apresentar tempo simulado como ensaio real. |
| F11 | Responsável revoga exclusivamente o dispositivo sintético recém-criado para esta rodada, nunca conta ou vínculo institucional. Reconectar o aparelho. | Sem renovação do cofre, leitura nominal ou envio após revogação; cópias ficam em quarentena. Revogação enquanto totalmente offline não é instantânea; limite local continua 72 horas. Registrar UUID aprovado e horários. |
| F12 | Com armazenamento baixo, tentar salvar novo rascunho/anexo; testar limite de arquivo e falha de rede. Somente após sincronização, em perfil descartável autorizado, ensaiar limpeza de dados do navegador. | Falha de armazenamento visível, edição existente preservada e sem falsa confirmação. Limpeza pelo SO pode destruir cópias locais: risco deve ser explícito; servidor continua íntegro. Não limpar um cofre com pendências úteis. |
| F13 | Usar teclado, leitor de tela, zoom 200%, fonte ampliada, orientação retrato/paisagem e teclado virtual. Percorrer login, menus, formulário, erros, conflito, sincronização e relatórios. | Labels/estados anunciados, foco visível e restaurado, nenhuma armadilha ou botão coberto; conteúdo utilizável a 320px. Conferir também contraste, alvos e foco não encoberto conforme WCAG 2.2 AA. |
| F14 | Novo acesso online, conferir fila zero, bloquear/desbloquear e sair somente após confirmar o que será apagado localmente. Entrar com outra conta. | Nenhuma leitura do cofre da conta anterior. Logout não remove registros do servidor. Ao testar exclusão local, guardar antes as evidências e descartar apenas o cofre sintético autorizado. |

F06–F12 devem ser feitos no navegador e no aplicativo instalado, quando suportado. Repetir F08/F09 para acompanhamento e formulário operacional do MVP. Não presumir que um bom resultado em Chromium cubra Safari/PWA. Itens de referência de acessibilidade: [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/).

### Sessão observada e aceite

Sem guiar os cliques, pedir ao gerente: localizar uma pendência da sua UBS, executar um protocolo com evidência e acompanhar um plano. Pedir à referência técnica: revisar um acompanhamento, devolver com motivo e fechar competência. Pedir ao leitor B: localizar seu consolidado e explicar por que não vê nomes/equipes A. Registrar tempo, ajuda solicitada, termos confusos, erros e recuperação; não inventar uma nota de usabilidade sem critério pactuado.

Para cada combinação da matriz, anexar uma ficha com: ID da rodada; commit; dispositivo/OS/navegador; modo; homologador; IDs F01–F14 e resultado; arquivos de evidência; defeitos/severidade; decisão e data. Um item bloqueado por SSO ou hardware permanece bloqueado, não aprovado por equivalência com o teste local.

Concluir a etapa 5 somente após fechar defeitos bloqueadores, repetir os testes afetados, obter assinatura do gerente, referência técnica e TI/segurança, e registrar as restrições aceitas. Vazamento entre UBS, perda silenciosa, duplicação de operações, confirmação falsa, alteração de histórico fechado ou impossibilidade de completar o ciclo bloqueiam o aceite. Aprovação para produção exige ainda os demais gates deste documento.

Decisão técnica: ____________________; gerente: ____________________; referência técnica: ____________________; TI/segurança: ____________________; data: ____________________. Plataforma não executada e plano de correção: ____________________.

## 7. LGPD, contratos e liberação de módulos sensíveis

Condições cumulativas para habilitar Segurança do Paciente, Ouvidoria ou Pessoas detalhado:

- Inventário de dados pessoais e mapa do fluxo, com finalidade, necessidade, base legal e titulares.
- Controlador, operadores, encarregado/DPO e responsabilidades formalmente definidos.
- Contratos/DPA e transferências internacionais avaliados pelo jurídico/DPO.
- Supabase Pro e Vercel Pro, ou contratação institucional equivalente formalmente aprovada.
- Política de retenção, descarte seguro, atendimento de direitos e registro das operações.
- Matriz de acesso aprovada, revisão periódica e processo de desligamento/revogação.
- Plano de resposta a incidentes, contatos, classificação, preservação de evidências e comunicação à ANPD/titulares quando aplicável.
- Backup externo restaurado com sucesso e recuperação documentada.
- Avaliação de impacto/RIPD decidida pelo encarregado, especialmente para dados de saúde e monitoramento sistemático.
- Termo formal de liberação com módulos, UBS, categorias de dados e data.

Decisão final: ( ) não liberar dados sensíveis ( ) liberar somente o escopo descrito em anexo.

Responsável administrativo ____________________; Encarregado/DPO ____________________; Jurídico ____________________; TI/Segurança ____________________; Data ____/____/________.
