# Deploy static build over SSH (OpenSSH: scp, ssh, tar).
# Requires key-based auth or ssh-agent.
#
#   $env:RH_DEPLOY_TARGET = "user@host"
#   $env:RH_DEPLOY_PATH   = "/PROGS/RH/www"
#   .\scripts\deploy.ps1

param(
  [string]$Target = $env:RH_DEPLOY_TARGET,
  [string]$RemotePath = $(if ($env:RH_DEPLOY_PATH) { $env:RH_DEPLOY_PATH } else { "/PROGS/RH/www" })
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

if (-not $Target) {
  Write-Host "Set deploy target:" -ForegroundColor Yellow
  Write-Host '  $env:RH_DEPLOY_TARGET = "user@host"' -ForegroundColor Cyan
  Write-Host '  $env:RH_DEPLOY_PATH   = "/PROGS/RH/www"' -ForegroundColor Cyan
  Write-Host "  .\scripts\deploy.ps1" -ForegroundColor Cyan
  exit 1
}

Write-Host "Building..." -ForegroundColor Gray
npm run build

$dist = Join-Path $root "dist"
if (-not (Test-Path -LiteralPath (Join-Path $dist "index.html"))) {
  Write-Error "Missing dist/index.html after build."
}

$bundle = Join-Path $root "deploy-bundle.tgz"
if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Force }

Write-Host "Packing dist..." -ForegroundColor Gray
tar -czf $bundle -C $dist .

Write-Host "Uploading to ${Target}..." -ForegroundColor Gray
scp $bundle "${Target}:/tmp/rh-web.tgz"

ssh $Target "mkdir -p $RemotePath && tar -xzf /tmp/rh-web.tgz -C $RemotePath && rm -f /tmp/rh-web.tgz"

Remove-Item -LiteralPath $bundle -Force

Write-Host "Done: $RemotePath on $Target" -ForegroundColor Green
Write-Host "Nginx SPA: see deploy/nginx-spa.example.conf" -ForegroundColor Gray
