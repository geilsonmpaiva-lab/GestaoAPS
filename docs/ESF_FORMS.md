# Formulários ESF — implantação em fases

## Situação desta entrega

Implementação local inicial, não conclusão das quatro fases do plano. Nenhuma migration foi aplicada ao Supabase hospedado e nenhuma flag foi promovida. Não usar com dados reais sensíveis.

| Parte | Implementado localmente | Falta para aceite |
|---|---|---|
| Catálogo | Dez modelos, página de origem, campos agrupados/tipados, versão 1, classificação, área revisora e pendências visíveis | Validação institucional das transcrições e catálogos; versões aprovadas persistidas |
| Equipes | Cadastro por UBS, identificação/área, consulta e vinculação/revogação de usuários já autorizados | Homologar SQL, perfis e segregação com usuários reais de teste; edição/inativação e paginação administrativa |
| Produção | 25 procedimentos separados, registro diário, correção otimista, filtros de competência/equipe/procedimento, paginação 25, soma mensal/anual e distinção zero/ausência | Homologação autenticada, catálogo aprovado e mais de 50 registros |
| Revisão da produção | Enviar, devolver, fechar, reabrir; justificativas; snapshot imutável por fechamento | Testes SQL reais, UI de consulta/exportação das revisões anteriores e trilha de responsáveis nominalmente identificados |
| Relatórios | Impressão/salvar PDF do mapa mensal; XLSX mensal + anual com exportação autorizada | Homologação do XLSX integrado, revisão visual de PDF multipágina; relatórios das demais famílias |
| Offline | Reuso do cofre para salvar/recuperar rascunho da produção | Navegação autenticada após reinício, bootstrap/deltas ESF, fila, dispositivo/timestamp nos comandos, conflitos persistidos/resolvidos e anexos retomáveis |
| Outras nove fichas | Dicionário consultável; entrada bloqueada | Tabelas específicas, formulários operacionais, CAF/pessoas/vigilância, estoque e acompanhamento nominal |

Rotas: `/formularios-esf`, `/formularios-esf/producao`, `/formularios-esf/{modelo}`, `/administracao/equipes` e `/administracao/equipes/novo`.

Na demonstração, os lançamentos ficam exclusivamente no estado da tela. Recarregar, navegar ou aplicar filtros descarta a simulação; a UI declara essa limitação. O cadastro de equipes e os vínculos também são simulados. A demonstração não testa persistência nem RLS.

## Dados, comandos e permissões

Migrations aditivas: `202609090033_esf_production.sql` e `202609090034_esf_team_access.sql`, após a sequência existente até 032.

- `esf_teams` e `esf_team_members`: UBS obrigatória, chaves compostas de organização/UBS/equipe, situação e versionamento dos vínculos.
- `esf_production`: uma linha por equipe/data/procedimento; zero é válido. A correção altera quantidade, não identidade/data/procedimento. Data da ocorrência é independente do timestamp de gravação.
- `esf_production_months` trava o mês durante gravações e transições. Qualquer alteração de produção incrementa sua versão. Em revisão/fechado, gravações são rejeitadas.
- `esf_production_revisions` preserva snapshots fechados. Reabrir incrementa a revisão; não altera os snapshots anteriores.
- RLS habilitada; sem grants diretos a clientes nas tabelas novas. Leituras e escritas passam por RPCs com `auth.uid()`, perfil ativo, vínculo vigente, unidade ativa e escopo de equipe. Auditoria/outbox na mesma transação.
- Gerentes/gestores autorizados enxergam equipes da UBS de seu vínculo. Demais perfis precisam também de associação à equipe. A associação não concede domínio/operações e não cria conta.
- Revisão exige perfil administrativo autorizado; encerrar exige `encerrar`, devolver exige `aprovar`, reabrir exige `reabrir`. Exportação exige `exportar`.
- Replays revalidam autorização antes de retornar a resposta; operação reutilizada por outro usuário ou com conteúdo diferente é rejeitada. Conflitos retornam 409 sem sobrescrever; por enquanto, preservar os campos na tela não equivale a resolução persistida no banco.

APIs adicionadas:

- `GET/POST /api/v1/esf/teams` e `GET/POST /api/v1/esf/teams/access`.
- `GET/POST /api/v1/esf/production`.
- `POST /api/v1/esf/production/month` (`submit`, `return`, `close`, `reopen`).
- `GET /api/v1/esf/production/export`: XLSX; o filtro de procedimento da lista não reduz o mapa completo da equipe.

Os comandos usam `operationId` e `expectedVersion` quando aplicável. O servidor valida organização/UBS contra o contexto ativo; o banco valida a equipe. Identificadores da produção são gerados no cliente.

## Flags e aprovação documental

`esf.producao` controla acesso aos dados; `esf.producao.catalog_approved` também é exigida nas gravações/transições. Ambas ficam desligadas por ausência. A API genérica de promoção de flags ainda não inclui essas chaves: criar o fluxo governado de aprovação antes da promoção; não contornar esse requisito em produção.

As outras nove chaves constam apenas no dicionário e não habilitam entrada de dados. Não liberar módulos administrativos/sensíveis inteiros para testar um formulário.

Itens a validar: siglas de frequência, códigos dos procedimentos (inclusive trechos de leitura duvidosa), notas de testes rápidos, unidade do peso, demanda, apresentações, meses relativos de tuberculose e catálogo de materiais incompleto (faltam 1–48). O dicionário não contém conteúdo clínico novo nem prazos automatizados. O PDF não foi modificado.

## Verificação e próximos trabalhos

Testes unitários/API e Playwright cobrem contratos, 25 procedimentos, códigos repetidos, datas, zero/ausência, totais, transições, escopo, reenvio e demonstração. `supabase/tests/database/esf_production.test.sql` prepara testes reais de isolamento, idempotência, gates, snapshots e revogação, mas não foi executado: Docker/PostgreSQL não estão disponíveis neste computador.

Rodada final local: **85 testes unitários/API** em 14 arquivos e **48 jornadas Playwright** em Chromium desktop/mobile passaram, incluindo 10 jornadas ESF. Lint e build (com TypeScript) passaram. A primeira rodada de navegador teve falhas de localização do seletor, corrigidas para usar seu nome acessível; uma verificação simultânea esgotou a memória do computador, e a validação final foi repetida sequencialmente. Inspeção visual da produção em 320 px realizada. Isso não comprova RLS no PostgreSQL, Safari/PWA físico nem restauração de backups.

Antes de piloto: executar toda a cadeia de migrations em banco limpo de homologação; rodar a suíte pgTAP; ampliar testes de vínculo por equipe, concorrência e exportação; obter aprovação documental. Só então configurar flags pelo fluxo governado, com justificativa e escopo da UBS.

Próxima fase técnica: completar os componentes de entrada por tipo, modelos aprovados, frequência e movimentações diárias integradas ao estoque; depois acompanhamentos nominais e comprovantes. Offline integral e testes físicos continuam entregas próprias, não garantias da fundação atual. SMTP, backup/restauração, contratos e requisitos institucionais permanecem independentes.

Em Windows com pouca memória, validar sequencialmente. `SGC_E2E_EXTERNAL_SERVER=true` permite Playwright usar um servidor de demonstração já iniciado em `localhost:3101`, evitando que a desmontagem da árvore de processos bloqueie a suíte. Não usar esse modo contra produção.
