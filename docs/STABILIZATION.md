# Estabilização e homologação — 18/10/2026

Atualização posterior autorizada: o usuário optou por usar o banco `GestaoAPS` compartilhado com uma organização sintética e aprovou explicitamente as migrations 025–035. O limite inicial abaixo documenta a fase de validação local anterior; para a configuração integrada vigente, consultar `STAGING.md`. Não foi promovido um novo deploy para produção.

## Limite de autorização

Trabalho exclusivamente local/revisão. Não promover para produção, aplicar migrations remotas, alterar Auth, DNS, credenciais ou flags institucionais. O projeto Supabase `javgqqgyealviyhqwhgx` é produção e não pode ser usado como banco de ensaio.

## Etapa 1 — ambientes e gates

- Modo demonstração exige `SGC_DEMO_MODE=true` explícito. Ausência de URL/chave retorna indisponibilidade (503), nunca identidade sintética.
- `VERCEL_ENV=production` rejeita demonstração. Builds demonstrativos não devem ser promovidos: reconstruir com as variáveis do ambiente integrado.
- CI inclui lint, tipos, testes, build e Playwright Chromium/WebKit, com relatórios como artifacts. Banco local é iniciado separadamente e recebe migrations e testes PostgreSQL. Configurar o resultado desses jobs como requisito de promoção no repositório; alteração remota não executada neste pacote.
- Auditoria anterior identificou produção até migration 024 e repositório até 035. Isso não autoriza aplicar o delta: validar primeiro banco limpo e upgrade de uma cópia sintética na homologação.
- Supabase hospedado de homologação, SMTP próprio e destino externo de backup ainda dependem de configuração/decisão específica. Não declarar restauração validada por executar apenas migrations.

## Etapa 2 — acesso e demonstração

- `/auth/confirm` é acessível antes da sessão; o handler continua verificando o token. APIs protegidas retornam 401 JSON; redirecionamentos preservam cookies renovados e filtros da lista.
- Detalhes sintéticos usam os mesmos IDs, títulos e estados da lista. IDs desconhecidos não fabricam registros.
- Cards demonstrativos reconciliam com as listas de exemplos; métricas comerciais fixas foram removidas das listas V2.
- Criação e comandos simulados informam que não gravaram dados. Formulário permanece disponível; não redirecionam para um ID inexistente.
- Demonstração não comprova persistência, autorização real, entregabilidade de e-mail ou ciclo operacional autenticado.

## Evidências locais

- 117 testes unitários/API aprovados em 19 arquivos; incluem confirmação de convite, recuperação válida/expirada e bloqueio de tipos não permitidos.
- 35 migrations aplicadas em banco Docker novo; 176 testes PostgreSQL/RLS aprovados em seis arquivos.
- Upgrade local 024 → 035 executado e seguido dos mesmos 176 testes aprovados. CI passa a repetir os dois caminhos.
- Validação final: 84/84 jornadas Playwright aprovadas em uma execução completa (2,2 minutos), com 28 testes em cada projeto: Chromium desktop, Chromium mobile e WebKit mobile. Inclui checklist, cadastro de equipe, recuperação de rascunho cifrado, simulação sem falsa confirmação, administração, CNES, exportações e navegação.
- Portas locais: API 56321, PostgreSQL 56322, shadow 56320 e Studio 56323. A faixa padrão 543xx estava reservada pelo Windows; nenhum serviço do outro projeto Docker foi alterado.
- Ensaio local não é cópia de dados produtivos e não comprova migração de dados históricos reais.
- Testes Playwright com APIs simuladas bloqueiam service workers para garantir a interceptação das requisições. Não são evidência de funcionamento da PWA offline. Formulários administrativos ficam desabilitados até a hidratação, evitando perda da primeira entrada.
- A execução final completa substitui o resultado intermediário de 82/84. Não houve falhas ou necessidade de repetição dirigida nessa execução. Relatório local: `playwright-report/index.html`.
- Reexecutados sobre o código final: 117 testes unitários/API e 176 testes PostgreSQL/RLS, todos aprovados; lint, tipos e build aprovados. Configuração local atualizada de `[inbucket]` para `[local_smtp]`, conforme aviso do CLI; leitura da configuração validada sem aviso de depreciação. Isso não configura SMTP institucional.
- Lint e build final aprovados. Supabase local foi parado preservando volumes; o outro projeto Docker permaneceu ativo. Nenhum commit, push, deploy ou alteração remota foi realizado neste pacote.

## Critérios para promoção (todos obrigatórios)

1. Migrations em banco isolado limpo e upgrade do estado 024, com logs e testes RLS aprovados.
2. Convite e recuperação com usuários sintéticos, links válidos/expirados, logout e revogação em ambiente integrado.
3. Duas UBS e dois perfis: proibição de leitura/escrita/exportação entre escopos; revisar RPCs SECURITY DEFINER e idempotência.
4. Jornadas reais de cadastro, detalhe, execução e retorno; demonstração não substitui esse gate.
5. Backup cifrado com objetos privados, restauração em destino isolado e conferência de hashes/contagens.
6. Aprovação humana registrada antes de qualquer promoção.

## Reversão

As alterações deste pacote são de aplicação/CI, sem migration nova. Manter o deployment de produção vigente; a revisão pode ser descartada sem mudar o banco. Uma futura promoção exige preservar o deployment anterior e compatibilidade do esquema. Não usar reset destrutivo no repositório ou no banco para reverter.
