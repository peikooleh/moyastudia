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

foreach ($service in @(@{ Name = 'frontend'; Port = 3000 }, @{ Name = 'backend'; Port = 8000 })) {
    $metadataPath = Join-Path $runtimeDir "$($service.Name).json"
    if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
        Write-Host "$($service.Name): no runtime metadata; nothing to stop."
        continue
    }
    try { $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json } catch {
        Write-Warning "$($service.Name): metadata is unreadable; leaving processes untouched."
        continue
    }
    if ($metadata.service -ne $service.Name -or -not $metadata.pid -or -not $metadata.commandLine -or -not $metadata.executablePath -or -not $metadata.processStartTime) {
        Write-Warning "$($service.Name): metadata is incomplete or mismatched; leaving it and all processes untouched."
        continue
    }

    $rootPid = [int]$metadata.pid
    try { $root = Get-CimInstance Win32_Process -Filter "ProcessId = $rootPid" -ErrorAction Stop } catch {
        Write-Warning "$($service.Name): ownership of registered PID $rootPid is unverified (CIM inspection failed); leaving metadata and all processes untouched. Error: $_"
        continue
    }
    if (-not $root) {
        Write-Host "$($service.Name): registered launcher PID $rootPid is absent; removing its stale project metadata."
        Remove-Item -LiteralPath $metadataPath -Force
        continue
    }
    $validRoot = ($root.CommandLine -eq $metadata.commandLine -and $root.ExecutablePath -eq $metadata.executablePath)
    if ($validRoot) {
        try {
            $actualStart = (Get-Process -Id $rootPid -ErrorAction Stop).StartTime.ToUniversalTime()
            $expectedStart = ([datetime]::Parse($metadata.processStartTime)).ToUniversalTime()
            $validRoot = ([math]::Abs(($actualStart - $expectedStart).TotalSeconds) -lt 2)
        } catch { $validRoot = $false }
    }
    if (-not $validRoot) {
        Write-Warning "$($service.Name): PID $rootPid does not match the registered launcher identity; leaving processes and metadata untouched."
        continue
    }

    # Build the complete descendant set from one process snapshot and stop deepest children first.
    try { $all = @(Get-CimInstance Win32_Process -ErrorAction Stop) } catch {
        Write-Warning "$($service.Name): process-tree ownership is unverified (CIM inspection failed); leaving processes and metadata untouched. Error: $_"
        continue
    }
    $parentByPid = @{}
    foreach ($item in $all) { $parentByPid[[int]$item.ProcessId] = [int]$item.ParentProcessId }
    $owned = @()
    foreach ($item in $all) {
        $candidatePid = [int]$item.ProcessId
        if ($candidatePid -eq $rootPid) { continue }
        $current = $candidatePid
        $depth = 0
        $seen = @{}
        while ($current -gt 0 -and $parentByPid.ContainsKey($current) -and -not $seen.ContainsKey($current)) {
            $seen[$current] = $true
            $current = $parentByPid[$current]
            $depth++
            if ($current -eq $rootPid) { $owned += [pscustomobject]@{ Pid = $candidatePid; Depth = $depth }; break }
        }
    }
    foreach ($child in ($owned | Sort-Object Depth -Descending)) { Stop-Process -Id $child.Pid -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $rootPid -Force -ErrorAction SilentlyContinue

    $deadline = (Get-Date).AddSeconds(8)
    do {
        Start-Sleep -Milliseconds 250
        $rootStillExists = [bool](Get-CimInstance Win32_Process -Filter "ProcessId = $rootPid" -ErrorAction SilentlyContinue)
        $ownedStillExists = @($owned | Where-Object { Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Pid)" -ErrorAction SilentlyContinue }).Count -gt 0
        if (-not $rootStillExists -and -not $ownedStillExists) { break }
    } while ((Get-Date) -lt $deadline)

    $remainingOwned = @($owned | Where-Object { Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Pid)" -ErrorAction SilentlyContinue })
    $rootStillExists = [bool](Get-CimInstance Win32_Process -Filter "ProcessId = $rootPid" -ErrorAction SilentlyContinue)
    if ($rootStillExists -or $remainingOwned.Count -gt 0) {
        Write-Warning "$($service.Name): registered process tree did not fully exit; metadata retained for another safe stop."
        continue
    }

    $listeners = @(Get-PortListeners $service.Port)
    if ($listeners.Count -eq 0) {
        Remove-Item -LiteralPath $metadataPath -Force
        Write-Host "$($service.Name): stopped registered launcher PID $rootPid and $($owned.Count) verified descendants; port $($service.Port) is free."
    } else {
        Write-Warning "$($service.Name): managed tree stopped, but port $($service.Port) remains occupied by PID(s) $($listeners -join ', '); no other process was stopped."
        Remove-Item -LiteralPath $metadataPath -Force
    }
}
