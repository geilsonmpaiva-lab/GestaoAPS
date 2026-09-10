# Cadastros administrativos

## Entrega

- Administração → Usuários: lista de vínculos autorizados, busca por nome/e-mail, situação, unidade e paginação de 25 itens. Convite em página própria, sem senha definida pelo administrador.
- Administração → Unidades: lista de UBS autorizadas; cadastro com nome, CNES de sete dígitos e endereço opcional. Cadastrar uma unidade não altera a unidade de trabalho selecionada.
- URLs: `/administracao/usuarios`, `/administracao/usuarios/novo`, `/administracao/unidades`, `/administracao/unidades/novo`.
- O catálogo administrativo abrange os vínculos que o administrador pode gerir na organização; o restante do sistema continua no escopo de trabalho selecionado. Um gerente restrito a uma UBS não ganha visão de toda a organização.
- Filtros ficam na URL e são preservados ao abrir o cadastro e voltar. O catálogo autorizado é carregado para paginação local (piloto até 300 usuários); para expansão maior, migrar busca/paginação ao banco.

## Segurança e persistência

`POST /api/v1/admin/units` usa `register_admin_unit` com JWT do solicitante. Exige vínculo ativo de gestor da organização/administrador com escopo organizacional e permissão de criação administrativa. Validação de CNES, deduplicação por organização e idempotência usam bloqueios transacionais; repetição do mesmo operationId devolve o resultado original. Reutilização com outro payload é rejeitada.

`POST /api/v1/admin/invites` valida catálogo, escopo, perfil, domínios e operações antes de chamar Auth. `authorize_admin_invite` valida novamente no PostgreSQL antes do envio; `provision_invited_membership` repete a autorização ao gravar. Um gerente não pode convidar administradores/gestores/gerentes, ampliar escopo para outra UBS ou delegar permissões que não possui. O formulário não oferece criação de administradores do sistema.

A chave privilegiada de Auth permanece exclusivamente no servidor do fluxo de convites existente. Não é usada para consultas do catálogo nem criação de unidades. Envio de e-mail e vínculo PostgreSQL não são uma única transação: se o convite sair mas o vínculo falhar, a interface informa confirmação parcial e bloqueia reenvio naquele formulário; o administrador precisa reconciliar o vínculo. E-mails já cadastrados não são vinculados automaticamente a outra organização. Convites exigem verificação de remetente/SMTP e URLs de Auth no ambiente de destino.

Migração aditiva: `202609090032_admin_registration.sql`. Adiciona catálogo protegido, comandos e trilhas de auditoria/outbox para unidades e vínculos; não habilita grants de escrita direta. Revoga delegação excessiva também em chamadas diretas ao RPC antigo. É necessário homologar eventuais clientes antigos desse RPC.

## Validação e liberação

A demonstração não persiste cadastros nem envia e-mails; sua confirmação diz explicitamente que houve apenas simulação. Falhas de rede preservam os campos na tela, mas não há rascunho persistente de cadastros administrativos: recarregar ou fechar a página pode perdê-los.

Testes locais incluem validação de contratos e autorização da API, formulários desktop/mobile, ausência de senha no convite, CNES, retorno com filtros e repetição idempotente após erro. Rodada local: 67 testes unitários/API e 38 testes Chromium desktop/mobile aprovados, TypeScript/lint e compilação aprovados. Os testes do banco estão em `supabase/tests/database/admin_registration.test.sql` (transação com rollback), cobrindo isolamento, elevação de perfil, catálogo, idempotência, duplicidade, auditoria e outbox.

A migração não foi aplicada ao Supabase hospedado. Docker/PostgreSQL não estão disponíveis neste computador para executar a suíte SQL; os testes PostgreSQL ainda precisam rodar em homologação. Antes de produção: aplicar migrations na ordem em ambiente de teste, rodar `supabase test db`, executar com dois perfis e duas UBS, confirmar persistência real e entrega de um convite autorizado. Não usar a demonstração como evidência de aceite do banco ou SMTP.
