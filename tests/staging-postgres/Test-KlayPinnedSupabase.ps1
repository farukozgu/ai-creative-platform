$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Invoke-KlayPinnedSupabase.ps1')
$expected='20261101030000_harden_approved_model_profile_integrity.sql'
$bullet=[string][char]0x2022
$mojibake=[string][char]0x0393+[char]0x00C7+[char]0x00F3
$prefix=@('DRY RUN: migrations will *not* be pushed to the database.',
  'Would push these migrations:')
$suffix=@('Finished supabase db push.')
function New-DryRun([string[]]$Entries,[string[]]$Before=@(),[string[]]$After=@(),[int]$Code=0) {
  [pscustomobject]@{ExitCode=$Code;Output=@($Before+$prefix+$Entries+$suffix+$After)}
}
function Assert-Rejected([string]$Name,$Result) {
  $rejected=$false
  try { Assert-KlayF07DryRun -Result $Result } catch { $rejected=$true }
  if(-not $rejected) { throw "Accepted unsafe dry-run: $Name" }
  Write-Host "PASS: rejects $Name."
}

$validCases=@(
  @{Name='UTF-8 bullet';Line=($bullet+' '+$expected)},
  @{Name='mojibake bullet';Line=($mojibake+' '+$expected)},
  @{Name='plain text migration line';Line=$expected}
)
foreach($case in $validCases) {
  Assert-KlayF07DryRun -Result (New-DryRun -Entries @($case.Line))
  Write-Host "PASS: accepts $($case.Name)."
}
$ansi=New-DryRun -Entries @(($bullet+' '+$expected))
$ansi.Output=@($ansi.Output | ForEach-Object { [string][char]27+'[1m'+$_+[char]27+'[0m' })
Assert-KlayF07DryRun -Result $ansi
Write-Host 'PASS: accepts ANSI-formatted output.'
$stderrProgress=New-DryRun -Entries @($expected) -Before @('Initialising login role...') -After @('A newer Supabase CLI version is available.')
Assert-KlayF07DryRun -Result $stderrProgress
Write-Host 'PASS: accepts harmless CLI stderr/progress with exit code 0.'

Assert-Rejected 'additional unexpected migration' (New-DryRun -Entries @($expected) -After @('* 20261101040000_extra.sql'))
Assert-Rejected 'missing migration' (New-DryRun -Entries @())
Assert-Rejected 'duplicate migration entry' (New-DryRun -Entries @($expected,$expected))
Assert-Rejected 'nonzero CLI exit' (New-DryRun -Entries @($expected) -Code 17)
Assert-Rejected 'malformed migration filename' (New-DryRun -Entries @('• 20261101030000_harden_approved_model_profile_integrity.sql.bak'))
Assert-Rejected 'malformed plan line' (New-DryRun -Entries @('unexpected prose '+$expected))
Assert-Rejected 'truncated output' ([pscustomobject]@{ExitCode=0;Output=@($prefix+$expected)})
Assert-Rejected 'missing plan header' ([pscustomobject]@{ExitCode=0;Output=@($prefix[0]+$expected+$suffix)})
Assert-Rejected 'duplicate completion marker' (New-DryRun -Entries @($expected) -After @('Finished supabase db push.'))
Assert-Rejected 'seed operation' (New-DryRun -Entries @($expected) -After @('Would seed these files:'))
Assert-Rejected 'application output' (New-DryRun -Entries @($expected) -After @('Applying migration '+$expected+'...'))

$rejected=$false
try { Invoke-KlayPinnedSupabase -NpxPath 'not-an-executable' -Operation 'Apply' } catch { $rejected=$true }
if(-not $rejected) { throw 'Read-only helper unexpectedly permits Apply.' }
Write-Host 'PASS: pinned helper has no apply operation.'
