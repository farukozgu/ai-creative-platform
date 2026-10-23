$ErrorActionPreference = 'Stop'
$inspection = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'f07-migration-state.sql') -Raw
$migrationDir = Join-Path $PSScriptRoot '..\..\database\migrations'
$pendingPath=Join-Path $migrationDir '20261101030000_harden_approved_model_profile_integrity.sql'
if ((Get-FileHash -LiteralPath $pendingPath -Algorithm SHA256).Hash -cne '67D4243937FA111BB017BE50E148E544C5247BEF1EEFE40507AB7DCC45A4CFCB') {
  throw 'Pending migration differs from the reviewed transaction-compatible file; re-review the complete migration.'
}
$pendingSql=Get-Content -LiteralPath $pendingPath -Raw
if ($pendingSql -match '(?im)^\s*(?:BEGIN\s*;|COMMIT\b|ROLLBACK\b|VACUUM\b|CLUSTER\b|REINDEX\b|ALTER\s+SYSTEM\b|CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b)') {
  throw 'Migration contains transaction control or a pinned-CLI batch boundary.'
}
Write-Host 'PASS: complete pending migration SHA256 unchanged; no reviewed batch-splitting statements.'
$specs = @(
  @('old_guard','20261031030000_harden_model_candidate_integrity.sql','enforce_model_profile_transition'),
  @('old_approval','20261031030000_harden_model_candidate_integrity.sql','approve_model_candidate'),
  @('new_guard','20261101030000_harden_approved_model_profile_integrity.sql','enforce_model_profile_transition'),
  @('new_approval','20261101030000_harden_approved_model_profile_integrity.sql','approve_model_candidate'),
  @('immutable','20261030000000_create_model_identity_foundation.sql','prevent_model_version_mutation')
)
foreach ($spec in $specs) {
  $source = Get-Content -LiteralPath (Join-Path $migrationDir $spec[1]) -Raw
  $pattern = '(?is)create\s+(?:or\s+replace\s+)?function\s+public\.' + [regex]::Escape($spec[2]) +
    '\s*\([^;]*?\)\s*returns\b.*?\bas\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)(.*?)\1\s*;'
  $definitions = [regex]::Matches($source, $pattern)
  if ($definitions.Count -ne 1) { throw "Ambiguous/missing source function: $($spec[0])" }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $body = $definitions[0].Groups[2].Value.Replace("`r",'')
    $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($body)))).Replace('-','').ToLowerInvariant()
  } finally { $sha.Dispose() }
  $constant = [regex]::Match($inspection, '(?m)^\s*' + $spec[0] + " constant text := '([0-9a-f]{64})';")
  if (-not $constant.Success -or $constant.Groups[1].Value -cne $hash) {
    throw "Inspection fingerprint differs from actual migration function body: $($spec[0])"
  }
  Write-Host "PASS: source-bound SHA256 fingerprint $($spec[0])."
}
foreach ($required in @(
  'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;',
  "SET LOCAL statement_timeout = '20s';", "SET LOCAL lock_timeout = '5s';",
  "gh=old_guard AND ah=old_approval AND old_trigger",
  "gh=new_guard AND ah=new_approval AND new_trigger",
  'common_ok IS TRUE AND NOT recorded AND ns IS NULL AND ctx IS NULL',
  'common_ok IS TRUE AND recorded AND private_ok IS TRUE',
  "state := 'PARTIAL/DRIFTED';", "state text := 'INCONCLUSIVE';",
  "NOT has_function_privilege('authenticated',a.oid,'EXECUTE')",
  "NOT has_function_privilege('anon',a.oid,'EXECUTE')",
  'AND a.prosecdef AND NOT i.prosecdef AND ih=immutable',
  'array_remove(expected, ''20261101030000'')'
)) {
  if (-not $inspection.Contains($required)) { throw "Missing state inspection contract: $required" }
}
if ($inspection -match '(?im)^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|COMMIT|\\(?:i|ir|connect|!))\b' -or
    $inspection -notmatch '(?m)^ROLLBACK;\r?\n\\echo KLAY_F07_STATE_INSPECTION_COMPLETE\s*\z') {
  throw 'Inspection lost its read-only rollback-only structure.'
}
Write-Host 'PASS: classification source checks; no PostgreSQL assertion was executed.'
