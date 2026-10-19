# Etapa 3 — entrada longitudinal ESF/Vigilância

## Limites e preservação

Entrega restrita ao ambiente staging/Preview, flag `ux_aps_v3` e organização `[HOMOLOGAÇÃO] Município Sintético`. Produção e organização institucional não recebem a nova interface. Somente hanseníase e tuberculose têm a entrada longitudinal; as outras áreas não são convertidas.

Um caso recebe identificador permanente, com um acompanhamento versionado por competência. A identificação inicial é imutável. Revisões, devoluções e reaberturas são auditadas. Adoção de registro anterior exige vínculo explícito, não altera a origem e suprime sua contagem duplicada apenas na mesma competência. Não há união automática por nome ou SINAN, nem migração automática dos mapas ESF anteriores.

SINAN/número confirmado, contatos/contatos examinados e tipo/classificação operacional permanecem campos independentes. Resultados clínicos são transcrições, sem interpretação ou recomendação. Meses de acompanhamento não são meses do calendário.

## Interface e relatórios

- `/vigilancia/acompanhamentos`: cadastro permanente, lançamento por competência, lista de 25 casos e 25 origens, histórico entre meses e revisões auditadas.
- `/api/v1/epidemiology/longitudinal`: consultas e comandos explícitos com JWT, escopo conferido no servidor, idempotência e versão otimista.
- `/vigilancia/acompanhamentos/impressao`: projeção pura para os SVGs revisados, sem criar cópias em mapas ESF. Valores excedentes e campos sem célula são preservados no anexo. Impressão nominal somente da equipe autorizada; consolidados UBS/município não incluem nomes.
- `/api/v1/epidemiology/longitudinal/export`: XLSX autorizado; textos de fórmula são neutralizados, códigos permanecem textos e zero não equivale a ausência.

O fechamento usa as revisões mensais existentes e congela registros anteriores, novos acompanhamentos e cabeçalhos. Uma proteção aditiva impede clientes antigos de fechar snapshots parciais quando há novos acompanhamentos. Reabrir não modifica o snapshot anterior. Cabeçalhos divergentes bloqueiam o fechamento até conferência.

Rascunhos podem ser salvos explicitamente no cofre cifrado. A etapa 4 abaixo acrescenta navegação pela página pública offline, fila e anexos restritos. Falhas de envio preservam o envelope; nenhuma transição é confirmada sem servidor.

## Migration e verificações

Aplicada após testes isolados: `20261019211455_epidemiology_longitudinal_v1`. Quatro tabelas privadas com RLS, cinco funções novas e triggers aditivos. Nenhuma função anterior foi substituída.

Conferência imediatamente após a aplicação (antes das fixtures de UI):

| Conteúdo anterior | Quantidade | Hash antes = depois |
|---|---:|---|
| Funções app/public | 306 | `9d267879c9d862235c14ddc52b59823c` |
| Registros epidemiológicos | 562 | `c63bc58e0b3bdfdf8b3b5ab135cc70f4` |
| Mapas ESF | 62 | `fc1fa3858632226dd69fb57801b7149d` |
| Snapshots mensais | 6 | `a2cb0562fcbfd2110bd3038d62dd5ee6` |

Docker local inicializado. O banco local anterior tinha DDL sem histórico correspondente; não foi apagado. Foi criada cópia isolada `sgc_longitudinal_test_final`, sem o agendador pg_cron; as migrations epidemiológicas foram aplicadas nela. A suíte completa passou com 507 asserções em 17 arquivos, incluindo 40 longitudinais com rollback. Isto não é apresentado como ensaio de backup/restauração institucional nem como banco criado do zero.

Lint, TypeScript e build aprovados; 415 testes unitários aprovados. Duas jornadas autenticadas aprovadas (hanseníase e tuberculose): criação pela interface → envio → revisão por gerente → validação → fechamento → PDF/XLSX → acompanhamento do mesmo caso no mês seguinte. Usam contas sintéticas, UBS A/B e competências previamente vazias. O leitor de outra UBS não pode consultar/exportar a equipe A. As fixtures não reutilizam nem reabrem relatórios anteriores. Teste de 320px sem transbordamento horizontal aprovado.

PDFs de duas páginas por área (formulário e anexo), renderizados com Poppler e inspecionados. Corrigida colisão de estilos com a impressão retrato anterior: a nova rota tem página paisagem nomeada, papel branco e grade sem corte lateral. Os campos longos mantêm o conteúdo integral no anexo. XLSX conferido por leitura do arquivo efetivo, preservando códigos textuais e sem fórmulas executáveis. Não equivale a validação no Excel instalado.

Advisors de segurança executados após DDL: sem achado nos novos objetos. Permanecem alertas anteriores, incluindo [funções públicas SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [extensão em public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) e [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não foram alteradas configurações de segurança institucionais nesta entrega.

## Aceite restante

Regressão local final: 96 jornadas V2 (Chromium desktop/mobile e WebKit mobile) e oito jornadas APS V3 aprovadas. Builds de demonstração e homologação aprovados. As duas jornadas longitudinais integradas são adicionais a esses 104 testes de demonstração, não equivalentes a testes executados no Preview com SSO.

Após as jornadas, os hashes dos 562 registros anteriores, 62 mapas ESF e seis snapshots anteriores à migration continuaram iguais. Apenas novos casos, acompanhamentos e revisões sintéticos foram acrescentados. As tentativas intermediárias também foram mantidas, não apagadas.

Validação institucional de campos e opções; confirmação manual de vínculos antigos; sessão observada; leitor de tela e aparelhos físicos. Nenhum desses itens é declarado resolvido por testes sintéticos.

## Etapa 4 — offline longitudinal (19/10/2026)

Restrito ao Preview, flag APS V3 e organização sintética. Preparar online na tela do acompanhamento; depois abrir `/offline`, informar PIN e selecionar o recorte cifrado. A adoção de origens anteriores continua explicitamente online. Salvamento do rascunho é explícito; não há salvamento automático prometido.

- Snapshot e rascunho segregados por conta, organização, UBS, equipe, área, competência e classificação. HTML/RSC/API autenticados e nomes não são armazenados pelo service worker. A navegação sem rede usa somente a página pública estática.
- Envelope imutável, versão preparada e identificador idempotente. Gravações são enviadas antes dos anexos e das transições críticas. Conflitos bloqueiam alterações e preservam cliente/base/servidor; decisões explícitas são autorizadas e auditadas. Alterações posteriores não substituem silenciosamente o rascunho preparado.
- PDF/PNG/JPEG até 25 MB em bucket privado, caminhos opacos, hash/tamanho/formato verificados antes da confirmação e novamente no download. Interrupção retoma por reenvio integral idempotente, não por blocos. Cópia local só fica disponível offline quando preparada/cifrada explicitamente.
- Validação do dispositivo e fingerprint de acesso antes da sincronização. Revogação é detectada na reconexão; expiração local em 72 horas bloqueia leitura sem apagar pendências. Não se promete revogação instantânea enquanto o dispositivo está sem rede.
- Fechamento/transições dependem do servidor. Anexos pendentes e conflitos impedem fechamento; snapshots novos incluem os metadados dos anexos confirmados. Relatórios antigos não são reescritos.

Migration `20261019215149_epidemiology_longitudinal_offline_v1` aplicada após testes isolados: três tabelas privadas, cinco funções novas e proteções aditivas. As 311 funções anteriores mantiveram hash `abcbfd01fa920e5a9723dacc234e10d6`; os quatro casos, sete acompanhamentos e dez snapshots existentes estavam idênticos imediatamente após o DDL. Nenhuma função anterior foi substituída. Advisors sem achados nos novos objetos; alertas preexistentes continuam pendentes.

Verificações: 433 testes unitários; 530 asserções SQL/RLS em 17 arquivos no banco isolado, sem reset do banco anterior. Duas jornadas reais em Chromium local com Supabase hospedado e contas sintéticas: processo fechado/reaberto duas vezes sem rede; PIN incorreto; recuperação de rascunho/anexo; cifragem; resposta perdida após commit; upload interrompido/repetido; edição concorrente pelo gerente; conflito e resolução RETRY; envio à UBS; largura de 320px; expiração simulada de 73 horas; revogação de dispositivo recém-criado e quarentena preservando os registros cifrados. Corrigidos agrupamento indevido de rascunho como snapshot, leitura de eventos de anexos no histórico e nome acessível do seletor de resolução.

Regressão final adicional: 96 jornadas V2 (Chromium desktop/mobile e WebKit mobile) e oito APS V3 aprovadas. Lint, TypeScript e builds de demonstração/homologação aprovados. Após os testes, os hashes dos 562 registros anteriores, 62 mapas ESF, quatro casos e sete acompanhamentos anteriores continuaram iguais. Os dez snapshots anteriores foram preservados; as fixtures novas permaneceram no histórico sintético.

Limites: essas jornadas integradas não são uma suíte offline executada no Preview protegido por SSO. Safari/iPhone, instalação física, baixo armazenamento/arquivos no limite e aceite observado ainda exigem homologação própria. Nenhuma liberação de dados sensíveis reais ou publicação em produção foi feita.
