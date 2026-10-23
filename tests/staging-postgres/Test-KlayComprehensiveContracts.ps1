$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'KlayComprehensiveContracts.ps1')

$passing = @($script:KlayPhase7RequiredGroups | ForEach-Object {[pscustomobject]@{name=$_;status='PASS'}})
if ((Get-KlayComprehensiveVerdict -Groups $passing -CleanupVerified $true) -cne 'PASS') { throw 'Complete groups plus verified cleanup should pass.' }
$withoutStorage = @($passing | Where-Object {$_.name -ne 'storage_authenticated_api'})
if ((Get-KlayComprehensiveVerdict -Groups $withoutStorage -CleanupVerified $true) -cne 'BLOCKED') { throw 'Missing Storage API coverage became a false PASS.' }
$blockedStorage = @($passing | ForEach-Object {if($_.name -eq 'storage_authenticated_api'){[pscustomobject]@{name=$_.name;status='BLOCKED'}}else{$_}})
if ((Get-KlayComprehensiveVerdict -Groups $blockedStorage -CleanupVerified $true) -cne 'BLOCKED') { throw 'Unavailable Storage API credentials became a false PASS.' }
if ((Get-KlayComprehensiveVerdict -Groups $passing -CleanupVerified $false) -cne 'BLOCKED') { throw 'Unverified cleanup became a false PASS.' }
$failed = @($passing | ForEach-Object {if($_.name -eq 'credit_lifecycle'){[pscustomobject]@{name=$_.name;status='FAIL'}}else{$_}})
if ((Get-KlayComprehensiveVerdict -Groups $failed -CleanupVerified $true) -cne 'FAIL') { throw 'Confirmed assertion failure did not yield FAIL.' }

$groups=@(
  @{File='authenticated-rls.sql';Marker='KLAY_AUTHENTICATED_RLS_PASS'},@{File='transactional-smoke.sql';Marker='KLAY_TRANSACTIONAL_SMOKE_PASS'},
  @{File='model-client-status.sql';Marker='KLAY_MODEL_CLIENT_STATUS_PASS'},@{File='model-client-pointer.sql';Marker='KLAY_MODEL_CLIENT_POINTER_PASS'},
  @{File='model-client-privileges.sql';Marker='KLAY_MODEL_CLIENT_PRIVILEGES_PASS'},@{File='candidate-leases.sql';Marker='KLAY_CANDIDATE_LEASES_PASS'},
  @{File='image-leases.sql';Marker='KLAY_IMAGE_LEASES_PASS'},@{File='admissions.sql';Marker='KLAY_ADMISSIONS_PASS'},
  @{File='credit-lifecycle.sql';Marker='KLAY_CREDIT_LIFECYCLE_PASS'},@{File='storage-metadata.sql';Marker='KLAY_STORAGE_METADATA_PASS'}
)
foreach($group in $groups){$sql=Get-Content (Join-Path $PSScriptRoot $group.File) -Raw;if($sql -notmatch '(?m)^ROLLBACK;\s*$' -or $sql -notmatch ('(?m)^\\echo '+[regex]::Escape($group.Marker)+'\s*$')){throw "Rollback or marker missing: $($group.File)"}}
$concurrency=Get-Content (Join-Path $PSScriptRoot 'Invoke-AdmissionConcurrency.ps1') -Raw
if($concurrency.IndexOf('concurrency-cleanup.sql') -lt 0 -or $concurrency.IndexOf('fixture-residue-audit.sql') -lt $concurrency.IndexOf('concurrency-cleanup.sql')){throw 'Concurrency cleanup is not followed by residue audit.'}
if($concurrency -notmatch 'concurrency-reanalysis-1\.sql' -or $concurrency -notmatch "'admitted'" -or $concurrency -notmatch "'replay'") { throw 'Concurrent product reanalysis was not asserted.' }
Write-Host 'PASS: credential, verdict, cleanup, rollback-marker, and staging-isolation contracts.'
