$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$env:NODE_OPTIONS = '--max-old-space-size=512 --max-semi-space-size=4'
$env:SGC_STAGING_ACCOUNTS_FILE = Join-Path $taskRoot '.env.staging.accounts.local'
$env:SGC_STAGING_REVOKE_DEVICE = 'false'
Write-Host 'SGC-UBS: testes exclusivos no Preview. Nenhuma publicacao de producao.'
Write-Host 'Entre na Vercel na janela do Chrome que sera aberta. Nao informe senhas no chat.'
Write-Host 'Depois do login, a suite aguardara liberacao do operador para o commit verificado.'
& node scripts/run-hosted-staging.mjs
Write-Host ('Processo encerrado com codigo ' + $LASTEXITCODE)
