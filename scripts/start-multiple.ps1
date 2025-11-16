param(
    [string]$ConfigPath = "servers.json",
    [string]$Shell = "pwsh",
    [string]$Python = "python"
)

$scriptPath = Join-Path -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) -ChildPath "start-server.ps1"
if (-not (Test-Path -Path $scriptPath)) {
    Write-Error "start-server.ps1 not found at $scriptPath"
    exit 1
}

if (-not (Test-Path -Path $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath"
    exit 1
}

try {
    $configJson = Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
} catch {
    Write-Error "Failed to parse $ConfigPath : $($_.Exception.Message)"
    exit 1
}

if ($null -eq $configJson) {
    Write-Error "Config is empty"
    exit 1
}

if ($configJson -isnot [System.Collections.IEnumerable]) {
    $configEntries = @($configJson)
} else {
    $configEntries = $configJson
}

foreach ($entry in $configEntries) {
    $argumentList = @('-File', $scriptPath)

    $pythonExec = $entry.Python
    if (-not [string]::IsNullOrWhiteSpace($pythonExec)) {
        $argumentList += '-Python'
        $argumentList += $pythonExec
    } else {
        $argumentList += '-Python'
        $argumentList += $Python
    }

    if ($entry.DbPath) {
        $argumentList += '-DbPath'
        $argumentList += [string]$entry.DbPath
    }

    if ($entry.Port) {
        $argumentList += '-Port'
        $argumentList += [string]$entry.Port
    }

    if ($entry.TableName) {
        $argumentList += '-TableName'
        $argumentList += [string]$entry.TableName
    }

    if ($entry.IdField) {
        $argumentList += '-IdField'
        $argumentList += [string]$entry.IdField
    }

    if ($entry.ParentField) {
        $argumentList += '-ParentField'
        $argumentList += [string]$entry.ParentField
    }

    if ($entry.AutoBootstrap) {
        $argumentList += '-AutoBootstrap'
    }

    $workingDir = Split-Path -Parent $scriptPath

    Start-Process -FilePath $Shell -ArgumentList $argumentList -WorkingDirectory $workingDir
}
