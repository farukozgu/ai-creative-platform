$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Parse-KlayMigrationHistory.ps1')

$migrationDir = Join-Path $PSScriptRoot '..\..\database\migrations'
$expected = @(Get-ChildItem -LiteralPath $migrationDir -Filter '*.sql' -File | ForEach-Object {
  if ($_.BaseName -cnotmatch '^(\d{14})(?:_|$)') { throw 'Malformed repository migration filename.' }
  $Matches[1]
} | Sort-Object)
if ($expected.Count -ne 40 -or $expected -notcontains '20261101020000' -or $expected -notcontains '20261101030000') { throw 'Repository must contain the complete 40-version repaired baseline.' }
$positiveLines = @(
  'Initialising login role...'
  'Connecting to remote database...'
  ''
  ' | Local | Remote | Time (UTC) | '
  ' | --- | :---: | --- | '
)
foreach ($version in $expected) {
  $positiveLines += (' | `{0}` | `{0}` | 2026-01-01 00:00:00 | ' -f $version)
}
$result = ConvertFrom-KlayMigrationHistory -OutputLines $positiveLines -LocalVersions $expected -ExitCode 0
if ($result.Count -ne 40 -or $result.LocalVersions.Count -ne 40 -or $result.RemoteVersions.Count -ne 40) {
  throw 'Positive Markdown-like history did not produce exactly 40 parsed versions.'
}
Write-Host 'PASS: 40 repository filename versions match Markdown table rows with progress, whitespace, outer pipes, and backticks.'
$pending = @(Get-ChildItem -LiteralPath $migrationDir -Filter '20261101030000_*.sql' -File)
if ($pending.Count -ne 1) { throw 'Expected exactly one uniquely named prepared F07 migration.' }
$afterExpected = @($expected)
$afterLines = @($positiveLines)
Write-Host 'PASS: repaired baseline contains all 40 filename/Local/Remote versions.'

# Reproduce the CLI's unbordered table (including its local-only pending row).
# The cell parser also accepts Markdown borders and a code-quoted empty cell;
# the former raw-line regex could not reliably handle these formats.
$inspectionBase = @('Initialising login role...', '   Local | Remote | Time (UTC)', '  -----------|------------|---------------------')
foreach ($version in $expected | Where-Object { $_ -ne '20261101030000' }) { $inspectionBase += ('  {0} | {0} | 2026-01-01 00:00:00' -f $version) }
$pendingLines = @($inspectionBase + '  20261101030000 |                | 2026-11-01 03:00:00')
foreach ($pendingRow in @('  20261101030000 |                | 2026-11-01 03:00:00',
    '  20261101030000 |                |',
    '| `20261101030000` | `` | ignored timestamp |')) {
  $parsed = ConvertFrom-KlayMigrationHistory -OutputLines @($inspectionBase + $pendingRow) -LocalVersions $afterExpected -ExitCode 0 -ExpectedCount 40 -F07MigrationStateInspection
  if ($parsed.InstallationComplete -or $parsed.Count -ne 40 -or $parsed.RemoteVersions.Count -ne 39 -or
      $parsed.PendingVersions.Count -ne 1 -or $parsed.PendingVersions[0] -cne '20261101030000') { throw 'Pending inspection falsely reported installation equality.' }
}
$recorded = ConvertFrom-KlayMigrationHistory -OutputLines $afterLines -LocalVersions $afterExpected -ExitCode 0 -ExpectedCount 40 -F07MigrationStateInspection
if (-not $recorded.InstallationComplete -or $recorded.PendingVersions.Count) { throw 'Recorded inspection parsing failed.' }
Write-Host 'PASS: inspection accepts exact 39 recorded + pending F07 and exact 40 recorded.'

function Assert-InspectionRejected([string] $Label, [string[]] $Lines, [int] $Code=0, [switch] $Strict, [string[]] $Local=$afterExpected) {
  $rejected=$false
  try { $null=ConvertFrom-KlayMigrationHistory -OutputLines $Lines -LocalVersions $Local -ExitCode $Code -ExpectedCount 40 -F07MigrationStateInspection:(-not $Strict) }
  catch { $rejected=$true }
  if (-not $rejected) { throw "Inspection parser accepted: $Label" }
  Write-Host "PASS: inspection/history boundary rejects $Label."
}
Assert-InspectionRejected 'pending F07 in strict post-repair tests' $pendingLines -Strict
Assert-InspectionRejected 'missing pending row' $inspectionBase
Assert-InspectionRejected 'duplicate pending row' @($pendingLines + $pendingLines[-1])
Assert-InspectionRejected 'extra remote version' @($pendingLines + ' | 20261101040000 | extra |')
Assert-InspectionRejected 'nonzero CLI exit' $pendingLines -Code 17
Assert-InspectionRejected 'empty output' @()
Assert-InspectionRejected 'unexpected row before header' (@('20261101040000 | 20261101040000 | ignored') + $pendingLines)
Assert-InspectionRejected 'truncated history' @($pendingLines[0..($pendingLines.Count-3)] + $pendingLines[-1])
$bad=@($pendingLines); $bad[3]=(' {0} | | ignored' -f $expected[0])
Assert-InspectionRejected 'missing historical Remote version' $bad
$bad=@($pendingLines); $bad[3]=(' {0} | {0} | ignored' -f '20260101000001')
Assert-InspectionRejected 'unexpected historical version' $bad
$bad=@($pendingLines); $bad[4]=$bad[3]
Assert-InspectionRejected 'duplicate historical version' $bad
$bad=@($pendingLines); $bad[-1]='20261101030001 | | ignored'
Assert-InspectionRejected 'unexpected pending version' $bad
$bad=@($pendingLines); $bad[2]='-----|malformed|-----'
Assert-InspectionRejected 'malformed separator' $bad
$bad=@($pendingLines); $bad[-1]='20261101030000 | | ignored | extra'
Assert-InspectionRejected 'malformed extra column' $bad
$bad=@($pendingLines); $bad[-1]='20261101030000 | 20261101020000 | ignored'
Assert-InspectionRejected 'unmatched Remote version' $bad
$bad=@($afterExpected); $bad[1]=$bad[0]
Assert-InspectionRejected 'duplicate local filenames' $pendingLines -Local $bad

function Assert-HistoryRejected([string] $Label, [string[]] $Lines, [string[]] $Local = $expected, [int] $Code = 0) {
  $rejected = $false
  try {
    $null = ConvertFrom-KlayMigrationHistory -OutputLines $Lines -LocalVersions $Local -ExitCode $Code
  }
  catch { $rejected = $true }
  if (-not $rejected) { throw "Expected parser to reject case: $Label" }
  Write-Host "PASS: parser rejects $Label."
}

$missingRemote = @($positiveLines)
$missingRemote[6] = (' | `{0}` |  | 2026-01-01 00:00:00 | ' -f $expected[1])
Assert-HistoryRejected 'missing Remote version' $missingRemote

$extraVersion = @($positiveLines + (' | `{0}` | `{0}` | 2026-01-01 00:00:00 | ' -f '20261101030000'))
Assert-HistoryRejected 'extra migration row/version' $extraVersion

$duplicateVersion = @($positiveLines)
$duplicateVersion[-1] = (' | `{0}` | `{0}` | 2026-01-01 00:00:00 | ' -f $expected[0])
Assert-HistoryRejected 'duplicate version row' $duplicateVersion

$truncated = @($positiveLines[0..($positiveLines.Count - 2)])
Assert-HistoryRejected 'old/truncated 38-row history' $truncated

$unmatchedLocal = @($positiveLines)
$unmatchedLocal[6] = (' | `{0}` | `{1}` | 2026-01-01 00:00:00 | ' -f '20260101999999', $expected[1])
Assert-HistoryRejected 'unmatched Local version' $unmatchedLocal

$swappedRemote = @($positiveLines)
$swappedRemote[5] = (' | `{0}` | `{1}` | ignored timestamp | ' -f $expected[0], $expected[1])
$swappedRemote[6] = (' | `{0}` | `{1}` | ignored timestamp | ' -f $expected[1], $expected[0])
Assert-HistoryRejected 'swapped Remote cells even though column sets match' $swappedRemote

$malformedTable = @($positiveLines)
$malformedTable[4] = ' | --- | malformed | --- | '
Assert-HistoryRejected 'malformed table separator' $malformedTable

Assert-HistoryRejected 'nonzero CLI exit code' $positiveLines $expected 9
Assert-HistoryRejected 'empty history output' @()

$duplicateLocalFiles = @($expected)
$duplicateLocalFiles[1] = $duplicateLocalFiles[0]
Assert-HistoryRejected 'duplicate local filename version' $positiveLines $duplicateLocalFiles

Write-Host 'PASS: migration-history parser regression suite completed.'
