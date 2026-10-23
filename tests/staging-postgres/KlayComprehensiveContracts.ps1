$script:KlayPhase7RequiredGroups = @(
  'cross_user_rls','transactional_security_smoke','model_client_status','model_client_pointer',
  'model_client_privileges','candidate_claims_leases','image_job_leases',
  'image_and_reanalysis_admissions','credit_lifecycle','storage_sql_policies',
  'candidate_ownership','f07_client','f07_privileged','controlled_concurrency',
  'storage_authenticated_api','final_residue_audit'
)

function Get-KlayComprehensiveVerdict {
  param([object[]] $Groups, [bool] $CleanupVerified)
  $byName = @{}
  foreach ($group in $Groups) {
    if ($group.name -and $group.status -in @('PASS','FAIL','BLOCKED')) { $byName[$group.name] = $group.status }
  }
  if (@($byName.Values | Where-Object { $_ -eq 'FAIL' }).Count -gt 0) { return 'FAIL' }
  foreach ($required in $script:KlayPhase7RequiredGroups) {
    if (-not $byName.ContainsKey($required) -or $byName[$required] -ne 'PASS') { return 'BLOCKED' }
  }
  if (-not $CleanupVerified) { return 'BLOCKED' }
  return 'PASS'
}

