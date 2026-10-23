$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'KlayStorageWorkflow.ps1')
$payload=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"ref":"gklpgcyndeghjgemoonk","role":"service_role"}')).TrimEnd('=').Replace('+','-').Replace('/','_')
$serviceKey="header.$payload.signature"
$anonPayload=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"ref":"gklpgcyndeghjgemoonk","role":"anon"}')).TrimEnd('=').Replace('+','-').Replace('/','_')
$anonKey="header.$anonPayload.signature"

$emails=@($script:KlayStorageAccounts)
$missing=Test-KlayStorageCredentials -Emails $emails -Passwords @('','b') -AnonKey 'anon' -CleanupKey 'service'
if($missing.Ready){throw 'Missing account password was accepted.'}
$missingKey=Test-KlayStorageCredentials -Emails $emails -Passwords @('a','b') -AnonKey '' -CleanupKey $serviceKey
if($missingKey.Ready){throw 'Missing anon key was accepted.'}
$missingCleanup=Test-KlayStorageCredentials -Emails $emails -Passwords @('a','b') -AnonKey $anonKey -CleanupKey ''
if($missingCleanup.Ready -or $missingCleanup.Reason -notmatch 'no authenticated DELETE policy'){throw 'Missing exact cleanup key was not blocked with its reason.'}
$wrongEmail=Test-KlayStorageCredentials -Emails @('attacker@staging.invalid',$emails[1]) -Passwords @('a','b') -AnonKey $anonKey -CleanupKey $serviceKey
if($wrongEmail.Ready){throw 'Unapproved staging identity was accepted.'}
$ready=Test-KlayStorageCredentials -Emails $emails -Passwords @('a','b') -AnonKey $anonKey -CleanupKey $serviceKey
if(-not $ready.Ready){throw 'Valid local credential shape was rejected.'}
$wrongProjectPayload=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"ref":"fnzrnlvpkzwztccqzyzf","role":"service_role"}')).TrimEnd('=').Replace('+','-').Replace('/','_')
$wrongProject=Test-KlayStorageCredentials -Emails $emails -Passwords @('a','b') -AnonKey $anonKey -CleanupKey "header.$wrongProjectPayload.signature"
if($wrongProject.Ready){throw 'Protected-project service-role key was accepted.'}
$wrongRolePayload=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"ref":"gklpgcyndeghjgemoonk","role":"anon"}')).TrimEnd('=').Replace('+','-').Replace('/','_')
$wrongRole=Test-KlayStorageCredentials -Emails $emails -Passwords @('a','b') -AnonKey $anonKey -CleanupKey "header.$wrongRolePayload.signature"
if($wrongRole.Ready){throw 'Non-service key was accepted for object deletion.'}

$base=[uri]'https://gklpgcyndeghjgemoonk.supabase.co'
$auth=[pscustomobject]@{access_token='temporary-local-token'}
$user=[pscustomobject]@{id='10000000-0000-4000-8000-000000000001';email=$emails[0]}
$identity=Get-KlayStorageIdentity -AuthResponse $auth -UserResponse $user -ExpectedEmail $emails[0] -BaseUri $base
if($identity.UserId -ne $user.id -or $identity.AccessToken -ne $auth.access_token){throw 'Valid Auth identity was not retained in memory.'}
foreach($case in @(
  @{Auth=$null;User=$user;Email=$emails[0];Uri=$base},
  @{Auth=[pscustomobject]@{access_token=''};User=$user;Email=$emails[0];Uri=$base},
  @{Auth=$auth;User=[pscustomobject]@{id='not-a-uuid';email=$emails[0]};Email=$emails[0];Uri=$base},
  @{Auth=$auth;User=$user;Email=$emails[1];Uri=$base},
  @{Auth=$auth;User=$user;Email=$emails[0];Uri=[uri]'https://fnzrnlvpkzwztccqzyzf.supabase.co'}
)){ $threw=$false;try{$null=Get-KlayStorageIdentity -AuthResponse $case.Auth -UserResponse $case.User -ExpectedEmail $case.Email -BaseUri $case.Uri}catch{$threw=$true};if(-not $threw){throw 'Malformed or wrong-project Auth response was accepted.'} }

$userA='10000000-0000-4000-8000-000000000001';$userB='10000000-0000-4000-8000-000000000002'
$threw=$false;try{$null=New-KlayStorageProjectProvisionSql -UserA $userA -UserB $userA}catch{$threw=$true};if(-not $threw){throw 'Duplicate authenticated identities were accepted for provisioning.'}
$sql1=New-KlayStorageProjectProvisionSql -UserA $userA -UserB $userB
$sql2=New-KlayStorageProjectProvisionSql -UserA $userA -UserB $userB
if($sql1 -cne $sql2){throw 'Repeat provisioning did not produce the same deterministic contract.'}
foreach($pattern in @('pg_advisory_xact_lock','KLAY_PHASE7F18_STORAGE_A','KLAY_PHASE7F18_STORAGE_B','NOT EXISTS','user_id','public.projects')){if($sql1 -notmatch [regex]::Escape($pattern)){throw "Provisioning SQL omitted required idempotency/ownership contract: $pattern"}}
if($sql1 -match '(?i)delete\s+from|drop\s+table|truncate\s+table'){throw 'Provisioning SQL includes destructive cleanup.'}

$runner=Get-Content (Join-Path $PSScriptRoot 'Invoke-KlayComprehensiveStaging.ps1') -Raw
if($runner.IndexOf('$uploaded[$i] = $true') -lt 0 -or $runner.IndexOf('$uploaded[$i] = $true') -gt $runner.IndexOf('Invoke-RestMethod -Method Post -Uri $uri')){throw 'Upload uncertainty is not covered by finally cleanup.'}
if($runner.IndexOf("SELECT count(*) FROM storage.objects WHERE bucket_id='product-assets' AND name='") -gt $runner.IndexOf('$uploaded[$i] = $true')){throw 'Exact object collision preflight is not guaranteed before cleanup ownership is recorded.'}
if($runner -notmatch 'Method Delete[\s\S]*storage/v1/object/product-assets' -or $runner -notmatch 'storage\.objects WHERE bucket_id=''product-assets'' AND name='){throw 'Exact API cleanup/read-only residue audit is missing.'}
if($runner.IndexOf('New-KlayStorageProjectProvisionSql') -lt 0 -or $runner.IndexOf("'-1'",$runner.IndexOf('New-KlayStorageProjectProvisionSql')) -lt 0 -or $runner.IndexOf('$uploaded[$i] = $true') -lt $runner.IndexOf("'-1'",$runner.IndexOf('New-KlayStorageProjectProvisionSql'))){throw 'Provisioning transaction or fail-path cleanup registration is missing.'}
if($runner -notmatch 'finally\s*\{' -or $runner -notmatch 'if \(\$uploaded\[\$i\] -and \$cleanupKey\)'){throw 'Object cleanup is not registered in a finally block.'}
if($runner -match 'Read-Host[^\r\n]*(project UUID|project id|account email)'){throw 'Operator is still asked to supply project IDs or emails.'}
Write-Host 'PASS: missing credentials, account allowlist, distinct identities, malformed Auth responses, staging project rejection, deterministic repeat provisioning, non-destructive ownership SQL, and cleanup/residue contracts.'
