# Homologação integrada em banco compartilhado

## Destino

Organização Supabase: QuaLeanSaude. Projeto autorizado pelo usuário: `GestaoAPS` (`javgqqgyealviyhqwhgx`), região `sa-east-1`. Em 18/10/2026, o usuário autorizou compartilhar esse banco para testes sintéticos e, separadamente, aplicar as migrations 025–035 preservando os registros de negócio existentes. O deploy de produção e a branch `main` não são promovidos por esta configuração.

Organização de dados exclusiva dos testes: `[HOMOLOGAÇÃO] Município Sintético`, ID `362db1a9-bfdd-4334-9436-46b1c0117eab`. UBS A: `32747837-0478-49b4-be4d-f96d5e120c1d`; UBS B: `04fa0c38-8f17-4747-87fa-0397e81612a4`. Não existe isolamento físico: Auth, funções, banco e Storage pertencem ao mesmo projeto da produção.

A tentativa de criar outro projeto gratuito foi recusada por quota. Nenhum projeto foi pausado ou excluído e nenhum plano foi contratado. A migration 025 inicialmente bloqueada pela revisão automática só foi aplicada após a autorização explícita das mudanças estruturais.

As migrations 025–035 foram aplicadas pelo conector Supabase e os novos registros de histórico foram alinhados às versões canônicas do repositório. Não houve atualização do histórico 001–024. Provisionamento e carga sintética foram executados com IDs derivados da nova organização, sem reutilizar fixtures antigas.

## Arquivo de configuração exclusivo

Arquivo privado: `.env.staging.local`, indicado por `SGC_STAGING_ENV_FILE`. Credenciais sintéticas: `.env.staging.accounts.local` (JSON). Ambos são ignorados pelo Git. A preparação autorizada copiou somente as chaves de conexão necessárias para o arquivo exclusivo de testes; não modificou `.env.local`. Configuração sem segredos:

```dotenv
SGC_ENVIRONMENT=staging
SGC_STAGING_DATABASE_MODE=shared-synthetic
SGC_STAGING_PROJECT_REF=javgqqgyealviyhqwhgx
SGC_STAGING_ORGANIZATION_ID=362db1a9-bfdd-4334-9436-46b1c0117eab
NEXT_PUBLIC_SUPABASE_URL=https://javgqqgyealviyhqwhgx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=CHAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=CHAVE_PRIVADA_SOMENTE_NO_SERVIDOR
NEXT_PUBLIC_APP_ORIGIN=https://gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app
SGC_DEMO_MODE=false
SGC_STAGING_ACCOUNTS_FILE=.env.staging.accounts.local
```

`staging-config.mjs` exige marcador de ambiente, referência e URL coerentes; só permite este banco com `shared-synthetic` explícito e verifica o projeto das chaves JWT legadas. Não imprime chaves nem usa fallback de ambiente. Na aplicação, `canUseStaging` exige vínculo ativo com a organização sintética e o contexto de trabalho só inclui seus escopos. Usuários exclusivos da organização real recebem 403 na prévia.

## Preparação do projeto e dados

1. Não executar reset, limpeza, exclusão ou testes SQL com fixtures globais neste banco compartilhado. As migrations 001–035 já estão registradas; próximas alterações de estrutura exigem avaliação do impacto compartilhado.
2. Não alterar Auth global ou Site URL da produção para esses testes. As contas sintéticas foram criadas e confirmadas administrativamente, sem envio de e-mails. Recuperação por e-mail e SMTP não são comprovados por esta carga. Storage permanece privado, com objetos sob o prefixo da organização sintética.
3. Com `SGC_STAGING_ENV_FILE` definido, executar `node scripts/provision-staging.mjs`. Cria organização e duas UBS identificadas como sintéticas, administrador municipal, gerente da UBS A e leitor da UBS B. Credenciais aleatórias ficam no arquivo local ignorado pelo Git; não são exibidas em logs. Reexecuções não trocam senhas existentes.
4. Executar `node scripts/seed-mvp-synthetic.mjs` para dados sintéticos de navegação. O script foi alterado para exigir o arquivo exclusivo de homologação. A carga pronta não substitui comprovar a jornada pela interface.
5. Na Vercel, usar `SGC_DEMO_MODE=false`, `SGC_ENVIRONMENT=staging`, `SGC_STAGING_DATABASE_MODE=shared-synthetic`, `SGC_STAGING_PROJECT_REF`, `SGC_STAGING_ORGANIZATION_ID` e a origem da branch **somente em Preview para `codex/cnes-ux-release`**. URL e chaves Supabase continuam as já configuradas no projeto. Chave privada nunca recebe prefixo `NEXT_PUBLIC_`. Reconstruir a prévia; não promover para Production.

## Verificação antes da entrega

Validação executada nesta preparação: 125 testes unitários/API, três testes dos guardas de configuração, lint e build integrado aprovados. A jornada Playwright autenticada local passou com troca real de UBS, criação de conteúdo e confirmação após recarregar a página. Comandos: `npm run staging:verify` e `npm run test:staging:ui`; exigem os arquivos privados indicados pelas variáveis de ambiente.

- Conferir no build e na rede o projeto autorizado e o escopo sintético; confirmar que produção continua no deployment anterior.
- Entrar com cada perfil; cadastrar registros, recarregar e comprovar persistência; trocar UBS com o administrador.
- Demonstrar a separação entre gerente A e leitor B, inclusive acesso direto por IDs, exportações e comandos repetidos.
- Executar conhecimento → protocolo/checklist → execução/evidência → medição/meta → desvio/plano → acompanhamento pela interface autenticada.
- Verificação autenticada por SDK aprovada: cadastro persistido e auditado, idempotência, gerente A sem acesso à UBS B e leitor B sem permissão de escrita.
- Hashes dos registros originais de organização, unidade, perfil e vínculo foram conferidos antes/depois e permaneceram iguais. A revisão automática recusou uma varredura de hashes de todas as tabelas; não houve nova tentativa nem alegação de verificação integral dos registros.
- Advisors consultados: ESF opera por RPC com grants diretos revogados (INFO sem policies); permanecem avisos sobre RPCs SECURITY DEFINER intencionais, extensão pública e configurações Auth. Referências: [RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [extensão](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [MFA](https://supabase.com/docs/guides/auth/auth-mfa). Não foram alteradas configurações globais de segurança para eliminar avisos.
- SMTP próprio, restauração externa e aparelhos físicos continuam exigindo validação específica. Não habilitar coleta de dados sensíveis reais.

## Ciclo autenticado validado em 18/10/2026

Executado `tests/integration/cycle.spec.ts` no build integrado local, conectado ao Supabase autorizado, sem mocks de dados ou comandos. Cada repetição criou registros novos identificados como `[HOMOLOGAÇÃO]`; os registros anteriores, inclusive tentativas parciais de teste, foram preservados. Não houve reset ou limpeza do banco compartilhado.

Jornada aprovada com sessões independentes:

- Administrador: seleciona UBS A, cadastra conhecimento, cria versão, envia à revisão, aprova e publica; cadastra indicador com fórmula estruturada e meta 90; cadastra protocolo referenciado ao conhecimento, checklist numérico, vínculo de fórmula, revisão, aprovação e publicação.
- Gerente A: inicia execução, salva resposta 70, envia CSV sintético privado com integridade confirmada e conclui execução; o servidor gera medição 70 / `FORA_META`. Reenvio do comando retorna a mesma medição, sem duplicar. Registra análise crítica, desvio, plano, ação 5W2H, progresso, conclusão e eficácia.
- Gerente A: agenda reunião, registra pauta e presença de colega autorizado, inicia, cria encaminhamento, converte em ação e encerra com ata.
- Leitor B: não acessa o protocolo nem a evidência da UBS A por IDs diretos, não cria registros e não exporta sem a operação `exportar`. A carga de sincronização da UBS B não contém o protocolo A.
- Administrador cadastra novo conhecimento na UBS B após confirmação da troca de contexto: leitor B consulta e gerente A recebe bloqueio. Card de medições fora da meta reconcilia com o total da lista e contém a medição criada.

Correções entregues:

1. Exportação passa a exigir módulo habilitado e permissão `exportar`, aplica organização/UBS selecionadas, rejeita ampliação de UBS via URL e exclui registros com soft delete. Seis testes unitários de regressão.
2. A validação de participantes/encaminhamentos fazia um JOIN em perfis sob RLS do gerente e rejeitava colegas municipais legítimos. A migration `20261018151205_fix_meeting_membership_visibility.sql` reutiliza `read_workspace_people`, mantendo o trigger `SECURITY INVOKER`, as policies e os grants existentes. O usuário autorizou expressamente aplicar esta função no banco compartilhado **após** testes locais. A falha foi reproduzida localmente; os oito novos casos e a suíte SQL completa passaram antes da aplicação remota. Somente o histórico novo foi alinhado à versão canônica do arquivo.

Resultados finais: 131 testes unitários/API (21 arquivos), três testes de configuração, 184 testes SQL/RLS locais (sete arquivos), duas jornadas autenticadas integradas e 84 testes Playwright de regressão em demonstração (Chromium desktop/mobile e WebKit mobile). Lint, typecheck, build integrado e diff check aprovados. Advisors sem novo alerta; permanecem os avisos anteriores documentados acima. Nenhuma configuração global de Auth foi alterada.

Limites da evidência: as jornadas completas automatizadas usaram o frontend local com o banco de homologação real. A prévia hospedada foi conferida no navegador autenticado; a execução anônima automatizada remota continua protegida pelo login da Vercel, que não foi desativado. A suíte de demonstração e os testes SQL locais não substituem homologação em aparelhos físicos, revogação/expiração offline, SMTP, restauração, carga ou aceite institucional. Não há liberação para dados sensíveis reais nem promoção do deploy de produção.

## Pacote offline e conflitos — 18/10/2026

A área `/offline` é uma casca pública estática, sem consultas ou dados de conta no HTML. O service worker guarda apenas essa casca e assets públicos. Rascunhos, snapshots preparados, comandos e bytes dos anexos permanecem cifrados em IndexedDB, segregados por conta/organização/UBS. O PIN e a chave não persistem após reiniciar o navegador. Troca de conta, perda de permissões, perfil suspenso ou dispositivo revogado bloqueiam o cofre sem descartar pendências. Troca de UBS exige voltar ao contexto original; expiração de 72 horas ou retrocesso de relógio também bloqueiam a leitura. Logout apaga o cofre privado, não a casca pública.

### RPC adicional autorizada

Após 198 testes SQL/RLS locais aprovados (oito arquivos), foi aplicada somente a migration `20261018160851_offline_update_action_conflict.sql`. Ela cria `staging_update_action`, **SECURITY INVOKER**, sem substituir funções existentes, sem mudar policies/tabelas e sem DML sobre registros de negócio. Execução anônima foi revogada. A RPC exige perfil ativo, permissão atual de edição, acesso à ação e organização ativa identificada por `[HOMOLOGAÇÃO]`, inclusive antes de devolver resultado idempotente.

A nova RPC traduz `40001` em `PT409`, evitando a [repetição indefinida do PostgREST 14](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). Não houve reinício do projeto nem encerramento de conexões compartilhadas. O hash da definição de `update_action` permaneceu `82a6fbeb69886db687eea1c1675afa91` antes/depois. Apenas o registro de histórico desta nova migration foi alinhado à versão gerada pelo CLI. O adapter é selecionado pela aplicação somente com `SGC_ENVIRONMENT=staging`; a resolução offline também exige `editar` e `reabrir`.

### Evidências e limites operacionais

- Reinício real de processo Chromium com perfil persistente e rede indisponível: cofre bloqueado inicialmente, PIN incorreto sem perda, recuperação do rascunho, preparação de fila sem falsa confirmação e gravação única ao reconectar. Avanço controlado de 73 horas bloqueou a leitura e preservou os itens cifrados.
- Upload privado interrompido, novo processo de navegador e retomada: mesmo UUID de reserva, hash/tamanho confirmados pelo servidor e um único vínculo `AVAILABLE`. A retomada reenvia o arquivo completo; **não implementa retomada por offset/TUS**.
- Ação sintética com progresso local 30 e concorrente 60: HTTP 409, ambas as versões preservadas, bloqueio da entidade **nesta fila local**, reaplicação autorizada com nova versão e comentário auditado. Repetir a mesma resolução retorna o resultado original sem segunda alteração. A estratégia de manter servidor também foi executada contra o banco sintético real: preservou o progresso atual e registrou uma única justificativa, inclusive ao repetir a operação.
- Revogação remota de UUIDs novos criados exclusivamente pelos testes: reconexão bloqueada, requisição com dispositivo revogado recusada e ciphertext preservado. Não foram revogados dispositivos preexistentes.
- Falha de armazenamento injetada no navegador: mensagem de falha, campos não descartados e rascunho anterior recuperável. Logout removeu o IndexedDB privado e impediu recuperação posterior. Isso **não equivale** a homologação de baixo armazenamento no aparelho físico.
- 173 testes unitários/API (27 arquivos), três guardas de configuração, 198 testes SQL/RLS, seis jornadas integradas autenticadas e 84 testes de regressão em demonstração (Chromium desktop/mobile e WebKit mobile), lint, typecheck e build aprovados. As jornadas completas usaram o frontend local com o banco sintético real. O cenário de anexo/conflito foi repetido após acrescentar a alternativa KEEP_SERVER. O teste unitário do service worker também verifica assets com `?dpl=` da Vercel e exclusão de URLs externas/APIs do cache. Advisors antes/depois mantiveram os mesmos avisos já documentados; a função nova não acrescentou alerta SECURITY DEFINER.

Escopo desta versão anterior (ampliado pelo pacote de transições críticas abaixo): fila automática para os cinco cadastros idempotentes (`knowledge`, `protocols`, `indicators`, `action-plans`, `meetings`) e atualização de acompanhamento de ações. Os demais comandos permaneciam como **rascunhos cifrados para confirmação online**. Conflitos não possuem bloqueio global entre dispositivos nem merge automático; o conteúdo original fica preservado na cópia local. Anexos ainda exigem espaço para a cópia integral cifrada. Não há alegação de offline completo de todos os módulos.

Roteiro para o testador: entrar na **URL estável da branch**, abrir Sincronização, desbloquear o cofre com PIN próprio e preparar um detalhe por “Disponibilizar neste dispositivo”; salvar rascunhos explicitamente, depois abrir “Área offline”. Antes de limpar dados do navegador ou sair da conta, conferir pendências. Em revogação/alteração de permissões, não desbloquear dados antigos com um novo escopo: exigir tratamento institucional autorizado.

As jornadas integradas usam somente contas e registros sintéticos no banco compartilhado, sem alterar/excluir registros preexistentes. O build e os testes locais não comprovam instalação em Android/iPhone, limpeza pelo sistema operacional, quota física, fila extensa ou comportamento de todas as versões de Safari/Edge. Essas homologações e os demais gates institucionais permanecem necessários. Publicação permitida apenas em Preview; nenhuma promoção para produção.

## Transições críticas — migration autorizada e aplicada em 18/10/2026

Migration `20261018165409_offline_critical_transitions.sql` aplicada ao GestaoAPS compartilhado **após autorização específica do usuário e 230 testes SQL/RLS locais aprovados**. Somente o registro recém-criado no histórico foi alinhado à versão canônica do CLI. Não houve DML sobre registros de negócio existentes nem substituição de funções anteriores. As jornadas criam novos registros sintéticos; não executam limpeza ou fixtures SQL no banco hospedado.

Definições e ACLs anteriores preservadas: 252 funções públicas com fingerprint `35b505571a41bfe0b54686c71a2c5fe8`; 24 funções internas anteriores com fingerprint `4123bed24f5dcecb1e82bb30a3da875c`. Confirmados RLS na tabela privada, ausência de SELECT/INSERT diretos para authenticated e execução anônima revogada. Advisors mantiveram os WARN anteriores; foi acrescentado apenas o INFO esperado de [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) na tabela privada, acessada exclusivamente pela implementação autorizada da RPC, sem grants diretos.

Escopo preparado: envio/revisão/aprovação/publicação de conhecimento e protocolo, conclusão de execução e ação, verificação de eficácia, início/encerramento de reunião e conversão de encaminhamento em ação. São dez rotas explícitas; não inclui fechamentos ESF, módulos administrativos/sensíveis ou comandos inexistentes de cancelamento/reabertura. Outros formulários de edição permanecem como rascunhos, inclusive criação de checklist/respostas. Não há criação automática de dependências entre comandos preparados sobre versões diferentes.

- API nova `/api/v1/offline/transitions`, bloqueada fora de `SGC_ENVIRONMENT=staging`, exige ator, dispositivo, módulo e contexto selecionado. Não muda as rotas/comandos online existentes.
- RPC pública `staging_offline_transition(jsonb)` é SECURITY INVOKER; a implementação privilegiada fica no schema não exposto `app`, com JWT, perfil/vínculo/permissões atuais, dispositivo válido, escopo sintético e autorização **antes** de respostas idempotentes ou locks. Seletores de entidades incluem organização/UBS; UUID de outra organização não bloqueia seus registros. Sem SQL dinâmico ou função indicada pelo cliente.
- Tabela privada `app.offline_transition_receipts` com RLS, grants diretos revogados e triggers que impedem update/delete/truncate. Grava comando, resultado e resoluções append-only; resolução também entra na auditoria existente. A migration só adiciona objetos e não substitui funções atuais nem faz DML em registros existentes.
- Exige snapshot completo preparado do registro e dos vínculos relevantes. Não usa apenas `version_number`, que não muda entre estados de uma mesma versão. Checklists/vínculos, respostas, ações do plano e pauta/presenças/encaminhamentos são comparados e bloqueados conforme a família. Locks têm limite de cinco segundos; ocupação/deadlock gera resposta retryable sem confirmação falsa.
- Preparação crítica exige confirmação explícita offline. A fila mantém ordem temporal, IDs e payload originais; envia anexos primeiro. A preparação não publica, aprova nem conclui o registro localmente. Nenhum resultado de demonstração ou recibo não confirmado é aceito como gravação durável.
- Conflitos preservam snapshot original, conteúdo preparado e snapshot atual. Usuário autorizado pode manter servidor ou reavaliar explicitamente o comando, sempre com motivo, novo ID de resolução, nova comparação e mesmas regras de negócio. Repetições mantêm conflito/resolução original; não fazem merge nem forçam estado inválido. O bloqueio de fila continua local: não há alteração dos comandos antigos para implantar bloqueio global entre dispositivos.
- Campo PIN da área offline fica desabilitado até a hidratação, evitando perda do preenchimento no WebKit.

Validação local repetida: 203 testes unitários/API (29 arquivos), três guardas de configuração, 230 testes SQL/RLS (nove arquivos, 32 casos novos), typecheck/lint aprovados e 87 regressões de demonstração aprovadas em Chromium desktop/mobile e WebKit mobile. O caso adicional da fila verifica o bloqueio da mesma versão de protocolo nas rotas equivalentes `protocols` e `protocol-versions`. A jornada de interface de demonstração usa gateway simulado e **não comprova persistência hospedada**. Advisors de segurança locais sem achado no nível ERROR. Todas as fixtures SQL sofrem rollback; nenhum teste SQL foi executado no projeto compartilhado.

Jornadas autenticadas de transições: `tests/integration/critical-transitions.spec.ts`. A preparação offline e a sincronização usam a interface real; fixtures novas são cadastradas pela API autenticada, sem SQL manual nem mocks dos resultados. Foram confirmadas as 12 transições de estado previstas nas dez rotas, incluindo anexo privado na conclusão da execução e reenvio exato de cada envelope. A perda de resposta interrompe somente o retorno HTTP depois da confirmação real do servidor: nova tentativa recuperou a confirmação original. Consulta restrita aos 12 UUIDs criados nesta execução confirmou exatamente um recibo e uma entrada de auditoria de confirmação para cada operação.

O cenário de conflito altera a pauta por uma segunda sessão, mantendo a versão principal. A sincronização respondeu 409; KEEP_SERVER preservou SCHEDULED, sem executar o início. RETRY foi executado em um segundo registro novo: após revisão e justificativa explícitas, confirmou IN_PROGRESS, com recibo de resolução idempotente. O leitor da UBS B recebeu 403 ao tentar resolver a operação da UBS A. A jornada completa online (`cycle.spec.ts`) também foi repetida com conhecimento, protocolo, indicador/meta, evidência, medição, desvio/plano, eficácia, reuniões e segregação entre UBS.

Fechamento dos testes: sete jornadas integradas aprovadas na suíte geral (revogação reservada), seguidas de dois testes focados aprovados no build final: RETRY e revogação controlada. Total de nove cenários distintos autenticados aprovados. O UUID `5d9a8298-053f-4012-a55a-f6ad86798519` foi criado exclusivamente nesta rodada; conferidos ator, organização e horário de criação antes de revogar somente esse dispositivo. Reconexão bloqueada e ciphertext preservado. Nenhum dispositivo preexistente foi revogado. Build integrado final, typecheck/lint e nova execução das 87 regressões de interface aprovados. As jornadas hospedam os dados no Supabase real, mas executam o frontend local: não substituem testes físicos nem a conferência do Preview publicado.

Publicação deste pacote permitida exclusivamente na branch Preview `codex/cnes-ux-release`, após a suíte integrada e regressões. Produção permanece `a0da09f`. A presença dos novos objetos no banco compartilhado não equivale a um deploy de produção nem a autorização para dados sensíveis reais.
