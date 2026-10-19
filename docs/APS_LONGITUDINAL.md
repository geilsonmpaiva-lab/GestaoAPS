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

Rascunhos podem ser salvos explicitamente no cofre cifrado já existente. Isto **não** homologa navegação offline, nova fila de sincronização ou anexos nominais: são pendências da etapa 4. Falhas de envio preservam o envelope; nenhuma transição é confirmada sem servidor.

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

Validação institucional de campos e opções; confirmação manual de vínculos antigos; sessão observada; leitor de tela e aparelhos físicos. Offline longitudinal integral e anexos ficam para a etapa 4. Nenhum desses itens é declarado resolvido por testes sintéticos.
