# SGC-UBS

Sistema de Gestão do Conhecimento e apoio à gestão integrada de Unidades Básicas de Saúde. A aplicação transforma protocolos em execução rastreável, evidências, indicadores, tratamento de desvios e aprendizado institucional.

## Desenvolvimento

Requisitos: Node.js 20.9+ e Docker para o Supabase local.

```bash
npm install
npm run db:start
npm run db:reset
npm run dev
```

Sem variáveis do Supabase, o app inicia em modo de demonstração. Para integração real, configure `.env.local` a partir de `.env.example`.

## Qualidade

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run db:test
```

## Estrutura

- `src/app`: páginas e API `/api/v1`.
- `src/lib/domain`: contratos, RBAC e motor seguro de fórmulas.
- `src/lib/offline`: cofre criptografado e fila local.
- `supabase/migrations`: modelo completo, RLS, auditoria, eventos e jobs.
- `docs`: decisões arquiteturais e runbook operacional.

Importações seguem duas etapas: `POST /api/v1/imports/preview?type=...` registra e valida o XLSX; `POST /api/v1/imports/{id}/commit` confirma toda a carga em uma única transação. Em ambiente integrado, a prévia recebe `organizationId` e, quando aplicável, `unitId` no formulário multipart.

Este repositório entrega a implementação executável das ondas 0–7: ciclo operacional completo, qualidade, pessoas, patrimônio, estoque, módulos sensíveis governados e artefatos de consolidação. As ondas posteriores ao núcleo são promovidas por feature flags; a disponibilidade técnica não substitui os gates institucionais descritos em `docs/IMPLEMENTATION_STATUS.md`.
