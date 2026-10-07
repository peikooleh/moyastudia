param(
    [int]$ReadinessTimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$runtimeDir = Join-Path $repoRoot '.dev-runtime'

function Test-ServiceReady([string]$Name) {
    try {
        if ($Name -eq 'frontend') {
            $response = Invoke-WebRequest -Uri 'http://localhost:3000/' -Method Get -TimeoutSec 3 -UseBasicParsing
            if ([int]$response.StatusCode -ne 200 -or [string]::IsNullOrWhiteSpace($response.Content)) { return $false }
            # Validate the actual Next page and its referenced client scripts without emulating a browser.
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
        return ($body.ok -eq $true)
    } catch { return $false }
}

function Get-PortListeners([int]$Port) {
    try {
        $output = @(& "$env:SystemRoot\System32\netstat.exe" -ano -p tcp 2>&1)
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) { throw "netstat exited with code $exitCode. $($output -join ' ')" }

        $pids = @(
            foreach ($line in $output) {
                $columns = ([string]$line).Trim() -split '\s+'
                if ($columns.Count -ge 5 -and $columns[0] -eq 'TCP' -and $columns[3] -eq 'LISTENING' -and
                    $columns[1] -match ':(\d+)$' -and [int]$Matches[1] -eq $Port -and $columns[4] -match '^\d+$') {
                    [int]$columns[4]
                }
            }
        )
        return @($pids | Sort-Object -Unique)
    } catch { throw "Cannot safely inspect port ${Port}: $_" }
}

function Test-RegisteredTreeOwnsPort([string]$Name, [int]$Port) {
    $metadataPath = Join-Path $runtimeDir "$Name.json"
    if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) { return $false }
    try { $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json } catch { return $false }
    if ($metadata.service -ne $Name -or -not $metadata.pid -or -not $metadata.commandLine -or -not $metadata.executablePath -or -not $metadata.processStartTime) { return $false }
    $rootPid = [int]$metadata.pid
    $root = Get-CimInstance Win32_Process -Filter "ProcessId = $rootPid" -ErrorAction SilentlyContinue
    if (-not $root -or $root.CommandLine -ne $metadata.commandLine -or $root.ExecutablePath -ne $metadata.executablePath) { return $false }
    try {
        $actualStart = (Get-Process -Id $rootPid -ErrorAction Stop).StartTime.ToUniversalTime()
        $expectedStart = ([datetime]::Parse($metadata.processStartTime)).ToUniversalTime()
        if ([math]::Abs(($actualStart - $expectedStart).TotalSeconds) -ge 2) { return $false }
    } catch { return $false }
    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $parentByPid = @{}
    foreach ($item in $all) { $parentByPid[[int]$item.ProcessId] = [int]$item.ParentProcessId }
    $listeners = @(Get-PortListeners $Port)
    if ($listeners.Count -eq 0) { return $false }
    foreach ($listenerPid in $listeners) {
        $current = [int]$listenerPid
        $owned = $false
        $seen = @{}
        while ($current -gt 0 -and -not $seen.ContainsKey($current)) {
            $seen[$current] = $true
            if ($current -eq $rootPid) { $owned = $true; break }
            if (-not $parentByPid.ContainsKey($current)) { break }
            $current = $parentByPid[$current]
        }
        if (-not $owned) { return $false }
    }
    return $true
}

function Wait-ServiceReady([string]$Name) {
    $until = (Get-Date).AddSeconds($ReadinessTimeoutSeconds)
    do {
        if (Test-ServiceReady $Name) { return $true }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $until)
    return $false
}

function Start-ManagedService([string]$Name, [int]$Port, [string]$WorkingDirectory, [string]$FilePath, [string]$Arguments, [string]$CommandMarker) {
    if (Test-ServiceReady $Name) {
        if (Test-RegisteredTreeOwnsPort $Name $Port) {
            Write-Host "$Name is already ready and owned by its registered MoyaStudia process tree; leaving it running."
            return $true
        }
        $listeners = @(Get-PortListeners $Port)
        Write-Error "$Name responds successfully but ownership is not proven for port $Port (listener PID(s): $($listeners -join ', ')). This may be unverified due to CIM access denial; it is not proof of an unrelated process. No process was stopped or registered. Retry read-only ownership verification with the environment's standard elevated/approval execution before continuing."
        return $false
    }

    $listeners = @(Get-PortListeners $Port)
    if ($listeners.Count -gt 0) {
        $details = foreach ($listenerPid in $listeners) {
            try {
                $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $listenerPid" -ErrorAction Stop
                if ($owner) { "PID $listenerPid ($($owner.CommandLine))" } else { "PID $listenerPid (absent during inspection)" }
            } catch { "PID $listenerPid (ownership unverified; CIM error: $($_.Exception.Message))" }
        }
        Write-Error "$Name is not ready, but port $Port is occupied by $($details -join '; '). No process was stopped. Access denied is unverified, not unrelated; retry read-only ownership verification with the environment's standard elevated/approval execution before continuing."
        return $false
    }

    # Fail before spawning anything when process ownership cannot be inspected.
    try { Get-CimInstance Win32_Process -ErrorAction Stop | Out-Null } catch {
        Write-Error "Cannot inspect Windows process ownership; $Name was not started: $_"
        return $false
    }
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    $stdoutPath = Join-Path $runtimeDir "$Name.stdout.log"
    $stderrPath = Join-Path $runtimeDir "$Name.stderr.log"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    Start-Sleep -Milliseconds 300
    $process.Refresh()
    if ($process.HasExited) {
        Write-Error "$Name launcher exited before readiness. See $stderrPath"
        return $false
    }
    try { $cimProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction Stop } catch {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        Write-Error "$Name launcher ownership could not be recorded; stopped the just-created launcher PID $($process.Id). Error: $_"
        return $false
    }
    $metadata = [ordered]@{
        service = $Name
        pid = $process.Id
        processStartTime = $process.StartTime.ToUniversalTime().ToString('o')
        executablePath = $cimProcess.ExecutablePath
        commandLine = $cimProcess.CommandLine
        commandMarker = $CommandMarker
        workingDirectory = $WorkingDirectory
        port = $Port
        startedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runtimeDir "$Name.json") -Encoding UTF8

    if (Wait-ServiceReady $Name) {
        Write-Host "$Name is ready (PID $($process.Id))."
        return $true
    }
    Write-Error "$Name did not become ready within $ReadinessTimeoutSeconds seconds. PID $($process.Id) remains registered; see logs in $runtimeDir"
    return $false
}

$ok = $true
$npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Error 'npm.cmd was not found; frontend was not started.'
    $ok = $false
} else {
    $npmPath = $npm.Source
    $frontendArgs = "/d /s /c `"call `"$npmPath`" run dev`""
    if (-not (Start-ManagedService 'frontend' 3000 (Join-Path $repoRoot 'apps\web') 'cmd.exe' $frontendArgs $npmPath)) { $ok = $false }
}

$pythonPath = Join-Path $repoRoot 'apps\api\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    Write-Error "Backend Python executable not found: $pythonPath"
    $ok = $false
} else {
    $backendArgs = '-m uvicorn app.main:app --host 127.0.0.1 --port 8000'
    if (-not (Start-ManagedService 'backend' 8000 (Join-Path $repoRoot 'apps\api') $pythonPath $backendArgs 'uvicorn app.main:app')) { $ok = $false }
}

if (-not $ok) { exit 1 }
