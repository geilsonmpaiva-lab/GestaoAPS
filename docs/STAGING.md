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
