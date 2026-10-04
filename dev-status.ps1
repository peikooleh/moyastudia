$ErrorActionPreference = 'Continue'
$runtimeDir = Join-Path $PSScriptRoot '.dev-runtime'

function Get-PortListeners([int]$Port) {
    $output = @(& "$env:SystemRoot\System32\netstat.exe" -ano -p tcp 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Cannot inspect port ${Port}: $($output -join ' ')" }
    @(
        foreach ($line in $output) {
            $columns = ([string]$line).Trim() -split '\s+'
            if ($columns.Count -ge 5 -and $columns[0] -eq 'TCP' -and $columns[3] -eq 'LISTENING' -and
                $columns[1] -match ':(\d+)$' -and [int]$Matches[1] -eq $Port -and $columns[4] -match '^\d+$') {
                [int]$columns[4]
            }
        }
    ) | Sort-Object -Unique
}

function Test-ServiceReady([string]$Name) {
    try {
        if ($Name -eq 'frontend') {
            $response = Invoke-WebRequest -Uri 'http://localhost:3000/' -Method Get -TimeoutSec 3 -UseBasicParsing
            if ([int]$response.StatusCode -ne 200 -or [string]::IsNullOrWhiteSpace($response.Content)) { return $false }
            $scriptPaths = [regex]::Matches([string]$response.Content, '(?i)src=["'']([^"'']*\/_next\/[^"'']+\.js(?:\?[^"'']*)?)["'']')
            if ($scriptPaths.Count -eq 0) { return $false }
            foreach ($match in $scriptPaths) {
                $scriptUri = [uri]::new([uri]'http://localhost:3000/', $match.Groups[1].Value)
                $scriptResponse = Invoke-WebRequest -Uri $scriptUri.AbsoluteUri -Method Get -TimeoutSec 3 -UseBasicParsing
                if ([int]$scriptResponse.StatusCode -ne 200 -or [string]::IsNullOrWhiteSpace($scriptResponse.Content)) { return $false }
            }
            return $true
        }
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/health' -Method Get -TimeoutSec 3 -UseBasicParsing
        if ([int]$response.StatusCode -ne 200) { return $false }
        $body = $response.Content | ConvertFrom-Json
        return ($body.ok -eq $true -and $body.db -eq $true)
    } catch { return $false }
}

function Test-RootMatchesMetadata($Metadata) {
    if (-not $Metadata -or -not $Metadata.pid -or -not $Metadata.commandLine -or -not $Metadata.executablePath -or -not $Metadata.processStartTime) { return $false }
    $root = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$Metadata.pid)" -ErrorAction SilentlyContinue
    if (-not $root -or $root.CommandLine -ne $Metadata.commandLine -or $root.ExecutablePath -ne $Metadata.executablePath) { return $false }
    try {
        $actual = (Get-Process -Id ([int]$Metadata.pid) -ErrorAction Stop).StartTime.ToUniversalTime()
        $expected = ([datetime]::Parse($Metadata.processStartTime)).ToUniversalTime()
        return ([math]::Abs(($actual - $expected).TotalSeconds) -lt 2)
    } catch { return $false }
}

$allProcesses = @()
$processInspectionError = $null
try { $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop) } catch { $processInspectionError = $_.Exception.Message }
$parentByPid = @{}
foreach ($process in $allProcesses) { $parentByPid[[int]$process.ProcessId] = [int]$process.ParentProcessId }

foreach ($service in @(@{ Name = 'frontend'; Port = 3000 }, @{ Name = 'backend'; Port = 8000 })) {
    $metadataPath = Join-Path $runtimeDir "$($service.Name).json"
    $metadata = $null
    if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
        try { $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json } catch { Write-Warning "Invalid metadata: $metadataPath" }
    }
    if ($metadata -and $metadata.service -ne $service.Name) { Write-Warning "$($service.Name): metadata service name mismatch; ownership cannot be established."; $metadata = $null }

    $recordedPid = if ($metadata) { [int]$metadata.pid } else { $null }
    $rootManaged = $false
    $rootInspectionUnverified = $false
    if ($metadata -and -not $processInspectionError) {
        try { $rootManaged = Test-RootMatchesMetadata $metadata } catch { $rootInspectionUnverified = $true }
    }
    $listeners = @()
    $portInspectionFailed = $false
    try { $listeners = @(Get-PortListeners $service.Port) } catch { $portInspectionFailed = $true; Write-Warning $_ }

    $listenerOwnership = @()
    foreach ($listenerPid in $listeners) {
        $current = [int]$listenerPid
        $managed = $false
        $verified = -not $processInspectionError
        $seen = @{}
        while ($verified -and $current -gt 0 -and -not $seen.ContainsKey($current)) {
            $seen[$current] = $true
            if (-not $parentByPid.ContainsKey($current)) { $verified = $false; break }
            if ($metadata -and $current -eq $recordedPid) {
                if ($rootManaged) { $managed = $true } else { $verified = $false }
                break
            }
            $current = $parentByPid[$current]
        }
        if ($seen.ContainsKey($current)) { $verified = $false }
        $listenerOwnership += [pscustomobject]@{ Pid = [int]$listenerPid; Managed = $managed; Verified = ($managed -or $verified) }
    }

    $ready = Test-ServiceReady $service.Name
    $ownership = if ($portInspectionFailed) { 'unverified' } elseif ($listeners.Count -eq 0) { 'none' } elseif (@($listenerOwnership | Where-Object { -not $_.Verified }).Count -gt 0) { 'unverified' } elseif (@($listenerOwnership | Where-Object Managed).Count -eq $listeners.Count) { 'managed' } elseif (@($listenerOwnership | Where-Object Managed).Count -gt 0) { 'mixed' } else { 'unrelated' }
    $portState = if ($portInspectionFailed) { 'unavailable' } elseif ($listeners.Count -eq 0) { 'free' } else { 'occupied' }
    $runtimePids = if ($listeners.Count -gt 0) { ($listeners -join ',') } else { 'none' }
    $launcherLabel = if ($null -eq $recordedPid) { 'none' } elseif ($rootManaged) { [string]$recordedPid } else { "$recordedPid (stale/unverified)" }
    Write-Host ("{0}: readiness={1}; launcher PID={2}; runtime/listener PID={3}; ownership={4}; port={5}" -f $service.Name, $ready, $launcherLabel, $runtimePids, $ownership, $portState)
    if ($ownership -eq 'unverified') {
        $reason = if ($processInspectionError) { $processInspectionError } elseif ($rootInspectionUnverified) { 'registered launcher identity could not be inspected' } else { 'listener ancestry could not be established' }
        Write-Host "  ownership unverified; no process may be stopped. CIM: $reason"
    }
    foreach ($item in $listenerOwnership | Where-Object { $_.Verified -and -not $_.Managed }) {
        $owner = $allProcesses | Where-Object { [int]$_.ProcessId -eq $item.Pid } | Select-Object -First 1
        Write-Host ("  unrelated listener: PID={0}; command line={1}" -f $item.Pid, $owner.CommandLine)
    }
    if ($metadata -and -not $rootManaged) { Write-Host "  registered launcher is stale or cannot be verified; dev-stop will not terminate its PID." }
}
