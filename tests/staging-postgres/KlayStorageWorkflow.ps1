$script:KlayStorageAccounts = @('klay-storage-a@staging.invalid','klay-storage-b@staging.invalid')
$script:KlayStorageProjectTitles = @('KLAY_PHASE7F18_STORAGE_A','KLAY_PHASE7F18_STORAGE_B')

function Get-KlayJwtPayload {
  param([string]$Token)
  $parts=$Token.Split('.')
  if($parts.Count -ne 3){return $null}
  try{
    $payload=$parts[1].Replace('-','+').Replace('_','/')
    switch($payload.Length % 4){2{$payload+='=='};3{$payload+='='};1{return $null}}
    [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json -ErrorAction Stop
  }catch{return $null}
}

function Test-KlayStorageCredentials {
  param([string[]]$Emails,[string[]]$Passwords,[string]$AnonKey,[string]$CleanupKey)
  if ($Emails.Count -ne 2 -or $Passwords.Count -ne 2) { return [pscustomobject]@{Ready=$false;Reason='Both existing disposable account passwords are required.'} }
  for ($i=0; $i -lt 2; $i++) {
    if ($Emails[$i] -cne $script:KlayStorageAccounts[$i]) { return [pscustomobject]@{Ready=$false;Reason='Storage account emails do not match the two allowlisted staging identities.'} }
    if ([string]::IsNullOrWhiteSpace($Passwords[$i])) { return [pscustomobject]@{Ready=$false;Reason="Password for disposable account $($i+1) is missing."} }
  }
  if ([string]::IsNullOrWhiteSpace($AnonKey)) { return [pscustomobject]@{Ready=$false;Reason='Staging anon/publishable API key is missing.'} }
  if ([string]::IsNullOrWhiteSpace($CleanupKey)) { return [pscustomobject]@{Ready=$false;Reason='Staging service-role key is required because product-assets has no authenticated DELETE policy.'} }
  $cleanupClaims=Get-KlayJwtPayload -Token $CleanupKey
  if(-not $cleanupClaims -or $cleanupClaims.ref -cne 'gklpgcyndeghjgemoonk' -or $cleanupClaims.role -cne 'service_role'){
    return [pscustomobject]@{Ready=$false;Reason='Cleanup key must be a staging-project JWT with service_role claim; opaque or other-project keys are rejected.'}
  }
  $anonClaims=Get-KlayJwtPayload -Token $AnonKey
  if($anonClaims -and $anonClaims.ref -cne 'gklpgcyndeghjgemoonk'){
    return [pscustomobject]@{Ready=$false;Reason='JWT API key belongs to another Supabase project.'}
  }
  [pscustomobject]@{Ready=$true;Reason=''}
}

function Get-KlayStorageIdentity {
  param([object]$AuthResponse,[object]$UserResponse,[string]$ExpectedEmail,[uri]$BaseUri)
  if (-not $BaseUri -or $BaseUri.Scheme -cne 'https' -or $BaseUri.Host -cne 'gklpgcyndeghjgemoonk.supabase.co') { throw 'Storage Auth endpoint is not the allowlisted staging project.' }
  if (-not $AuthResponse -or [string]::IsNullOrWhiteSpace([string]$AuthResponse.access_token)) { throw 'Auth response is malformed or contains no access token.' }
  $id = [guid]::Empty
  if (-not $UserResponse -or -not [guid]::TryParse([string]$UserResponse.id,[ref]$id) -or $id -eq [guid]::Empty) { throw 'Authenticated user response contains an invalid identity ID.' }
  if ([string]$UserResponse.email -cne $ExpectedEmail) { throw 'Authenticated identity does not match the expected disposable account.' }
  [pscustomobject]@{AccessToken=[string]$AuthResponse.access_token;UserId=$id.ToString('D');Email=[string]$UserResponse.email}
}

function New-KlayStorageProjectProvisionSql {
  param([string]$UserA,[string]$UserB)
  $a=[guid]::Empty;$b=[guid]::Empty
  if (-not [guid]::TryParse($UserA,[ref]$a) -or $a -eq [guid]::Empty -or -not [guid]::TryParse($UserB,[ref]$b) -or $b -eq [guid]::Empty -or $a -eq $b) { throw 'Provisioning requires two distinct authenticated UUIDs.' }
  $idA=$a.ToString('D');$idB=$b.ToString('D')
  @"
DO `$provision_guard`$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('klay-phase7f18-storage-projects'));
  IF (SELECT count(*) FROM public.projects WHERE title IN ('KLAY_PHASE7F18_STORAGE_A','KLAY_PHASE7F18_STORAGE_B')) > 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: duplicate reserved Storage project marker';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects WHERE title='KLAY_PHASE7F18_STORAGE_A' AND user_id <> '$idA'::uuid)
     OR EXISTS (SELECT 1 FROM public.projects WHERE title='KLAY_PHASE7F18_STORAGE_B' AND user_id <> '$idB'::uuid) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: reserved Storage project marker belongs to another user';
  END IF;
  IF (SELECT count(*) FROM public.projects WHERE title='KLAY_PHASE7F18_STORAGE_A') > 1
     OR (SELECT count(*) FROM public.projects WHERE title='KLAY_PHASE7F18_STORAGE_B') > 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: duplicate reserved Storage project marker';
  END IF;
END
`$provision_guard`$;
INSERT INTO public.projects(user_id,title)
SELECT '$idA'::uuid,'KLAY_PHASE7F18_STORAGE_A'
WHERE NOT EXISTS (SELECT 1 FROM public.projects WHERE user_id='$idA'::uuid AND title='KLAY_PHASE7F18_STORAGE_A');
INSERT INTO public.projects(user_id,title)
SELECT '$idB'::uuid,'KLAY_PHASE7F18_STORAGE_B'
WHERE NOT EXISTS (SELECT 1 FROM public.projects WHERE user_id='$idB'::uuid AND title='KLAY_PHASE7F18_STORAGE_B');
SELECT id::text || E'\t' || user_id::text || E'\t' || title
FROM public.projects
WHERE (user_id='$idA'::uuid AND title='KLAY_PHASE7F18_STORAGE_A')
   OR (user_id='$idB'::uuid AND title='KLAY_PHASE7F18_STORAGE_B')
ORDER BY title;
"@
}
