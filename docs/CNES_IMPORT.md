# Cadastro de unidades pelo CNES

## Operação

Revisão UX/UI da squad (09/09/2026): filtros em grade que se recolhem após a consulta, etapas explícitas, destino institucional visível, cartões sem repetição de identificação, filtro local por nome/CNES/bairro, seleção dos disponíveis até o limite de 20 e barra persistente de revisão. Filtros locais não alteram a seleção; voltar da revisão restaura o foco no título dos resultados. Fonte, datas, permissões, revalidação e persistência não foram alteradas. Oito jornadas específicas CNES passaram em Chromium desktop/mobile, incluindo 320 px, filtro local, seleção em lote e retorno de foco; build e lint aprovados. O carregamento de municípios continua explícito nesta revisão.

Administração → Unidades → Buscar no CNES (`/administracao/unidades/cnes`).
Escolher UF, carregar municípios, selecionar município e consultar. O filtro padrão é **Centro de saúde / Unidade básica (tipo 2)**; Posto de saúde (tipo 1) é uma opção explícita. A consulta inclui apenas estabelecimentos ativos na fonte. CNES exato é opcional, com sete dígitos.

Selecionar até 20 unidades por lote, revisar e confirmar. Unidades já existentes, inclusive inativas, não são sobrescritas ou reativadas. Outros tipos de estabelecimento não são cadastrados por este fluxo. A unidade de trabalho atual não muda. Em demonstração a fonte pública é real, mas nenhum cadastro é persistido.

## Fonte e limites

- Fonte oficial: [API de Dados Abertos do Ministério da Saúde](https://apidadosabertos.saude.gov.br/v1), Swagger `/static/swagger.json`.
- Municípios: `/macrorregiao-e-regiao-de-saude/municipio?sigla_uf=CE&limit=860&offset=0`. Código municipal de seis dígitos, validado contra a UF.
- Unidades: `/cnes/estabelecimentos`, com `codigo_uf`, `codigo_municipio`, `codigo_tipo_unidade`, `status=1`, `limit=20` e `offset`.
- Verificação pública em 09/09/2026: `offset` desloca **registros**, apesar da descrição de páginas no Swagger. Paginação usa 0, 20, 40. A consulta de Acaraú retornou 25 unidades do tipo 2, incluindo CNES 3657973. Contagem não é fixa nem garantia de atualização cadastral.
- Sem token externo. Origem HTTPS fixa, redirecionamentos bloqueados, sem dados privados enviados. A data do cadastro na fonte é distinta do horário da consulta, ambos apresentados.
- A confirmação reconsulta a lista ativa e valida cada selecionada antes de gravar. Limites: 2.000 registros varridos, 40 segundos para revalidação e 12 segundos por requisição. Falha, inconsistência ou ausência impede iniciar a gravação; seleção permanece na tela. Não há fila offline para cadastro administrativo.
- Apenas nome, CNES, endereço e proveniência mínima. Não importa profissionais, contatos pessoais, pacientes, CNPJ, equipes ou serviços. O importador não altera vínculos de usuários.

## Persistência e segurança

Migration aditiva `202609090035_cnes_unit_import.sql`, dependente do cadastro administrativo 032. Aplicar primeiro em homologação e executar os testes de banco antes de publicar a interface para gravação real.

`GET/POST /api/v1/admin/cnes` exigem usuário autenticado e permissão de cadastro em nível de organização. POST aceita organização, UF, município, tipo, seleção CNES e `operationId`; nomes e endereços vêm da reconsulta no servidor, não do formulário.

RPC `import_cnes_units` usa JWT do usuário, revalida autorização antes de retornar idempotência, serializa operação e CNES por organização, ignora existentes e reutiliza `register_admin_unit` na mesma transação (autoria, auditoria e outbox existentes). Uma falha desfaz o lote completo. Reenvio da mesma intenção retorna o resultado original mesmo se a fonte estiver indisponível; intenção diferente não pode reutilizar o identificador.

Proveniência fica no endereço JSON em `source`. É metadado operacional, não atestado criptográfico da fonte. Nenhuma chave privilegiada é usada. A migração não executa importações nem modifica cadastros existentes.

## Verificação e liberação

Testes unitários cobrem normalização, zeros à esquerda, escopo, paginação, respostas inconsistentes, seleção, permissão, repetição e falhas. Jornadas Playwright usam respostas simuladas do endpoint para tornar a seleção/revisão/reenvio determinísticos. Não substituem homologação autenticada no Supabase.

Antes de produção: executar migrations e testes PostgreSQL em homologação; validar dois perfis e duas organizações, repetição e concorrência real; confirmar consulta pública no ambiente hospedado. Não aplicar migration ou cadastrar unidades reais automaticamente durante testes locais.

### Evidências locais — 09/09/2026

- 106 testes unitários/API aprovados, incluindo 21 novos testes CNES; lint e build Next.js aprovados.
- 14 jornadas Chromium (desktop/celular) para CNES e cadastros administrativos, incluindo 320 px, paginação, seleção, revisão e reenvio após erro.
- Consulta real via endpoint do aplicativo em demonstração: 184 municípios do Ceará; Acaraú com 20 + 5 UBS ativas, 25 CNES únicos e `UBS DE PAULO VI` (3657973). Não houve POST nem cadastro real nesta verificação pública.
- Testes PostgreSQL fornecidos em `supabase/tests/database/cnes_import.test.sql`, **não executados**: PostgreSQL/Docker não disponíveis neste ambiente. Migration 035 não aplicada a banco hospedado. Não houve publicação em produção nesta entrega.
