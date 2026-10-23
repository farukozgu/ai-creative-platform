# Read-only command allowlist. This helper intentionally has NO apply operation.
function Invoke-KlayPinnedSupabase {
  param([Parameter(Mandatory=$true)][string]$NpxPath,
    [Parameter(Mandatory=$true)][ValidateSet('Version','PushHelp','History','DryRun')][string]$Operation)
  $stagingRoot='C:\klay-ai-staging-tests'
  $ref='gklpgcyndeghjgemoonk'
  if ((Get-Location).Path -cne $stagingRoot) { throw 'Pinned CLI requires the explicit staging working directory.' }
  $pendingPath=Join-Path $stagingRoot 'supabase\migrations\20261101030000_harden_approved_model_profile_integrity.sql'
  if ((Get-FileHash -LiteralPath $pendingPath -Algorithm SHA256).Hash -cne '67D4243937FA111BB017BE50E148E544C5247BEF1EEFE40507AB7DCC45A4CFCB') {
    throw 'Staging pending migration differs from the complete reviewed SQL; STOP.'
  }
  $config=Get-Content -LiteralPath (Join-Path $stagingRoot 'supabase\config.toml') -Raw
  if ($config -match '(?m)^\s*\[remotes(?:\.|\])') { throw 'Review remote config overrides separately before using this pinned workflow.' }
  $section=[regex]::Match($config,'(?ms)^\[experimental\.pgdelta\][ \t]*\r?\n(.*?)(?=^\[|\z)')
  if (-not $section.Success -or $section.Groups[1].Value -notmatch '(?m)^enabled\s*=\s*false\s*(?:#.*)?$') {
    throw 'Pinned workflow requires staging [experimental.pgdelta] enabled = false; environment false does not override an explicit true.'
  }
  foreach ($relative in @('.env','.env.local','supabase\.env','supabase\.env.local')) {
    if (Test-Path -LiteralPath (Join-Path $stagingRoot $relative) -PathType Leaf) {
      throw 'Staging dotenv override exists; review it separately before using the pinned CLI.'
    }
  }
  $operationArgs=switch($Operation) {
    'Version' { @('--version') }
    'PushHelp' { @('db','push','--help') }
    'History' { @('migration','list','--linked','--project-ref',$ref) }
    'DryRun' { @('db','push','--linked','--project-ref',$ref,'--skip-vault','--dry-run') }
  }
  $arguments=@('--yes','--package=supabase@2.114.0','supabase','--workdir',$stagingRoot) + $operationArgs
  # Management API login is scoped by the explicit ref. Do not reuse inherited
  # database passwords, connection overrides, or automatic CLI confirmations.
  $names=@('SUPABASE_DB_PASSWORD','SUPABASE_DB_URL','SUPABASE_PROJECT_ID','SUPABASE_YES',
    'PGPASSWORD','PGHOST','PGHOSTADDR','PGPORT','PGUSER','PGDATABASE','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS',
    'SUPABASE_EXPERIMENTAL_PG_DELTA','SUPABASE_DEBUG','SUPABASE_OUTPUT_FORMAT')
  $saved=@{}
  try {
    foreach($name in $names) {
      $entry=Get-Item "Env:$name" -ErrorAction SilentlyContinue
      if($entry) { $saved[$name]=$entry.Value }
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    $env:SUPABASE_PROJECT_ID=$ref
    $env:SUPABASE_EXPERIMENTAL_PG_DELTA='false'
    $result=Invoke-KlayNativeCommand -FilePath $NpxPath -ArgumentList $arguments
    if($result.ExitCode -ne 0) { throw "Pinned CLI $Operation failed with exit code $($result.ExitCode)." }
    if($Operation -eq 'Version') {
      $versions=@($result.Output | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+].*)?$' })
      if($versions.Count -ne 1 -or $versions[0] -cne '2.114.0') { throw 'Pinned CLI did not identify itself as exactly 2.114.0.' }
    }
    if($Operation -eq 'PushHelp') {
      foreach($flag in @('--linked','--project-ref','--dry-run','--skip-vault')) {
        if(($result.Output -join "`n") -notmatch [regex]::Escape($flag)) { throw "Pinned CLI help lacks required flag $flag." }
      }
    }
    $result
  } finally {
    foreach($name in $names) {
      if($saved.ContainsKey($name)) { Set-Item "Env:$name" $saved[$name] }
      else { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
    }
  }
}

function Assert-KlayF07DryRun {
  param([Parameter(Mandatory=$true)]$Result)
  if($Result.ExitCode -ne 0) { throw 'Dry-run exited nonzero.' }
  # Normalize control formatting, but do not decode or compare a particular
  # bullet glyph. Windows PowerShell 5.1 can render UTF-8 CLI output as mojibake.
  $lines=@($Result.Output | ForEach-Object { ($_ -replace '\x1b\[[0-?]*[ -/]*[@-~]','').Trim() } | Where-Object { $_ -ne '' })
  if(@($lines | Where-Object { $_ -ceq 'DRY RUN: migrations will *not* be pushed to the database.' }).Count -ne 1 -or
    @($lines | Where-Object { $_ -ceq 'Would push these migrations:' }).Count -ne 1 -or
    @($lines | Where-Object { $_ -ceq 'Finished supabase db push.' }).Count -ne 1) { throw 'Missing or ambiguous dry-run plan/completion.' }
  $headerIndex=[array]::IndexOf($lines,'Would push these migrations:')
  $finishIndex=[array]::IndexOf($lines,'Finished supabase db push.')
  $dryRunIndex=[array]::IndexOf($lines,'DRY RUN: migrations will *not* be pushed to the database.')
  if($dryRunIndex -ge $headerIndex -or $headerIndex -ge $finishIndex) { throw 'Dry-run plan order is malformed.' }
  $planLines=@($lines[($headerIndex+1)..($finishIndex-1)])
  $expected='20261101030000_harden_approved_model_profile_integrity.sql'
  $planEntries=@($planLines | Where-Object { $_ -match '(?i)\d{14}_[^\s|]+' })
  if($planLines.Count -ne 1 -or $planEntries.Count -ne 1 -or
      $planEntries[0] -cnotmatch ([regex]::Escape($expected)+'$')) {
    throw 'Dry-run must list only the pending F07 filename.'
  }
  $prefix=$planEntries[0].Substring(0,$planEntries[0].LastIndexOf($expected,[System.StringComparison]::Ordinal))
  # Permit whitespace and any Unicode punctuation/symbol/letter used as a
  # visual prefix (including UTF-8 mojibake), but reject ASCII prose, paths,
  # digits, or other filename-like material before the exact expected name.
  if($prefix -match '[A-Za-z0-9/\\]') { throw 'Malformed migration entry in dry-run plan.' }
  $filenameMatches=[regex]::Matches(($lines -join "`n"),'(?i)\b\d{14}_[A-Za-z0-9_]+\.sql\b')
  $allMigrationLike=[regex]::Matches(($lines -join "`n"),'(?i)\b\d{14}_[^\s|]+')
  if($filenameMatches.Count -ne 1 -or $filenameMatches[0].Value -cne $expected -or
      $allMigrationLike.Count -ne 1 -or $allMigrationLike[0].Value -cne $expected) {
    throw 'Dry-run contains missing, duplicate, malformed, or unexpected migration filenames.'
  }
  if(@($lines | Where-Object { $_ -match '(?i)Would (?:seed|create)|Applying migration|\b(?:ERROR|FATAL|PANIC):' }).Count) {
    throw 'Unexpected migration, mutation or additional operation in dry-run output.'
  }
}
