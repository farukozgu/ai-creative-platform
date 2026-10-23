[CmdletBinding()]
param(
  [string] $ReportDirectory,
  [switch] $LocalStartupSmoke
)

$ErrorActionPreference = 'Stop'
$scriptPath = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptPath)) { $scriptPath = $PSCommandPath }
if ([string]::IsNullOrWhiteSpace($scriptPath)) { Write-Error 'Cannot resolve the comprehensive runner script path.'; exit 2 }
$suiteDir = Split-Path -Parent ([IO.Path]::GetFullPath($scriptPath))
$requestedReportDirectory = if ([string]::IsNullOrWhiteSpace($ReportDirectory)) { Join-Path $suiteDir 'reports' } else { $ReportDirectory }
$reportDirectoryFailure = $null
$reportDirectoryResolved = $null
try {
  $reportDirectoryResolved = [IO.Path]::GetFullPath($requestedReportDirectory)
  $null = New-Item -ItemType Directory -Path $reportDirectoryResolved -Force
  $probePath = Join-Path $reportDirectoryResolved ('.klay-write-probe-' + [guid]::NewGuid().ToString('N') + '.tmp')
  [IO.File]::WriteAllText($probePath,'probe',[Text.UTF8Encoding]::new($false))
  Remove-Item -LiteralPath $probePath -Force
} catch {
  $reportDirectoryFailure = "Requested report directory could not be initialized: $($_.Exception.Message)"
  try {
    $reportDirectoryResolved = Join-Path ([IO.Path]::GetTempPath()) 'klay-ai-phase7f16-reports'
    $null = New-Item -ItemType Directory -Path $reportDirectoryResolved -Force
    $fallbackProbe = Join-Path $reportDirectoryResolved ('.klay-write-probe-' + [guid]::NewGuid().ToString('N') + '.tmp')
    [IO.File]::WriteAllText($fallbackProbe,'probe',[Text.UTF8Encoding]::new($false))
    Remove-Item -LiteralPath $fallbackProbe -Force
  } catch { Write-Error 'Cannot initialize the requested or fallback report directory.'; exit 2 }
}
$ReportDirectory = $reportDirectoryResolved
if ($LocalStartupSmoke -and -not $reportDirectoryFailure) { Write-Output 'KLAY_COMPREHENSIVE_STARTUP_PASS'; exit 0 }

$stagingRoot = 'C:\klay-ai-staging-tests'
$expectedRef = 'gklpgcyndeghjgemoonk'
$protectedRef = 'fnzrnlvpkzwztccqzyzf'
$expectedHost = 'aws-0-eu-west-1.pooler.supabase.com'
$expectedPort = 5432
$expectedUser = "postgres.$expectedRef"
$expectedCount = 40
$nativeHelper = Join-Path $suiteDir 'Invoke-KlayNativeCommand.ps1'
$parserPath = Join-Path $suiteDir 'Parse-KlayMigrationHistory.ps1'
$startupLoadFailure = $null
try {
  . $nativeHelper
  . $parserPath
  . (Join-Path $suiteDir 'KlayComprehensiveContracts.ps1')
  . (Join-Path $suiteDir 'KlayStorageWorkflow.ps1')
} catch { $startupLoadFailure = $_.Exception.Message }

$groupSpecs = @(
  @{Name='cross_user_rls'; File='authenticated-rls.sql'; Marker='KLAY_AUTHENTICATED_RLS_PASS'; Cases=@('own rows visible','cross-user rows hidden','unauthorized writes rejected')},
  @{Name='transactional_security_smoke'; File='transactional-smoke.sql'; Marker='KLAY_TRANSACTIONAL_SMOKE_PASS'; Cases=@('Model Studio identity and approval integrity','forged approval context rejected')},
  @{Name='model_client_status'; File='model-client-status.sql'; Marker='KLAY_MODEL_CLIENT_STATUS_PASS'; Cases=@('authenticated status transitions')},
  @{Name='model_client_pointer'; File='model-client-pointer.sql'; Marker='KLAY_MODEL_CLIENT_POINTER_PASS'; Cases=@('identity pointer access control')},
  @{Name='model_client_privileges'; File='model-client-privileges.sql'; Marker='KLAY_MODEL_CLIENT_PRIVILEGES_PASS'; Cases=@('client role RPC privilege boundaries')},
  @{Name='candidate_claims_leases'; File='candidate-leases.sql'; Marker='KLAY_CANDIDATE_LEASES_PASS'; Cases=@('candidate claims','lease expiry','ownership and fencing')},
  @{Name='image_job_leases'; File='image-leases.sql'; Marker='KLAY_IMAGE_LEASES_PASS'; Cases=@('image job leases','idempotency','stale worker fencing')},
  @{Name='image_and_reanalysis_admissions'; File='admissions.sql'; Marker='KLAY_ADMISSIONS_PASS'; Cases=@('image edit idempotency and admission','product reanalysis authorization and cooldown')},
  @{Name='credit_lifecycle'; File='credit-lifecycle.sql'; Marker='KLAY_CREDIT_LIFECYCLE_PASS'; Cases=@('grant','reservation','debit','refund','duplicate event','insufficient balance','ledger consistency')},
  @{Name='storage_sql_policies'; File='storage-metadata.sql'; Marker='KLAY_STORAGE_METADATA_PASS'; Cases=@('private buckets','storage.objects RLS','owner/path policies')}
)
$requiredGroups = @($script:KlayPhase7RequiredGroups)
$results = [System.Collections.Generic.List[object]]::new()
$runId = [guid]::NewGuid().ToString('N')
$started = [DateTime]::UtcNow
$overall = 'BLOCKED'
$safeLogs = Join-Path $ReportDirectory $runId
$previousLocation = Get-Location
$passwordPtr = [IntPtr]::Zero
$dbSecure = $null
$previousPg = @{}
$pgEnvironmentCaptured = $false
$pgNames = @('PGPASSWORD','PGHOST','PGPORT','PGUSER','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT','PGAPPNAME','PGOPTIONS','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGHOSTADDR','PGTARGETSESSIONATTRS')
$isolationVerified = $false
$concurrencyAttempted = $false
$cleanupVerified = $false
$remoteSqlExecuted = $false
$poolerUri = $null
$psqlPath = $null

function Add-GroupResult {
  param([string]$Name,[ValidateSet('PASS','FAIL','BLOCKED')][string]$Status,[string[]]$Cases,[string[]]$Failures=@(),[string]$Marker='', [string]$Cleanup='NOT_APPLICABLE',[string]$Evidence='', [string]$NextAction='')
  $results.Add([pscustomobject]@{name=$Name;status=$Status;test_cases_executed=@($Cases);failure_details=@($Failures);completion_marker=$Marker;cleanup_status=$Cleanup;evidence=$Evidence;required_next_action=$NextAction})
}

function Invoke-PsqlFile {
  param([string]$File,[string]$Marker,[string]$GroupName,[string[]]$Cases)
  $path = Join-Path $suiteDir $File
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required SQL group file is missing: $File" }
  $result = Invoke-KlayNativeCommand -FilePath $psqlPath -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-f',$path)
  $outPath = Join-Path $safeLogs ($GroupName + '.log')
  [IO.File]::WriteAllLines($outPath, [string[]]$result.Output, [Text.UTF8Encoding]::new($false))
  $lines = @($result.Output | ForEach-Object { ([string]$_).Trim() })
  $markerCount = @($lines | Where-Object { $_ -ceq $Marker }).Count
  $assertions = @($lines | Where-Object { $_ -match '(?i)ASSERTION FAILED|(^|\s)FAIL:' })
  $errors = @($lines | Where-Object { $_ -match '(?i)\b(ERROR|FATAL|PANIC):' })
  $failed = $result.ExitCode -ne 0 -or $markerCount -ne 1 -or $assertions.Count -gt 0 -or $errors.Count -gt 0
  $details = @($assertions + $errors)
  if ($result.ExitCode -ne 0) { $details += "psql exited with code $($result.ExitCode)." }
  if ($markerCount -ne 1) { $details += "Expected exactly one completion marker '$Marker'; found $markerCount." }
  $connectionUnavailable = @($lines | Where-Object { $_ -match '(?i)could not connect|connection timed out|password authentication failed|no pg_hba|could not translate host|server closed the connection|connection refused' }).Count -gt 0
  $status = if (-not $failed) {'PASS'} elseif ($connectionUnavailable) {'BLOCKED'} else {'FAIL'}
  Add-GroupResult -Name $GroupName -Status $status -Cases $Cases -Failures $details -Marker $(if($markerCount -eq 1){$Marker}else{''}) -Evidence $outPath -NextAction $(if($status -eq 'BLOCKED'){'Restore staging database connectivity/credentials and rerun.'}elseif($failed){'Inspect sanitized SQL output and fix the failed assertion before rerunning.'}else{''})
  return (-not $failed)
}

function Invoke-ResidueAudit {
  param([string]$GroupName = 'final_residue_audit')
  $path = Join-Path $suiteDir 'fixture-residue-audit.sql'
  $result = Invoke-KlayNativeCommand -FilePath $psqlPath -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-f',$path)
  $outPath = Join-Path $safeLogs 'final-residue-audit.log'
  [IO.File]::WriteAllLines($outPath, [string[]]$result.Output, [Text.UTF8Encoding]::new($false))
  $markerCount = @($result.Output | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -ceq 'KLAY_FIXTURE_RESIDUE_AUDIT_PASS' }).Count
  $ok = $result.ExitCode -eq 0 -and $markerCount -eq 1 -and @($result.Output | Where-Object { $_ -match '(?i)ASSERTION FAILED|\b(ERROR|FATAL|PANIC):' }).Count -eq 0
  Add-GroupResult -Name $GroupName -Status $(if($ok){'PASS'}else{'FAIL'}) -Cases @('all reserved synthetic auth identities absent') -Failures $(if($ok){@()}else{@("Residue audit failed or marker missing; psql exit $($result.ExitCode).")}) -Marker $(if($ok){'KLAY_FIXTURE_RESIDUE_AUDIT_PASS'}else{''}) -Cleanup $(if($ok){'VERIFIED'}else{'FAILED'}) -Evidence $outPath -NextAction $(if($ok){''}else{'Stop and inspect only the reserved synthetic IDs and test markers before any manual cleanup.'})
  return $ok
}

function Read-SecretText([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  if ($null -eq $secure -or $secure.Length -eq 0) { if($secure){$secure.Dispose()}; return $null }
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
}

function Invoke-StorageApiGroup {
  $emails = @($script:KlayStorageAccounts)
  $passwords = @((Read-SecretText 'Disposable staging user A password'),(Read-SecretText 'Disposable staging user B password'))
  $anonKey = Read-SecretText 'Staging anon/publishable API key (input hidden)'
  $cleanupKey = Read-SecretText 'Staging service-role key (required for exact synthetic-object deletion; input hidden)'
  $credentialCheck = Test-KlayStorageCredentials -Emails $emails -Passwords $passwords -AnonKey $anonKey -CleanupKey $cleanupKey
  if (-not $credentialCheck.Ready) {
    Add-GroupResult -Name 'storage_authenticated_api' -Status BLOCKED -Cases @() -Cleanup 'NOT_STARTED' -Failures @($credentialCheck.Reason) -NextAction 'Provide the two disposable account passwords, staging anon key, and staging-only service-role key.'
    return $false
  }
  $baseUri = [uri]"https://$expectedRef.supabase.co"
  if ($baseUri.Host -cne "$expectedRef.supabase.co") { throw 'Storage API host failed staging project-ref validation.' }
  $tokens = @($null,$null); $userIds = @($null,$null); $projectIds=@($null,$null); $objectPaths = @($null,$null)
  $uploaded = @($false,$false); $apiFailures = [System.Collections.Generic.List[string]]::new(); $clean = $true
  $apiCases = [System.Collections.Generic.List[string]]::new()
  $previousTlsProtocol = [Net.ServicePointManager]::SecurityProtocol
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  try {
    for ($i=0; $i -lt 2; $i++) {
      $auth = Invoke-RestMethod -Method Post -Uri "$($baseUri.AbsoluteUri.TrimEnd('/'))/auth/v1/token?grant_type=password" -Headers @{apikey=$anonKey} -ContentType 'application/json' -Body (@{email=$emails[$i];password=$passwords[$i]} | ConvertTo-Json -Compress) -ErrorAction Stop
      if ([string]::IsNullOrWhiteSpace([string]$auth.access_token)) { throw "Storage API user $($i+1) did not receive an access token." }
      $identity = Invoke-RestMethod -Method Get -Uri "$($baseUri.AbsoluteUri.TrimEnd('/'))/auth/v1/user" -Headers @{apikey=$anonKey;Authorization="Bearer $($auth.access_token)"} -ErrorAction Stop
      $validatedIdentity=Get-KlayStorageIdentity -AuthResponse $auth -UserResponse $identity -ExpectedEmail $emails[$i] -BaseUri $baseUri
      $tokens[$i]=$validatedIdentity.AccessToken
      $userIds[$i] = $validatedIdentity.UserId
      if ($userIds[0] -and $userIds[1] -and $userIds[0] -eq $userIds[1]) { throw 'Both credentials resolved to the same authenticated identity.' }
    }
    $apiCases.Add('both disposable users independently authenticated and returned distinct staging identities')
    $provisionSql=New-KlayStorageProjectProvisionSql -UserA $userIds[0] -UserB $userIds[1]
    $provision=Invoke-KlayNativeCommand -FilePath $psqlPath -ArgumentList @('-X','-qAt','-v','ON_ERROR_STOP=1','-1','-c',$provisionSql)
    if($provision.ExitCode -ne 0){throw 'Disposable Storage projects could not be safely provisioned.'}
    foreach($line in $provision.Output){
      $parts=([string]$line).Trim() -split "`t",3
      if($parts.Count -ne 3){continue}
      $titleIndex=[array]::IndexOf([string[]]$script:KlayStorageProjectTitles,$parts[2])
      if($titleIndex -lt 0){continue}
      $pid=[guid]::Empty;$uid=[guid]::Empty
      if(-not [guid]::TryParse($parts[0],[ref]$pid) -or -not [guid]::TryParse($parts[1],[ref]$uid) -or $parts[1] -cne $userIds[$titleIndex]){throw 'Provisioned Storage project identity/ownership verification failed.'}
      $projectIds[$titleIndex]=$pid.ToString('D')
    }
    if(-not $projectIds[0] -or -not $projectIds[1] -or $projectIds[0] -eq $projectIds[1]){throw 'Provisioning did not return exactly two distinct correctly owned projects.'}
    $apiCases.Add('idempotent reserved projects provisioned or reused for their authenticated owners')
    for ($i=0; $i -lt 2; $i++) {
      $objectPaths[$i] = "$($userIds[$i])/$($projectIds[$i])/phase7f16-$runId-$i.png"
      $encodedPath = [uri]::EscapeDataString($objectPaths[$i]).Replace('%2F','/')
      $uri = "$($baseUri.AbsoluteUri.TrimEnd('/'))/storage/v1/object/product-assets/$encodedPath"
      $safeObjectPath=$objectPaths[$i].Replace("'","''")
      $collision=Invoke-KlayNativeCommand -FilePath $psqlPath -ArgumentList @('-X','-qAt','-v','ON_ERROR_STOP=1','-c',("SELECT count(*) FROM storage.objects WHERE bucket_id='product-assets' AND name='$safeObjectPath'"))
      if($collision.ExitCode -ne 0 -or $collision.Output.Count -eq 0 -or $collision.Output[-1].Trim() -ne '0'){throw "Synthetic object path collision or preflight failure for account $($i+1); refusing to upload or delete it."}
      $pngFixture = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Zb8AAAAASUVORK5CYII=')
      $preexisting = $false
      try { $null = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$($baseUri.AbsoluteUri.TrimEnd('/'))/storage/v1/object/authenticated/product-assets/$encodedPath" -Headers @{apikey=$anonKey;Authorization="Bearer $($tokens[$i])"} -ErrorAction Stop; $preexisting = $true }
      catch { $precheckCode=0;if($_.Exception.Response){$precheckCode=[int]$_.Exception.Response.StatusCode};if($precheckCode -notin @(400,404)){throw "Synthetic object collision precheck failed unexpectedly (HTTP $precheckCode)."} }
      if($preexisting){throw "Refusing to overwrite an existing Storage object at the synthetic path for account $($i+1)."}
      $uploaded[$i] = $true
      try { $null = Invoke-RestMethod -Method Post -Uri $uri -Headers @{apikey=$anonKey;Authorization="Bearer $($tokens[$i])"} -ContentType 'image/png' -Body $pngFixture -ErrorAction Stop }
      catch { if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409){$uploaded[$i]=$false};throw }
      $apiCases.Add("user $($i+1) uploaded its synthetic object")
      $download = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$($baseUri.AbsoluteUri.TrimEnd('/'))/storage/v1/object/authenticated/product-assets/$encodedPath" -Headers @{apikey=$anonKey;Authorization="Bearer $($tokens[$i])"} -ErrorAction Stop
      if ($download.StatusCode -ne 200 -or -not $download.RawContentStream -or $download.RawContentStream.Length -le 0) { throw "Own-object read assertion failed for account $($i+1)." }
      $apiCases.Add("user $($i+1) read its own synthetic object")
    }
    for ($i=0; $i -lt 2; $i++) {
      $peer = 1-$i
      $peerPath = [uri]::EscapeDataString($objectPaths[$peer]).Replace('%2F','/')
      $denied = $false
      try { $null = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$($baseUri.AbsoluteUri.TrimEnd('/'))/storage/v1/object/authenticated/product-assets/$peerPath" -Headers @{apikey=$anonKey;Authorization="Bearer $($tokens[$i])"} -ErrorAction Stop }
      catch { $code = 0; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }; if ($code -in @(400,401,403,404)) { $denied=$true } else { throw "Cross-user Storage API request failed unexpectedly (HTTP $code)." } }
      if (-not $denied) { throw "Cross-user Storage API read was permitted for account $($i+1)." }
      $apiCases.Add("user $($i+1) was denied user $($peer+1)'s object")
    }
    for ($i=0; $i -lt 2; $i++) {
      $path = [uri]::EscapeDataString($objectPaths[$i]).Replace('%2F','/')
      $denied = $false
      try { $null = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$($baseUri.AbsoluteUri.TrimEnd('/'))/storage/v1/object/authenticated/product-assets/$path" -Headers @{apikey=$anonKey} -ErrorAction Stop }
      catch { $code=0;if($_.Exception.Response){$code=[int]$_.Exception.Response.StatusCode};if($code -in @(400,401,403,404)){$denied=$true}else{throw "Anonymous Storage API request failed unexpectedly (HTTP $code)."} }
      if (-not $denied) { throw 'Anonymous Storage API read was permitted.' }
      $apiCases.Add("anonymous read was denied for user $($i+1)'s object")
    }
  }
  catch { $apiFailures.Add('Storage API identity, ownership, isolation, or object assertion failed. Detailed exception text is withheld to prevent credential disclosure.') }
  finally {
    for ($i=0; $i -lt 2; $i++) {
      if ($uploaded[$i] -and $cleanupKey) {
        try { $null = Invoke-RestMethod -Method Delete -Uri "$($baseUri.AbsoluteUri.TrimEnd('/'))/storage/v1/object/product-assets" -Headers @{apikey=$cleanupKey;Authorization="Bearer $cleanupKey"} -ContentType 'application/json' -Body (@{prefixes=@($objectPaths[$i])} | ConvertTo-Json -Compress) -ErrorAction Stop }
        catch { $clean=$false; $apiFailures.Add("Storage API deletion failed for synthetic object $i (details withheld).") }
        $path = [uri]::EscapeDataString($objectPaths[$i]).Replace('%2F','/')
        $stillReadable = $false
        try { $null = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$($baseUri.AbsoluteUri.TrimEnd('/'))/storage/v1/object/authenticated/product-assets/$path" -Headers @{apikey=$anonKey;Authorization="Bearer $($tokens[$i])"} -ErrorAction Stop; $stillReadable = $true }
        catch { $verifyCode=0;if($_.Exception.Response){$verifyCode=[int]$_.Exception.Response.StatusCode};if($verifyCode -notin @(400,401,403,404)){$clean=$false;$apiFailures.Add("Cleanup verification returned unexpected HTTP $verifyCode for synthetic object $i.")} }
        if ($stillReadable) { $clean=$false; $apiFailures.Add("Cleanup verification found synthetic object $i still readable.") }
        $safeObjectPath=$objectPaths[$i].Replace("'","''")
        try {
          $residue=Invoke-KlayNativeCommand -FilePath $psqlPath -ArgumentList @('-X','-qAt','-v','ON_ERROR_STOP=1','-c',("SELECT count(*) FROM storage.objects WHERE bucket_id='product-assets' AND name='$safeObjectPath'"))
          if($residue.ExitCode -ne 0 -or $residue.Output.Count -eq 0 -or $residue.Output[-1].Trim() -ne '0'){$clean=$false;$apiFailures.Add("Read-only database residue audit failed for synthetic object $i.")}
        } catch {$clean=$false;$apiFailures.Add("Read-only database residue audit errored for synthetic object $i.")}
        if($clean){$apiCases.Add("synthetic object $i deleted, API read denied, and database residue absent")}
      }
    }
    $tokens = @($null,$null); $passwords = @($null,$null); $anonKey = $null; $cleanupKey = $null
    [Net.ServicePointManager]::SecurityProtocol = $previousTlsProtocol
  }
  $status = if ($apiFailures.Count -gt 0 -or -not $clean) {'FAIL'} else {'PASS'}
  Add-GroupResult -Name 'storage_authenticated_api' -Status $status -Cases $apiCases.ToArray() -Failures @($apiFailures) -Marker $(if($status -eq 'PASS'){'KLAY_STORAGE_AUTH_API_PASS'}else{''}) -Cleanup $(if($clean){'VERIFIED'}else{'FAILED'}) -Evidence 'Credentials and access tokens omitted; synthetic object identifiers are scoped to one run.' -NextAction $(if($status -eq 'PASS'){''}else{'Review disposable account/project setup and Storage policies; cleanup must be confirmed.'})
  return ($status -eq 'PASS')
}

try {
  if ($reportDirectoryFailure) { throw $reportDirectoryFailure }
  if ($startupLoadFailure) { throw "Runner startup dependency load failed: $startupLoadFailure" }
  if ($stagingRoot -cne 'C:\klay-ai-staging-tests' -or $expectedRef -ceq $protectedRef) { throw 'Static staging isolation contract is invalid.' }
  if (-not (Test-Path -LiteralPath $stagingRoot -PathType Container)) { throw "Staging CLI directory missing: $stagingRoot" }
  $reportDirResolved = [IO.Path]::GetFullPath($ReportDirectory)
  $reportDirResolved = $reportDirectoryResolved
  $safeLogs = Join-Path $reportDirResolved $runId
  $null = New-Item -ItemType Directory -Path $safeLogs -Force
  Push-Location -LiteralPath $stagingRoot
  if ((Get-Location).Path -cne $stagingRoot) { throw 'Staging working directory check failed.' }
  $refFile = Join-Path $stagingRoot 'supabase\.temp\project-ref'
  $poolerFile = Join-Path $stagingRoot 'supabase\.temp\pooler-url'
  if (-not (Test-Path -LiteralPath $refFile -PathType Leaf) -or -not (Test-Path -LiteralPath $poolerFile -PathType Leaf)) { throw 'Staging project metadata missing; refusing connection.' }
  $linkedRef = (Get-Content -LiteralPath $refFile -Raw).Trim()
  if ($linkedRef -cne $expectedRef -or $linkedRef -ceq $protectedRef) { throw 'Project ref is not the allowlisted staging project; STOP.' }
  $poolerUri = [uri](Get-Content -LiteralPath $poolerFile -Raw).Trim()
  $poolerUser = [uri]::UnescapeDataString(($poolerUri.UserInfo -split ':',2)[0])
  if ($poolerUri.Host -cne $expectedHost -or $poolerUri.Port -ne $expectedPort -or $poolerUser -cne $expectedUser) { throw 'Pooler host, port, or username does not exactly match staging allowlist; STOP.' }
  $isolationVerified = $true

  $localFiles = @(Get-ChildItem -LiteralPath (Join-Path $stagingRoot 'supabase\migrations') -Filter '*.sql' -File)
  if ($localFiles.Count -ne $expectedCount) { throw "Expected exactly $expectedCount local migrations; found $($localFiles.Count)." }
  $localVersions = @()
  foreach ($file in $localFiles) { if ($file.BaseName -cnotmatch '^(\d{14})(?:_|$)') { throw "Malformed migration filename: $($file.Name)" }; $localVersions += $Matches[1] }
  if (@($localVersions | Sort-Object -Unique).Count -ne $expectedCount) { throw 'Local migration versions contain duplicates.' }
  if ($localVersions -notcontains '20261101020000' -or $localVersions -notcontains '20261101030000') { throw 'Required candidate ownership and F-07 migrations are missing.' }

  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) { throw 'psql is required.' }
  $psqlPath = $psql.Source
  $npx = Get-Command npx -ErrorAction SilentlyContinue
  if (-not $npx) { throw 'npx is required to pin Supabase CLI 2.114.0.' }
  . (Join-Path $suiteDir 'Invoke-KlayPinnedSupabase.ps1')
  $cliVersion = Invoke-KlayPinnedSupabase -NpxPath $npx.Source -Operation Version
  $history = Invoke-KlayPinnedSupabase -NpxPath $npx.Source -Operation History
  $historyParsed = ConvertFrom-KlayMigrationHistory -OutputLines $history.Output -LocalVersions $localVersions -ExitCode $history.ExitCode -ExpectedCount 40
  if (-not $historyParsed.InstallationComplete -or $historyParsed.Count -ne 40) { throw 'Remote migration history is pending or incomplete.' }
  Add-GroupResult -Name 'staging_isolation_and_migration_history' -Status PASS -Cases @('allowlisted ref','fixed pooler endpoint/user','Supabase CLI 2.114.0','40 exact Local/Remote migration versions') -Marker 'KLAY_STAGING_PREFLIGHT_PASS' -Evidence 'Validated in memory; project refs and credentials are not emitted.'

  Write-Host "Staging isolation verified: $expectedRef at $expectedHost`:$expectedPort. Confirm this endpoint in the staging Dashboard."
  if ((Read-Host 'Type STAGING-VERIFIED to continue') -cne 'STAGING-VERIFIED') { throw 'Dashboard endpoint confirmation failed.' }
  $dbSecure = Read-Host 'Staging database password' -AsSecureString
  if ($null -eq $dbSecure -or $dbSecure.Length -eq 0) { throw 'A staging database password is required.' }
  $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbSecure)
  $pgEnvironmentCaptured = $true
  foreach ($name in $pgNames) { $entry=Get-Item "Env:$name" -ErrorAction SilentlyContinue;if($entry){$previousPg[$name]=$entry.Value} }
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
  $env:PGHOST=$poolerUri.Host; $env:PGPORT=[string]$poolerUri.Port; $env:PGUSER=$poolerUser; $env:PGDATABASE='postgres'; $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'; $env:PGAPPNAME="klay-phase7f16-$runId"; $env:PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=20000'
  Remove-Item Env:PGSERVICE,Env:PGSERVICEFILE,Env:PGPASSFILE,Env:PGHOSTADDR,Env:PGTARGETSESSIONATTRS -ErrorAction SilentlyContinue

  $preflightResult = Invoke-PsqlFile -File 'preflight.sql' -Marker 'KLAY_MIGRATION_PREFLIGHT_PASS' -GroupName 'database_preflight' -Cases @('registered migration count is 40','required security migrations registered')
  if (-not $preflightResult) { throw 'Database preflight failed; stopping before fixtures.' }
  $residueResult = Invoke-ResidueAudit -GroupName 'initial_fixture_residue_guard'
  if (-not $residueResult) { throw 'Reserved synthetic fixture residue exists; stopping before tests.' }
  $remoteSqlExecuted = $true
  foreach ($spec in $groupSpecs) { $null = Invoke-PsqlFile -File $spec.File -Marker $spec.Marker -GroupName $spec.Name -Cases $spec.Cases }

  $null = Invoke-PsqlFile -File 'candidate-ownership-regression.sql' -Marker 'KLAY_CANDIDATE_OWNERSHIP_REGRESSION_PASS' -GroupName 'candidate_ownership' -Cases @('candidate cannot cross model owner','approval ownership and identity references')
  foreach ($spec in @(@{Name='f07_client';File='f07-client.sql';Marker='KLAY_F07_CLIENT_PASS';Cases=@('client role cannot perform forbidden status mutations')},@{Name='f07_privileged';File='f07-privileged.sql';Marker='KLAY_F07_PRIVILEGED_PASS';Cases=@('privileged paths enforce protected approval context')})) {
    $null = Invoke-PsqlFile -File $spec.File -Marker $spec.Marker -GroupName $spec.Name -Cases $spec.Cases
  }

  $concurrencyAttempted = $true
  $concurrencyLog = Join-Path $safeLogs 'controlled-concurrency.log'
  $concurrencyLines = @()
  try {
    $concurrencyLines = @(& (Join-Path $suiteDir 'Invoke-AdmissionConcurrency.ps1') -PsqlPath $psqlPath *>&1 | ForEach-Object { [string]$_ })
    [IO.File]::WriteAllLines($concurrencyLog,[string[]]$concurrencyLines,[Text.UTF8Encoding]::new($false))
    Add-GroupResult -Name 'controlled_concurrency' -Status PASS -Cases @('three concurrent image admission requests','candidate SKIP LOCKED claims are distinct','concurrent product reanalysis yields one admitted and one replay') -Marker 'KLAY_CONCURRENCY_PASS' -Cleanup 'PENDING_FINAL_AUDIT' -Evidence $concurrencyLog
  } catch {
    if ($concurrencyLines.Count) { [IO.File]::WriteAllLines($concurrencyLog,[string[]]$concurrencyLines,[Text.UTF8Encoding]::new($false)) }
    Add-GroupResult -Name 'controlled_concurrency' -Status FAIL -Cases @('image admission contention','candidate claim contention','product reanalysis contention attempted') -Failures @($_.Exception.Message) -Cleanup 'CLEANUP_ATTEMPTED_FINAL_AUDIT_REQUIRED' -Evidence $concurrencyLog -NextAction 'Inspect concurrency cleanup and final residue audit.'
  }

  try { $null=Invoke-StorageApiGroup }
  catch { Add-GroupResult -Name 'storage_authenticated_api' -Status FAIL -Cases @('authenticated Storage API suite attempted') -Failures @('Storage API test failed; exception details withheld to protect credentials.') -Cleanup 'VERIFY_REQUIRED' -NextAction 'Correct disposable account setup; confirm no test objects remain.' }

  $cleanupVerified = Invoke-ResidueAudit
  foreach ($entry in $results) { if ($entry.name -eq 'controlled_concurrency') { $entry.cleanup_status = if($cleanupVerified){'VERIFIED'}else{'FAILED'} } }
  if ($startupLoadFailure) { $overall='BLOCKED' } else { $overall = Get-KlayComprehensiveVerdict -Groups $results.ToArray() -CleanupVerified $cleanupVerified }
}
catch {
  if ($isolationVerified) {
    $message = $_.Exception.Message
    $blockedPrecondition = $message -match '(?i)required|missing|not available|refusing connection|STOP|confirmation failed|did not confirm|dotenv override|metadata'
    $catchStatus = if($blockedPrecondition){'BLOCKED'}else{'FAIL'}
    $results.Add([pscustomobject]@{name='orchestrator';status=$catchStatus;test_cases_executed=@();failure_details=@($message);completion_marker='';cleanup_status='PENDING';evidence='';required_next_action='Resolve the reported prerequisite or validation failure before retrying.'})
    if ($psqlPath -and $env:PGPASSWORD) {
      $remoteSqlExecuted = $true
      try { $cleanupVerified=Invoke-ResidueAudit } catch { $cleanupVerified=$false }
    }
  } else {
    $results.Add([pscustomobject]@{name='staging_isolation_and_migration_history';status='BLOCKED';test_cases_executed=@('pre-connection isolation gates');failure_details=@($_.Exception.Message);completion_marker='';cleanup_status='NOT_STARTED';evidence='';required_next_action='Correct the staging-only project metadata and rerun. No database connection was attempted.'})
  }
  $overall = if(@($results | Where-Object status -eq 'FAIL').Count -gt 0){'FAIL'}else{'BLOCKED'}
}
finally {
  if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr) }
  if ($dbSecure) { $dbSecure.Dispose() }
  if ($pgEnvironmentCaptured) { foreach ($name in $pgNames) { if($previousPg.ContainsKey($name)){Set-Item "Env:$name" $previousPg[$name]}else{Remove-Item "Env:$name" -ErrorAction SilentlyContinue} } }
  if ((Get-Location).Path -ne $previousLocation.Path) { Pop-Location }
  if ($results.Count -lt $requiredGroups.Count) {
    foreach ($name in $requiredGroups) { if (@($results | Where-Object name -eq $name).Count -eq 0) { Add-GroupResult -Name $name -Status BLOCKED -Cases @() -Cleanup $(if($concurrencyAttempted -and -not $cleanupVerified){'UNVERIFIED'}else{'NOT_RUN'}) -NextAction 'Resolve earlier failure or provide required disposable Storage API credentials.' } }
  }
  if (-not $startupLoadFailure) { $overall = Get-KlayComprehensiveVerdict -Groups $results.ToArray() -CleanupVerified $cleanupVerified }
  if (Test-Path -LiteralPath $ReportDirectory -PathType Container) {
    $jsonPath=Join-Path $ReportDirectory "phase-7f16-$runId.json"
    $mdPath=Join-Path $ReportDirectory "phase-7f16-$runId.md"
    $report=[ordered]@{schema_version='1.0';run_id=$runId;overall=$overall;started_utc=$started.ToString('o');finished_utc=[DateTime]::UtcNow.ToString('o');staging_project_ref=$expectedRef;protected_project_ref=$protectedRef;migration_count=$expectedCount;supabase_cli_version='2.114.0';remote_tests_executed=$remoteSqlExecuted;report_directory_requested=$requestedReportDirectory;report_directory_used=$reportDirResolved;startup_failure=$reportDirectoryFailure;cleanup_verification=$(if($cleanupVerified){'PASS'}else{'NOT_VERIFIED'});groups=@($results.ToArray());recommended_fixes=@()}
    $failures=@($results | Where-Object status -eq 'FAIL');$blockedGroups=@($results | Where-Object status -eq 'BLOCKED')
    foreach($failure in $failures){$report.recommended_fixes += [ordered]@{severity='HIGH';group=$failure.name;action=$failure.required_next_action}}
    foreach($blockedGroup in $blockedGroups){$report.recommended_fixes += [ordered]@{severity='REQUIRED';group=$blockedGroup.name;action=$blockedGroup.required_next_action}}
    $json=$report | ConvertTo-Json -Depth 12
    [IO.File]::WriteAllText($jsonPath,$json,[Text.UTF8Encoding]::new($false))
    $md=@("# KLAY AI Phase 7F.16 staging report","","- **Overall:** $overall","- **Run:** ``$runId``","- **Staging project:** ``$expectedRef``","- **Migrations:** $expectedCount exact matching versions","- **Supabase CLI:** 2.114.0","- **Cleanup verification:** $($report.cleanup_verification)","","| Group | Result | Test cases executed | Failure details | Marker | Cleanup | Evidence | Next action |","|---|---|---|---|---|---|---|---|")
    foreach($g in $results){$caseText=(@($g.test_cases_executed)-join '<br>') -replace '\|','/';$failureText=(@($g.failure_details)-join '<br>') -replace '\|','/';$evidenceText=([string]$g.evidence -replace '\|','/');$nextText=([string]$g.required_next_action -replace '\|','/');$md += "| $($g.name) | $($g.status) | $caseText | $failureText | $($g.completion_marker) | $($g.cleanup_status) | $evidenceText | $nextText |"}
    $md += @('',"Detailed, secret-free group evidence is in ``$jsonPath`` and sanitized logs in ``$safeLogs``.",'')
    [IO.File]::WriteAllLines($mdPath,[string[]]$md,[Text.UTF8Encoding]::new($false))
    Write-Host "Report JSON: $jsonPath"; Write-Host "Report Markdown: $mdPath"; Write-Host "OVERALL: $overall"
  }
}

if ($overall -ne 'PASS') { exit 1 }
exit 0
