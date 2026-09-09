# Operação e implantação

## Ambientes

1. Desenvolvimento: `npm run dev` e Supabase local via `npm run db:start`.
2. Homologação: projeto Supabase e projeto Vercel exclusivos, com conteúdo sintético.
3. Piloto: projeto isolado, região de São Paulo e somente dados classificados como permitidos pelo gate vigente.

Copie `.env.example` para `.env.local`. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` ao navegador. No Supabase, desative cadastro público e configure SMTP. O endpoint interno `POST /api/v1/admin/invites` usa a chave privilegiada somente no servidor, valida previamente o papel administrativo do chamador e provisiona o vínculo via comando PostgreSQL autorizado.

Promova módulos com `POST /api/v1/admin/feature-flags`. Segurança do paciente e Ouvidoria exigem justificativa de aprovação e usam as chaves canônicas `safety_events` e `ombudsman`, que também são verificadas pelas políticas do banco.

## Banco

Execute migrations com a CLI do Supabase. Não altere tabelas manualmente pelo painel. Antes de promover, rode `npm run db:reset` e `npm run db:test` em um banco descartável.

Ative `pg_cron` no projeto hospedado e confirme a criação do job `sgc-refresh-due-notifications`. Ele reconcilia ações vencidas, estoque mínimo, lotes próximos do vencimento, atas pendentes e manutenções atrasadas, deduplicando por usuário e origem. Inspecione o histórico do job e os registros pendentes da outbox.

## Backup gratuito

O comando `npm run backup` exporta banco e bucket `evidence`, empacota e cifra o conteúdo. Configure:

- `SGC_BACKUP_DIR`: pasta externa controlada pela instituição;
- `SGC_BACKUP_KEY`: chave AES com 64 caracteres hexadecimais, mantida fora do servidor.

Agende diariamente numa estação administrativa. Verifique cada arquivo com `npm run backup:verify -- <arquivo>` e faça restauração mensal em projeto descartável. A exclusão e retenção dos backups dependem da política institucional aprovada.

Para o ensaio mensal, execute `npm run backup:prepare-restore -- <arquivo.backup.enc> <pasta-nova>`. O comando autentica, descriptografa e extrai o dump sem alterar nenhum banco. Restaure o `database.sql` e o conteúdo de `storage` exclusivamente em projeto Supabase descartável; depois execute pgTAP, valide contagens, hashes de anexos e registre o resultado do exercício.

## Carga

Com o build de produção em execução, rode `k6 run tests/load/k6-smoke.js`. O cenário sobe gradualmente até 50 usuários virtuais e exige menos de 1% de falhas, mais de 99% de checks e latência p95 inferior a 1,5 segundo. Em homologação autenticada, forneça `BASE_URL` e configure a sessão de teste conforme a política institucional.

## Gates

O uso institucional exige validação dos termos do plano da Vercel. Antes de dados restritos: Supabase e Vercel pagos, backup externo testado, matriz de acesso, retenção, inventário de dados, responsabilidades LGPD e resposta a incidentes.

## Incidentes

Revogue o usuário e os dispositivos afetados, preserve logs, interrompa sincronizações suspeitas e acione o responsável institucional. Como dispositivos podem operar por até 72 horas sem rede, a revogação remota torna-se efetiva na próxima conexão ou ao expirar o cofre.
