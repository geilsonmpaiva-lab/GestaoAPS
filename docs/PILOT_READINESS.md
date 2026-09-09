# Prontidão institucional do piloto SGC-UBS

Este documento controla os gates que não podem ser aprovados apenas pela equipe técnica. Até a assinatura dos responsáveis, usar somente dados sintéticos ou dados reais formalmente classificados como não sensíveis, minimizados e autorizados.

## Estado técnico verificado em 9 de setembro de 2026

| Gate | Estado | Evidência / ação necessária |
|---|---|---|
| Supabase em São Paulo | Conforme | Projeto saudável em `sa-east-1`. |
| Vercel em São Paulo | Conforme tecnicamente | Funções configuradas em `gru1`; confirmar plano institucional antes do piloto formal. |
| SMTP transacional | Pendente | Definir provedor, remetente e credenciais; configurar SPF, DKIM e DMARC; testar convite e recuperação. |
| Domínio próprio | Em configuração | `gestaoaps.qualeansaude.tech` cadastrado e verificado no projeto Vercel; falta criar seu CNAME no hPanel e validar TLS. O domínio principal permanece no servidor atual. |
| Backup externo | Pendente | Não foi identificado destino removível ou nuvem institucional. Definir mídia/serviço, custodiante e retenção. |
| Ciclo MVP sintético | Conforme | Doze elos do ciclo carregados e verificados de forma idempotente. |
| Dispositivos físicos | Pendente | Executar a matriz de homologação abaixo. |
| Governança e LGPD | Pendente | Aprovações nominais, inventário de dados, contratos e plano de incidentes. |

## 1. SMTP transacional

Decisão institucional:

- Provedor: ____________________
- Domínio/subdomínio de envio recomendado: `auth.qualeansaude.tech`
- Remetente recomendado: `nao-responda@auth.qualeansaude.tech`
- Nome do remetente: `SGC-UBS — Secretaria Municipal de Acaraú`
- Responsável pela conta: ____________________
- Data de aprovação: ____/____/________

Critérios de aceite:

- Credenciais exclusivas para o sistema, armazenadas fora do Git.
- SPF e DKIM validados pelo provedor; DMARC iniciado em modo de monitoramento.
- Rastreamento de links desativado para não modificar URLs de autenticação.
- Convite, recuperação de senha e alteração de e-mail testados em destinatários de provedores diferentes.
- Remetente, assunto e conteúdo identificam claramente a instituição e não incluem dados sensíveis.
- Limites de envio e alertas de falha documentados.

## 2. DNS do domínio

Antes da alteração, exportar a zona DNS no hPanel para permitir retorno. Não alterar MX, SPF, DKIM ou outros registros de e-mail existentes.

O MX atual aponta para `qualeansaude.tech`, que por sua vez resolve para o servidor antigo `179.199.149.143`. Por isso, o piloto usará um subdomínio e não alterará o A do domínio principal, evitando impacto nas caixas `@qualeansaude.tech`.

Registro isolado a criar conforme a configuração do projeto Vercel:

| Tipo | Nome | Valor | Estado |
|---|---|---|---|
| CNAME | `gestaoaps` | `cf021c64a01a1750.vercel-dns-017.com` | Pendente |

Após a propagação, validar `https://gestaoaps.qualeansaude.tech` e seu certificado TLS. O novo endereço e `https://gestaoaps.vercel.app/**` já estão autorizados como Redirect URLs no Supabase; trocar o Site URL somente depois da validação. Manter `https://gestaoaps.vercel.app` como contingência durante a transição.

## 3. Backup e restauração

Decisões obrigatórias:

- Destino externo: ____________________
- Custodiante principal: ____________________
- Custodiante substituto: ____________________
- Retenção proposta: diário 30 dias; mensal 12 meses — aprovada? ( ) sim ( ) ajustar
- Local separado para a chave AES: ____________________
- Projeto Supabase descartável para ensaio: ____________________

Critérios de aceite:

- Destino não é apenas outra pasta ou partição do mesmo computador.
- Banco e objetos do bucket privado fazem parte do pacote cifrado.
- `npm run backup:verify -- <arquivo>` confirma integridade.
- `npm run backup:prepare-restore -- <arquivo> <pasta-nova>` autentica e extrai o pacote.
- Restauração integral ocorre somente em projeto descartável, seguida de testes RLS, contagens e hashes.
- Falha diária gera alerta ao custodiante; exercício mensal possui ata e evidência.

## 4. Matriz de acesso proposta

A tabela é uma proposta de menor privilégio e exige aprovação da Secretaria. Cada vínculo também deve limitar organização, UBS e domínio.

| Perfil | Escopo padrão | Operações propostas |
|---|---|---|
| `ADMIN_SISTEMA` | Organização, excepcional e nominativo | Todas; não usar para rotina operacional |
| `GESTOR_ORGANIZACAO` | Organização municipal | visualizar, criar, editar, aprovar, publicar, encerrar, reabrir, exportar |
| `GERENTE_UBS` | Uma UBS | visualizar, criar, editar, aprovar, executar, encerrar, reabrir, exportar |
| `RESPONSAVEL_DOMINIO` | UBS e domínios atribuídos | visualizar, criar, editar, aprovar, publicar, exportar |
| `EXECUTOR` | UBS e domínios atribuídos | visualizar, criar, editar, executar |
| `AUDITOR` | UBS e domínios de auditoria | visualizar, criar, editar, executar, encerrar, exportar |
| `LEITOR` | UBS e domínios atribuídos | visualizar |

Segregações obrigatórias: quem redige conteúdo não o aprova sozinho; acesso a Segurança do Paciente, Ouvidoria e Pessoas detalhado é nominativo, justificado, revisado periodicamente e auditado; exportação é concedida somente quando necessária.

Assinaturas: Gestor da organização ____________________; Encarregado/DPO ____________________; Controle interno ____________________; Data ____/____/________.

## 5. Metas, taxonomias, retenção e conteúdo

Nenhum valor clínico ou normativo deve ser criado pela equipe de software.

| Artefato | Dono institucional | Fonte/aprovação | Situação |
|---|---|---|---|
| Protocolos e referências | Coordenação técnica | Documento oficial e vigência | Pendente |
| Fórmulas e variáveis | Responsável pelo indicador | Memória de cálculo validada | Pendente |
| Metas por competência/UBS | Gestão municipal | Ata ou instrumento de pactuação | Pendente |
| Taxonomias e classificações | Comitê de qualidade | Lista controlada e versionada | Pendente |
| Retenção por classe documental | Jurídico/arquivo/DPO | Tabela de temporalidade | Pendente |
| Modelos de reunião e auditoria | Qualidade | Aprovação formal | Pendente |

Cada importação deve ter prévia, relatório de erros, responsável, data, fonte e confirmação transacional. Alterações futuras criam novas versões e preservam o histórico executado.

## 6. Homologação física de PWA e acessibilidade

Executar com pelo menos um aparelho real de cada perfil:

| Plataforma | Navegador | Instalação | Offline/reinício | Sincronização/conflito | 72 h/revogação | Acessibilidade | Resultado |
|---|---|---|---|---|---|---|---|
| Android | Chrome atual |  |  |  |  |  |  |
| iPhone | Safari/PWA atual |  |  |  |  |  |  |
| Windows | Chrome atual |  |  |  |  |  |  |
| Windows | Edge atual |  |  |  |  |  |  |

Verificar também: teclado completo, foco visível, labels anunciados por leitor de tela, zoom de 200%, contraste, orientação, baixo armazenamento, limpeza de dados pelo sistema, anexos interrompidos, fila extensa e nenhum descarte silencioso.

Homologadores: ____________________. Versões dos aparelhos/navegadores: ____________________. Evidências: ____________________. Data: ____/____/________.

## 7. LGPD, contratos e liberação de módulos sensíveis

Condições cumulativas para habilitar Segurança do Paciente, Ouvidoria ou Pessoas detalhado:

- Inventário de dados pessoais e mapa do fluxo, com finalidade, necessidade, base legal e titulares.
- Controlador, operadores, encarregado/DPO e responsabilidades formalmente definidos.
- Contratos/DPA e transferências internacionais avaliados pelo jurídico/DPO.
- Supabase Pro e Vercel Pro, ou contratação institucional equivalente formalmente aprovada.
- Política de retenção, descarte seguro, atendimento de direitos e registro das operações.
- Matriz de acesso aprovada, revisão periódica e processo de desligamento/revogação.
- Plano de resposta a incidentes, contatos, classificação, preservação de evidências e comunicação à ANPD/titulares quando aplicável.
- Backup externo restaurado com sucesso e recuperação documentada.
- Avaliação de impacto/RIPD decidida pelo encarregado, especialmente para dados de saúde e monitoramento sistemático.
- Termo formal de liberação com módulos, UBS, categorias de dados e data.

Decisão final: ( ) não liberar dados sensíveis ( ) liberar somente o escopo descrito em anexo.

Responsável administrativo ____________________; Encarregado/DPO ____________________; Jurídico ____________________; TI/Segurança ____________________; Data ____/____/________.
