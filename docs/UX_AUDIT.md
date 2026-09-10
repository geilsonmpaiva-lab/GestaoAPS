# Auditoria UX/UI — modernização do MVP

Data: 09/09/2026. Auditoria de código e integração realizada por frentes de UX operacional, design/navegação e acessibilidade. Os achados abaixo distinguem a implementação local da homologação com usuários. Não representam aprovação institucional ou liberação de produção.

## Evidências e tratamento

| Prioridade | Evidência observada | Impacto operacional | Tratamento nesta revisão |
|---|---|---|---|
| P0 | `src/components/module-view.tsx` só oferecia resumo genérico e iniciar reunião, apesar das APIs do ciclo. | Usuário não podia reproduzir o ciclo completo pela interface. | Novas páginas de detalhes e formulários de comandos. A execução autenticada ponta a ponta continua sendo critério de promoção. |
| P1 | Barra móvel apresentava quatro módulos e “Mais” abria Administração. | Reuniões e parte da melhoria ficavam sem navegação móvel direta. | Navegação V2 completa com módulos autorizados; verificar teclado, toque e leitor de tela. |
| P1 | Dashboard legado tinha competência, contagens e próximo marco fixos mesmo em ambiente integrado. | Usuário podia tomar decisões sobre números ilustrativos. | Dashboard V2 usa contagens do escopo e erros explícitos. Legado preservado atrás da flag para comparação/rollback. |
| P1 | Filtros eram botões sem ação; consulta limitada a 50 sem paginação. | Registros ficavam inacessíveis e controles aparentavam funcionar. | Paginação de 25 e filtros reais. Testes de 55 registros na UBS A, 6 na B e 61 no agregado reconciliam lista e dashboard. Controles sem suporte estão ocultos. |
| P1 | Seletor de UBS era uma identificação estática; contexto escolhia o primeiro vínculo. | Operação multiUBS ambígua. | Cookie de preferência validado a cada carga por vínculos ativos; API rejeita escopos forjados. Diretório mínimo retorna somente nomes/IDs autorizados. |
| P1 | Perfil RLS era visível apenas ao próprio usuário; seleção de responsáveis não encontrava colegas. | Gestor não podia atribuir ações/presenças a outros responsáveis. | RPC `read_workspace_people`, escopada à organização e à UBS do registro; exige migration 030 e testes SQL. |
| P1 | Interface anunciava preservação offline, mas criação fazia `fetch` e usava somente estado React. | Risco de perda de conteúdo ao recarregar. | Rascunhos explícitos cifrados, incluindo campos estruturados de checklist; não equivale a navegação e operação offline completas. |
| P2 | Selects exibiam enums técnicos e criação podia retornar à lista de outro recurso. | Dificultava entender a próxima etapa. | Rótulos pt-BR, páginas por recurso e abas de NC/planos/ações com retorno à lista preservado. |

## Revisão de integração dos detalhes

- Publicação/aprovação continuam usando comandos e versões esperadas; interface respeita os nomes reais de payload e estados aceitos pelas APIs.
- Respostas booleanas opcionais vazias são enviadas como `null`, preservando a diferença entre ausência de resposta e “Não”.
- Checklist local é restaurado somente após validação de estrutura, quantidade de campos, formatos e limites; PIN/cofre permanecem compartilhados no contexto do usuário.
- Reuniões distinguem permissão de criar pauta/encaminhamento e editar presença existente. Como a API de presença usa upsert, presença existente requer criar e editar. Início exige executar; encerramento exige encerrar. Conversão em plano exige editar em Reuniões e Melhoria.
- Visão agregada abre registros autorizados das UBS da organização. Ao abrir um registro de UBS específica, responsáveis, opções e anexos passam a usar aquela UBS; uploads recebem o escopo do registro.
- APIs de versões de protocolo usam ID da versão nas rotas históricas de aprovação/publicação; os formulários seguem esse contrato existente.

## Pendências reais e bloqueios de promoção

1. **P0 — Homologação autenticada completa:** provar o ciclo por formulários e comandos com evidência real de teste, segregação entre UBS, papéis distintos e conflitos. Dados previamente inseridos por seed não comprovam operabilidade da interface. Não promover enquanto esse aceite não passar.
2. **P1 — Offline completo:** `public/sw.js` entrega uma página pública de contingência ao falhar navegação; não carrega telas autenticadas completas offline. Rascunhos exigem salvamento explícito e envio de anexos ainda precisa de rede. Navegação após reinício, bootstrap/deltas cifrados, fila ampla, conflitos e anexos interrompidos ainda exigem implementação/homologação. A flag UX não pode ser apresentada como conclusão do offline previsto nas SPECS.
3. **P1 — Gates fora da UI:** GET/POST genéricos agora verificam módulos habilitados, organização e UBS selecionadas; notificações ficam restritas ao ator. Dez testes cobrem bloqueios e preservação do comando idempotente. Ainda falta comprovar enforcement equivalente em todos os comandos específicos e acessos diretos ao Supabase. Manter ondas posteriores fechadas e bloquear sua promoção até essa cobertura server-side.
4. **P1 — Matriz de acesso ao cálculo:** bindings/fórmulas usam autorização `indicadores/visualizar`. Um executor com somente `protocolos` não vê parâmetros do cálculo e pode concluir execução sem medição. Homologar a matriz aprovada com acesso mínimo à configuração necessária, ou implementar metadados de cálculo específicos; não declarar o ciclo medido garantido para esse perfil.
5. **P1 — Homologação física e acessibilidade:** testes em emulação não comprovam instalação/persistência PWA em iPhone/Android/Windows, leitor de tela real, teclado, zoom alto e baixo armazenamento. Necessário registrar aparelho, navegador, versão, cenário e resultado.
6. **P2 — Relações extensas:** detalhes carregam no máximo 100 vínculos/opções por relação. Paginação específica de históricos longos, fórmulas e relações ainda não está implementada.
7. **P2 — Pesquisa de execuções/medições:** essas abas usam filtros próprios; pesquisa textual por nome associado não está disponível nesta revisão. O controle foi ocultado para evitar uma busca sem efeito.

## Evidências locais e implantação

A rodada final passou em typecheck, lint, build, 41 testes unitários, 26 jornadas Chromium e 122 asserções PostgreSQL (33 novas e 89 de regressão), estas últimas com rollback integral no banco. WebKit apresentou falhas de processo/memória e não está homologado. Esses resultados não substituem o ciclo autenticado pela interface nem a homologação física. Detalhes de reprodução estão em [UX_REVIEW.md](UX_REVIEW.md).

`ux_mvp_v2` permanece false por padrão institucional. A revisão exige aplicar e validar as migrations correspondentes antes do deploy; reversão da interface é feita pela flag, sem excluir registros. Registrar os resultados da homologação e os achados remanescentes antes de habilitar a experiência no piloto.
