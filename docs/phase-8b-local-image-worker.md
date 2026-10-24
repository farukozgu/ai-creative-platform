# Phase 8B: selected local image worker

Code is prepared; database prerequisites remain **UNVERIFIED**. No database,
Storage or provider requests were made during implementation. No activation.

## Database preflight (read only)

In Supabase SQL Editor select **fnzrnlvpkzwztccqzyzf**, confirm the project ref in
the dashboard URL, and run `docs/phase-8a-image-generation-preflight.sql`.
Do not execute any migration or invoke a claim/renew RPC during preflight.
Every required column/type, constraint, index and RPC must exist. Service-role
table privileges and both RPC execution grants must pass; anon/authenticated
RPC access must be false. Compare returned RPC bodies with migrations
20261027000000 through 20261029000000, especially attempts < 3, leases,
not_started-only reclaim, and token/version/expiry renewal fencing. Buckets
must exist and be private. Review owner policies and service_role bypass.
The projects SELECT grant already exists in migration 20260901001000: repair
only verified drift in a separately authorized task. SQL catalog checks cannot
prove the configured secret's role or Storage API success; these remain runtime
checks. Do not enable execution while any prerequisite is missing/unknown.

## Operator procedure (Windows PowerShell 5.1)

Only after preflight passes, from the repository in one PowerShell window:

```powershell
# Process-local only. Never print this secret or write it to an env file.
if (netstat.exe -ano -p tcp | Select-String '127\.0\.0\.1:3000\s+.*LISTENING') {
  throw 'Stop the existing local server first.'
}
$workerBytes = New-Object byte[] 32
$workerRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$workerRng.GetBytes($workerBytes)
$workerRng.Dispose()
$env:IMAGE_GENERATION_WORKER_SECRET = [Convert]::ToBase64String($workerBytes)
$env:IMAGE_GENERATION_WORKER_ENABLED = 'true'
$workerServer = Start-Process -FilePath 'node.exe' -ArgumentList @(
  'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3000'
) -WindowStyle Hidden -PassThru
```

Wait for localhost to be ready, then create one job in Creative Composer. Local
batch/cron execution is refused. Copy the generation UUID from `?generation=...`.
Obtain its owner/project IDs and exact stored model from the read-only operator
query at the end of the preflight. Select a reference-edit job; pixel-lock jobs
are refused rather than authorizing extra paid segmentation. Do not change its
row. Continue in the SAME PowerShell window; do not leave the enabled server
unattended, and run the cleanup below even if Composer fails:

```powershell
$workerSelection = @{
  generationId = '<generation-uuid>'
  ownerId = '<owner-uuid>'
  projectId = '<project-uuid>'
  model = 'gpt-image-2.5-sunburst' # exact model stored on the selected row
  maxQuality = 'high' # use 'xhigh' only if explicitly authorizing its promotion
  maxImageCalls = 1
  authorizeAuxiliaryCalls = $true # analysis/enhancement/validation may cost extra
}
$workerHeaders = @{ Authorization = "Bearer $env:IMAGE_GENERATION_WORKER_SECRET" }
$workerUrl = 'http://127.0.0.1:3000/api/internal/local-image-generation-worker'
try {
  Invoke-RestMethod -Method Post -Uri $workerUrl -Headers $workerHeaders `
    -ContentType 'application/json' -Body ($workerSelection | ConvertTo-Json) -TimeoutSec 800
  $workerStatusUrl = $workerUrl + '?generationId=' + $workerSelection.generationId +
    '&ownerId=' + $workerSelection.ownerId + '&projectId=' + $workerSelection.projectId
  for ($workerPoll = 0; $workerPoll -lt 160; $workerPoll++) {
    $workerStatus = Invoke-RestMethod -Uri $workerStatusUrl -Headers $workerHeaders -TimeoutSec 10
    $workerStatus
    if ($workerStatus.status -in @('succeeded','failed','reconciliation_required')) { break }
    Start-Sleep -Seconds 5
  }
} catch {
  Write-Warning 'Request failed or timed out. Inspect status; DO NOT repeat POST.'
  # Keep the server alive for a read-only inspection before cleanup.
  $workerStatusUrl = $workerUrl + '?generationId=' + $workerSelection.generationId +
    '&ownerId=' + $workerSelection.ownerId + '&projectId=' + $workerSelection.projectId
  try { Invoke-RestMethod -Uri $workerStatusUrl -Headers $workerHeaders -TimeoutSec 10 } catch {
    Write-Warning 'Status unavailable. Operator reconciliation required; no replay.'
  }
} finally {
  $env:IMAGE_GENERATION_WORKER_ENABLED = 'false'
  Remove-Item Env:IMAGE_GENERATION_WORKER_SECRET -ErrorAction SilentlyContinue
  # Stop the owned process tree; its inherited flag stays true until stopped.
  $workerListener = netstat.exe -ano -p tcp | Select-String '127\.0\.0\.1:3000\s+.*LISTENING'
  foreach ($workerLine in $workerListener) {
    $workerListenerId = [int](($workerLine.ToString().Trim() -split '\s+')[-1])
    $workerChild = Get-Process -Id $workerListenerId -ErrorAction SilentlyContinue
    if ($workerChild -and $workerChild.ProcessName -eq 'node' -and $workerChild.StartTime -ge $workerServer.StartTime) {
      Stop-Process -Id $workerListenerId
    }
  }
  if (-not $workerServer.HasExited) { Stop-Process -Id $workerServer.Id }
}
```

GET is read only and can also be called from a second shell with securely
provided headers while POST is pending. Never paste headers into logs. Browser
status polling continues normally. If POST times out, use GET to inspect status
before stopping the server; do not resend. A nonterminal expired lease is a
manual-reconciliation case. Restore ordinary `npm run dev` with the flag false.

## Safety and costs

The local endpoint is development-only, pins the protected project URL, and
requires the server-only worker secret plus explicit owner/project/job/model
and cost authorization. A single conditional Postgres UPDATE claims only that
fresh row: queued, attempts/version zero, a submission ID and input asset,
no lease/output/request ID, and
not_started/null submission state. A competing claimant changes these fields,
so only one succeeds. Other backlog rows cannot be selected. A process busy
guard rejects overlapping requests; database fencing protects across processes.
Attempts are set to the existing maximum (3), deliberately prohibiting automatic
reclaim even after a pre-provider crash. Never reset a selected job to retry it.

Execution uses the existing worker with lease renewal, path/owner validation,
checkpoints, fidelity validation, private output and terminal fencing intact.
An async-local budget permits one Images API call (`n: 1`, SDK retries zero),
for the selected model/project/job only. High-to-xhigh promotion is refused
unless authorized; it is not silently downgraded. Automatic repair is skipped
locally, so fidelity rejection may fail the job. Paid segmentation is refused.
Production worker behavior is unchanged. Existing edit admission and credit
controls are not replaced; the current image pipeline has no wired credit
reservation/settlement, so this is not production billing readiness.

The default model is gpt-image-2.5-sunburst. Policy may promote high to xhigh for
identity-sensitive products. Prompt enhancement, reference analysis, artwork
analysis and fidelity validation remain separate potentially paid operations;
Composer product analysis may also incur cost before dispatch. This is a bound
of **one paid image request**, not one total paid API request or a USD cap.
OpenAI documents $8/M image-input tokens, $30/M image-output tokens and $5/M
text-input tokens for this model. Estimated image cost is therefore
`(8 * image_input_tokens + 30 * image_output_tokens + 5 * text_input_tokens) / 1e6`,
plus auxiliary calls. No reliable fixed dollar ceiling is established here.
Source: https://developers.openai.com/api/docs/guides/image-generation

Unknown provider outcomes retain existing reconciliation behavior; never replay
them. A worker timeout cannot be treated as proof that the provider did no work.
