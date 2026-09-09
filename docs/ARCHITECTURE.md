# Arquitetura do SGC-UBS

## Decisões

- Monólito modular em Next.js, hospedado na Vercel em `gru1`.
- PostgreSQL, Auth, Storage privado e Cron no Supabase em `sa-east-1`.
- Autenticação por convite, e-mail e senha; autorização por organização, UBS, domínio e operação.
- Toda tabela exposta possui RLS. A API usa o JWT do usuário; `service_role` é reservada a tarefas internas.
- Mudanças críticas são comandos transacionais. Eventos derivados entram na outbox na mesma transação.
- Versões publicadas de conhecimento e protocolos são imutáveis.
- Modo offline usa comandos idempotentes, controle otimista e conflitos explícitos.

## Limites dos módulos

`src/lib/domain` contém regras puras. `src/app/api/v1` é a borda HTTP. Migrations em `supabase/migrations` são a única fonte de mudanças do banco. Interfaces reutilizáveis ficam em `src/components`.

Os módulos especializados reutilizam anexos, indicadores, metas, não conformidades, planos, notificações, auditoria, permissões e versionamento. Não devem criar motores paralelos.

Os comandos de aprovação/publicação de protocolo, conclusão de execução, abertura de plano a partir de desvio e encerramento de reunião exigem UUID de operação e versão esperada. Repetições retornam o resultado persistido; versões divergentes retornam conflito HTTP 409.

## Segurança por construção

- UUIDs são criados no cliente e servidor; timestamps persistidos em UTC.
- Dados multi-UBS carregam `organization_id` e `unit_id`; políticas RLS consultam vínculos vigentes.
- Buckets são privados e seus caminhos seguem `<organizacao>/<ubs|organization>/<entidade>/<arquivo>`.
- Auditoria é append-only. Campos livres sensíveis são removidos dos snapshots de auditoria dos módulos restritos.
- Segurança do paciente, Ouvidoria e RH detalhado ficam desabilitados até os gates institucionais.

## Offline

A PWA armazena dados e comandos em IndexedDB cifrado com AES-GCM. O cofre local deriva a chave de um PIN com PBKDF2 e exige validação online após 72 horas. Operações críticas ficam como intenção pendente até confirmação do servidor. Conflitos preservam ambas as versões.

## Fórmulas

Indicadores usam uma AST JSON limitada a literais, variáveis, operações aritméticas e funções permitidas. Não há execução de código. Cada fórmula é versionada e a medição referencia a versão usada.

Uma versão publicada de protocolo pode ser vinculada explicitamente a uma versão imutável de fórmula. Ao concluir a execução, as variáveis são avaliadas no PostgreSQL, a medição é gravada com os insumos e a versão da fórmula, e a meta vigente da UBS classifica o resultado como `SEM_DADO`, `DENTRO_META`, `ATENCAO` ou `FORA_META` na mesma transação.

## Melhoria contínua

Cada indicador pode ter uma política de desvio por organização ou UBS. Quando habilitada, uma medição `FORA_META` abre uma única não conformidade por origem, cria o plano correspondente e notifica o responsável. A restrição parcial no banco impede duplicatas ativas mesmo sob reprocessamento concorrente.

Os planos usam ações 5W2H. Conclusão e verificação de eficácia são comandos idempotentes e versionados: todas as ações precisam estar concluídas ou canceladas antes da avaliação. Uma avaliação eficaz encerra a não conformidade; uma avaliação ineficaz reabre o tratamento e exige nova ação.

## Reuniões

Reuniões preservam pauta ordenada, participantes, presença, ata e encaminhamentos dentro do escopo da UBS. Iniciar e encerrar são transições versionadas. Um encaminhamento pode ser convertido uma única vez em plano e ação 5W2H, ligando a decisão da ata ao monitoramento da melhoria sem copiar ou perder a origem.

## Qualidade

Modelos de auditoria possuem checklist parametrizado e versão institucional. Depois de publicados, conteúdo e regras ficam imutáveis; somente a substituição por nova versão pode torná-los obsoletos. A execução referencia exatamente o modelo usado, aceita evidências privadas por critério e, ao ser concluída, abre uma única NC e plano quando houver não conformidades.

## Módulos sensíveis

Segurança do paciente e Ouvidoria exigem simultaneamente permissão RBAC e feature flag habilitada no escopo. A regra está nas políticas RLS, não apenas na interface. Toda consulta passa por um RPC que registra ator, dispositivo, finalidade, escopo e quantidade de registros em trilha append-only; conteúdo sensível não é copiado para logs técnicos. Tratamento e resposta usam comandos transacionais com versão esperada.
