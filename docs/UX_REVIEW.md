# Revisão da experiência MVP V2

## Entrega local

Paleta revisada após o usuário rejeitar a combinação multicolorida de Acaraú. A squad (direção visual, acessibilidade e cobertura da interface) identificou competição entre lateral laranja, avatar turquesa, marca amarela e quatro bordas decorativas dos indicadores. A direção “Institucional sereno” usa lateral/login `#133D3A`, ação principal `#146B62`, hover `#0F544D`, fundo `#F4F7F6`, superfície branca e acento dourado `#D5A14A` somente na marca. Textos `#203631`/`#596F68`, seleção `#E3F0EC` e foco claro sobre a lateral escura. São escolhas de interface, não códigos oficiais de marca. Alertas e situações preservam suas cores semânticas. O tema fica isolado em `.ux-v2`, mantendo a interface legada para reversão; ícone, metadados PWA e contingência offline acompanham a identidade compartilhada. Sem alteração de fluxos, dados, autenticação ou flags de produção.

Tipografia sem serifa, componentes compartilhados, login/recuperação, navegação móvel completa, menu de conta e escopo de organização/UBS validado no servidor. Listagens de 25 itens, totais reais, filtros na URL e páginas dedicadas de cadastro/detalhe preservam o retorno à lista.

Detalhes conectam os comandos existentes de Conhecimento, Protocolos, Execuções, Indicadores, Metas, Melhoria e Reuniões. Checklist/respostas ganharam comandos transacionais próprios. Fórmulas usam editor estruturado. Evidências têm envio privado, verificação de integridade e download temporário.

O cofre salva e recupera explicitamente rascunhos (incluindo checklist/fórmula), isola conta/organização e mantém tentativas idempotentes. O sincronizador preserva erros/conflitos e envia lotes de até 100. Isso **não** constitui offline completo: reinício sem rede abre somente a tela pública de contingência, anexos dependem de conexão e a resolução auditada de conflitos ainda precisa de integração.

## Executar a revisão

```powershell
$env:SGC_DEMO_MODE='true'
npm run dev -- -p 3102
```

Abra http://localhost:3102. Dados e respostas de demonstração não comprovam persistência. Remova a variável de ambiente ao encerrar esta sessão de demonstração.

Para homologação real, usar Supabase de teste com migrations 025–031 aplicadas e usuários sintéticos convidados, escopos distintos e matriz autorizada. `ux_mvp_v2` é false por padrão; override `SGC_UX_V2=true` só é aceito em Vercel preview. A produção não foi alterada. Não aplicar as migrations permanentemente antes de definir o ambiente de revisão.

## Evidências verificadas

- Revisão da paleta: compilação, TypeScript, lint e 41 testes unitários passaram; 30 testes Chromium desktop/mobile passaram (27,4s), incluindo contraste de CTA normal/hover, textos da lateral/login, seleção/foco, bordas dos campos, alerta de recuperação, diálogos e viewport de 320px. Capturas de Login, Protocolos e Administração inspecionadas; sem bloqueios visuais encontrados pela squad. Rodada local em demonstração, não homologação autenticada nem certificação completa WCAG.
- TypeScript, lint e compilação Next aprovados durante a integração.
- 41 testes unitários aprovados: contexto, escopo, API, fórmulas, acesso e reconciliação de 55/6/61 registros.
- 122 asserções PostgreSQL aprovadas: 28 do ciclo/checklist/idempotência, 5 de responsáveis e 89 de regressão. Executadas no banco por JWT simulado, em transações isoladas, com rollback obrigatório de DDL, fixtures, auditoria e outbox. Não equivalem a testes pela interface autenticada.
- 26 jornadas Chromium aprovadas na rodada final completa (25,1s); incluem viewport 320px, navegação, foco, cadastro e recuperação do rascunho após recarregar, verificando ausência do texto em claro no IndexedDB.
- WebKit não homologado: encerramento do navegador antes de assertions e falha de memória no servidor de testes. Repetir em ambiente estável, além de iPhone físico.

Scripts: `npm run typecheck`, `npm run lint`, `node node_modules/vitest/vitest.mjs run src --maxWorkers=1`, `npm run build`, `node node_modules/@playwright/test/cli.js test --workers=1`.

`scripts/test-ux-sql-rollback.mjs --token-file CAMINHO --ref REFERENCIA` lê o token sem exibi-lo e testa somente com rollback. `scripts/build-mvp-validation.mjs` compõe as transações. Não fornecer tokens como valores na linha de comando nem versioná-los.

## Próximo aceite obrigatório

1. Jornada autenticada Conhecimento → publicação → execução/respostas/evidência → medição/meta → análise/desvio → plano/ação/eficácia → reunião, sem SQL ou chamadas manuais para executar o fluxo.
2. Dois perfis e duas UBS reais de teste, inclusive executor com acesso mínimo à configuração do cálculo, testes de falha/409 e telas de reconciliação.
3. Completar offline, anexos pendentes, bootstrap/deltas cifrados e resolução autorizada preservando ambas as versões.
4. Validar leitor de tela, zoom 200%, instalação/persistência física e sessão observada com gerente.
5. Só então habilitar `ux_mvp_v2` para Paulo VI. Reversão pela flag mantém os dados; a interface anterior não ganha as novas funcionalidades.

SMTP, backup externo/restauração, contratos e aprovações institucionais continuam em trilha separada. Nenhum conteúdo clínico foi criado e nenhuma onda posterior foi habilitada.
