param([int]$CacheMinutes = 5)

$cacheFile = "$env:USERPROFILE\.claude\scripts\.balance-cache"
$apiKey = $env:ANTHROPIC_AUTH_TOKEN
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Return cached value if fresh
if (Test-Path $cacheFile) {
    $cache = Get-Content $cacheFile -Raw | ConvertFrom-Json
    if (((Get-Date) - [datetime]$cache.timestamp).TotalMinutes -lt $CacheMinutes) {
        Write-Host $cache.display
        exit 0
    }
}

try {
    $headers = @{ "Authorization" = "Bearer $apiKey" }
    $resp = Invoke-RestMethod -Uri "https://api.deepseek.com/user/balance" -Headers $headers -TimeoutSec 5
    $b = $resp.balance_infos[0]
    $display = if ($b.currency -eq "CNY") { "DS:$($b.total_balance) CNY" } else { "DS:`$ $($b.total_balance)" }

    @{ timestamp = (Get-Date).ToString("o"); display = $display } | ConvertTo-Json | Set-Content $cacheFile
    Write-Host $display
} catch {
    if (Test-Path $cacheFile) {
        Write-Host (Get-Content $cacheFile -Raw | ConvertFrom-Json).display
    } else {
        Write-Host "DS: N/A"
    }
}
