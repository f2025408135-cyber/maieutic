# scripts/setup-env.ps1
# Set console encoding to UTF-8 to prevent any encoding issues
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$rootDir = Split-Path -Parent $PSScriptRoot
$envLocalPath = Join-Path $rootDir ".env.local"
$envExamplePath = Join-Path $rootDir ".env.example"

# 1. Create .env.local if it doesn't exist
if (-not (Test-Path $envLocalPath)) {
    Write-Host "[i] Creating .env.local from .env.example..." -ForegroundColor Cyan
    if (Test-Path $envExamplePath) {
        Copy-Item $envExamplePath $envLocalPath
    } else {
        Write-Error "Could not find .env.example at $envExamplePath"
        exit 1
    }
}

# 2. Check if an API key is configured
$envLocal = Get-Content -Path $envLocalPath -ErrorAction SilentlyContinue
$hasKey = $false

if ($envLocal) {
    foreach ($line in $envLocal) {
        if ($line -match '^\s*(GEMINI_API_KEY|OPENROUTER_API_KEY|ANTHROPIC_API_KEY)\s*=\s*(.+)$') {
            $val = $Matches[2].Trim()
            # Check that it's not a placeholder
            if ($val -and -not ($val -match 'your-key-here' -or $val -match 'placeholder' -or $val -eq '')) {
                $hasKey = $true
                break
            }
        }
    }
}

# 3. If no key is set, prompt the user
if (-not $hasKey) {
    Write-Host ""
    Write-Host "=======================================================================" -ForegroundColor Yellow
    Write-Host "  [!] NO ACTIVE API KEY FOUND IN .env.local" -ForegroundColor Yellow
    Write-Host "=======================================================================" -ForegroundColor Yellow
    Write-Host "  Maieutic requires an AI API key to function."
    Write-Host "  Google Gemini API is free and recommended."
    Write-Host "  Get a key at: https://aistudio.google.com/app/apikey"
    Write-Host ""
    
    $key = Read-Host "  Enter your Gemini API Key (or press Enter to skip)"
    
    if ($key) {
        $key = $key.Trim()
        $content = Get-Content $envLocalPath
        $updated = @()
        $replaced = $false
        
        foreach ($line in $content) {
            if ($line -match '^\s*GEMINI_API_KEY\s*=') {
                $updated += "GEMINI_API_KEY=$key"
                $replaced = $true
            } else {
                $updated += $line
            }
        }
        
        if (-not $replaced) {
            $updated += "GEMINI_API_KEY=$key"
        }
        
        $updated | Set-Content $envLocalPath
        Write-Host "  [OK] Gemini API Key saved to .env.local." -ForegroundColor Green
    } else {
        Write-Host "  [!] Skipping key setup. Remember to add it manually to .env.local." -ForegroundColor Cyan
    }
}
