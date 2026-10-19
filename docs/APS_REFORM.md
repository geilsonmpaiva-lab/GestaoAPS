# Reforma da experiência APS — 19/10/2026

Objetivo aprovado: registrar uma vez na equipe, acompanhar revisão na UBS e consolidar no município. Referência de interação: SimuLab local, sem identidade QuaLean. A reforma preserva identidades, registros, versões fechadas, auditoria, RLS e comandos transacionais.

## Decisões de produto

- Público inicial: profissional da equipe; gerência e referência técnica recebem filas próprias.
- Função + área + abrangência; cargo profissional não concede acesso. Dados nominais e exportação nominal dependem de concessão específica pela autoridade designada.
- Acúmulo de responsabilidades explícito; autoaprovação não passa a ser liberada pela reforma visual.
- Entrada canônica para novos acompanhamentos de hanseníase e tuberculose em Vigilância; mapas ESF anteriores permanecem identificados como arquivo/modelo de origem. Nenhuma equivalência incompleta é tratada como migração ou consolidação histórica concluída.
- Paleta SGC própria: fundo #F6F7F8, superfície branca, texto #1F2937 e ação #23704B. Sem assets, assinatura ou cores de marca QuaLean.

## Implementação e contrato

`ux_aps_v3` é um rollout de apresentação. Seu uso integrado exige Preview + ambiente staging + organização sintética explicitamente configurada. Produção e organização institucional não entram nessa interface. Override `SGC_UX_APS_V3=false` faz a reversão; demonstração local exige `SGC_UX_APS_V3=true`.

Nova navegação: Meu trabalho, Registros da equipe, Revisão e fechamento, Resultados, Qualidade e organização e Administração. As rotas antigas continuam disponíveis. Cada backend continua conferindo autorizações, independentemente de visibilidade no menu.

- `GET /api/v1/workspace/capabilities`: metadados de capacidades efetivas por área/equipe, conferidos com o JWT; não retorna registros nominais ou snapshots.
- `GET /api/v1/work-items`: entregas por competência/equipe/área, totais integrais da fonte mensal, filtro por situação/pesquisa e paginação de 25; não retorna nomes de pessoas acompanhadas.
- Listas de equipes visíveis não são interpretadas como permissão de produção. Totais de uma equipe jamais são atribuídos às demais.
- Visão municipal de Vigilância exige a concessão municipal na RPC existente, além do vínculo da organização. Um vínculo organizacional isolado não concede essa consolidação.
- Produção V3 separa novo lançamento, lista, mapa/fechamento e consolidação anual. Vigilância separa registros, consolidação e fechamento/relatórios, preservando filtros, versões e retry.
- Administração agrupa por identidade verificada, mostra vínculos existentes como Personalizado legado e apresenta prévia humana do convite. Não se deduz acesso nominal de um perfil.

A migration de preparação sintética cria uma RPC adicional; sua aplicação não altera flags ou registros. Invocada por administrador ativo da organização sintética, ela insere apenas flags ausentes para testes de produção e do rollout V3. Não substitui configurações explicitamente desabilitadas nem aprova catálogos institucionais.

## Sequência e aceite

1. Protótipo funcional: início, registrar, pendências e gestão de acesso, com demonstração declarada.
2. Jornada real sintética de produção → revisão → devolução/correção → fechamento → PDF/Excel.
3. Entrada canônica dos acompanhamentos e preservação dos arquivos anteriores; validar o mapa de equivalências antes de derivar documentos de campos ainda ausentes.
4. Consistência nas demais rotinas e rascunhos cifrados; a nova aparência não equivale a homologar uma fila offline inédita.
5. Preview, regressão multiusuário/multiUBS, sessão observada e validação física antes de promoção institucional.

O estado de execução e as evidências serão registrados após cada rodada. Testes sintéticos e emulação não substituem aceite observado, leitor de tela ou aparelhos físicos. Nenhuma publicação de produção está autorizada nesta entrega.
