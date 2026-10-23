function Invoke-KlayNativeCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $FilePath,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]] $ArgumentList
  )

  if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
    throw "Required native command is missing: $FilePath"
  }

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell 5.1 turns native stderr into ErrorRecords. With Stop,
    # routine stderr can terminate before LASTEXITCODE is inspected. Continue
    # only for this invocation; preserve all text and judge success by exit code.
    $ErrorActionPreference = 'Continue'
    $rawOutput = @(& $FilePath @ArgumentList 2>&1)
    $nativeExitCode = $LASTEXITCODE
  }
  catch {
    throw "Could not start native command '$FilePath': $($_.Exception.Message)"
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($null -eq $nativeExitCode) {
    throw "Native command '$FilePath' did not provide an exit code; refusing to continue."
  }

  $outputLines = @($rawOutput | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() }
    else { [string]$_ }
  })

  [pscustomobject]@{
    ExitCode = [int]$nativeExitCode
    Output = [string[]]$outputLines
  }
}

function Write-KlayNativeOutput {
  param([Parameter(Mandatory = $true)] $Result)
  foreach ($line in $Result.Output) {
    Write-Host $line
  }
}
