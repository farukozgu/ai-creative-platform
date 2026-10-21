# Video generation backend foundation (Phase 5A)

## Safety state

Real generation is intentionally unavailable. `VIDEO_GENERATION_ENABLED=true` is necessary but not sufficient: every model capability has `productionApproved: false`, and the default billing policy rejects reservations. Enabling the feature therefore requires an explicit code-reviewed model approval and a real atomic billing policy. Tests use injected providers; normal test and build commands never contact fal.ai.

## Verified candidate

## Phase 5E model routing (verified 2026-10-20)

The customer-facing tiers are stable and provider-neutral: `standard` routes to Kling 3.0 Pro and `pro` routes to Seedance 2.0 Standard. Both remain independently `productionApproved: false`; the feature flag, closed credit-pricing policy, and scheduler gate also remain closed. No code path in this phase submits inference.

| Customer tier | Verified fal endpoint | Source field | Duration | Ratio/resolution behavior | Audio / pricing metadata |
| --- | --- | --- | --- | --- | --- |
| `standard` | `fal-ai/kling-video/v3/pro/image-to-video` | `start_image_url` | Klay exposes 5/10 seconds (provider accepts 3–15) | Ratio follows the start image; no aspect-ratio parameter | Klay always sends audio off; $0.112/s off, $0.168/s on, $0.196/s with voice control |
| `pro` | `bytedance/seedance-2.0/image-to-video` | `image_url` | Klay exposes 5/10 seconds (provider accepts 4–15 or auto) | Klay sends explicit supported ratio and 720p; endpoint supports 480p/720p/1080p | Klay always sends audio off; pricing remains documented token-formula metadata, not a customer-credit price |

Kling and Seedance have distinct request builders. Seedance receives `image_url`, `aspect_ratio`, and `resolution`; Kling receives `start_image_url` and does not receive a fabricated ratio or resolution. Provider responses are normalized through the pre-existing queue/status/result and durable output pipeline.

The registry records, but does not approve, the prior fal.ai Kling Video v3 Standard endpoints:

| Endpoint | Mode | Verified inputs used by Klay | Price recorded |
| --- | --- | --- | --- |
| `fal-ai/kling-video/v3/standard/image-to-video` | Image to Video | start image; prompt; 5/10 seconds; source-derived ratio; audio off | USD 0.084/second with audio off |

Source: the official [image endpoint schema](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api) and its model pricing panel, checked on 2026-10-20. The endpoint does not expose a resolution input. Klay therefore records `provider-default` rather than inventing an Auto/Best resolution mapping. Image-to-video remains rejected until the decoded source ratio matches the requested UI ratio and product benchmarks approve source-derived behavior.

## Durable lifecycle

The existing `generations` lifecycle now carries project-optional, owner-scoped video rows and is idempotent on `(owner_id, client_submission_id)` for `generation_type='video'`. Existing image rows are backfilled with their project owner and remain project-required. Provider request IDs are unique per provider/endpoint. Database triggers prohibit backwards video transitions, changes after a terminal state, and replacement of an assigned provider request ID. A video job becomes `succeeded` only after an MP4 is streamed into the private `generated-videos` bucket and its durable path is stored.

`video_source_assets` registers local sources in the private `video-source-images` bucket after server-side size, MIME, decode, and dimension validation. Existing generated images are resolved by rechecking generation and project ownership. The provider receives only a short-lived URL created from an owned private object; client URLs are never forwarded.

Output delivery URLs must use HTTPS, match an allowlisted fal delivery host, report MP4 content, and stay below 250 MiB. The transfer uses a byte-counting stream. Playback and download URLs expire after five minutes and are issued only after an owner-scoped job lookup.

## Billing and recovery

The repository has no customer credit ledger or approved USD-to-credit policy. Phase 5A defines the reservation/finalization/reconciliation interface and persists provider cost separately from billing state. `DisabledVideoBillingPolicy` denies all reservations. Unknown actual cost is `null`, never zero.

The reconciliation service polls fal queue status with bounded exponential backoff, retrieves a result once, retries durable output persistence, and stops after 24 attempts. Terminal database guards make duplicate completion processing a no-op. An ambiguous queue submission is never automatically resubmitted and moves billing to reconciliation-required.

## Phase 5D credit accounting foundation

The repository did not contain a durable customer balance, credit ledger, purchase flow, subscription credit grant, refund path, or image-generation credit charge. Static plan copy is not an accounting system. `20261022000000_create_video_credit_ledger.sql` therefore introduces one canonical future credit account per owner, an append-only video reservation ledger, and idempotent video reservation records. It does not grant credits, set a customer price, or alter image-generation behavior.

An approved pricing policy must supply a quote ID and required customer-credit amount. Provider USD is stored only as provider cost metadata and is never converted into credits. The default `ClosedVideoCreditPricingPolicy` produces no quote, so `SupabaseVideoCreditBillingPolicy` rejects safely before its reservation RPC. The Video Studio remains closed.

The reservation RPC row-locks the owner's canonical account, checks spendable credits, moves credits from available to reserved, creates the durable reservation and ledger event in one transaction, and is unique on `(owner_id, submission_id)`. Settlement moves only already-reserved credits out of the reservation; release returns them only for a confirmed non-submission. Ambiguous provider outcomes retain the reservation as `reconciliation_required` rather than refunding automatically. The claimed scheduler settlement RPC additionally checks its Phase 5C lease token/version/expiry before financial mutation.

### Phase 5D staging verification

Apply the migration only to staging, seed a disposable owner account through an approved administrative grant path, and run two concurrent `reserve_video_credits` calls against different submission IDs whose combined credits exceed the balance. Exactly one must reserve. Repeat one submission ID and verify no second ledger row or balance movement occurs. Then verify repeated settlement and release calls leave balances unchanged after their first success, an ambiguous reservation cannot be released, and an old lease token receives `stale_lease`. Run reservation RPCs as anonymous and authenticated roles to confirm permission denial. Do not seed, price, or change production customer balances through this migration.

This repository has no deployed durable worker or hosting-specific cron convention. The reconciliation service is unit-testable and Phase 5C supplies its disabled scheduler entry point and atomic claims. Before launch, configure the smallest compatible scheduler to invoke it with service-role access. A serverless Next.js request must not remain open for generation, and user status reads must not be the only recovery mechanism.

## Phase 5C scheduler foundation

`20261021000000_add_video_reconciliation_leases.sql` adds an atomic, service-role-only claim function. It locks due queued/processing video jobs with `FOR UPDATE SKIP LOCKED`, applies a 120-second bounded lease, and increments a lease version. A claimant must present its token and version for every state change or retry schedule; a worker that loses its lease cannot overwrite the next claimant. The short-lived database transaction ends before polling fal.ai, downloading output, or finalizing billing.

The internal `POST /api/internal/video-reconciliation` route validates a `Bearer` token against `VIDEO_RECONCILIATION_CRON_SECRET` before inspecting scheduler state. `VIDEO_RECONCILIATION_SCHEDULER_ENABLED` defaults to disabled. Even if enabled, the endpoint will return `billing_unavailable` without claiming jobs until the atomic billing policy is installed; this intentionally prevents accidental provider polling during the closed billing phase.

No hosting provider configuration was present in the repository. Once hosting is selected, configure its scheduler to call the route once per minute with the bearer secret, a maximum invocation below 55 seconds, and no user-controlled query/body inputs. Keep the route and scheduler flags disabled until all activation checklist items are complete.

### Staging SQL verification

After applying the migration to staging, run these checks as the service role and as authenticated/anonymous roles:

```sql
select id, reconciliation_lease_token, reconciliation_lease_version
from public.claim_due_video_reconciliations(10, 120);

select * from public.claim_due_video_reconciliations(1, 120);

select routine_name, security_type from information_schema.routines
where routine_schema = 'public' and routine_name = 'claim_due_video_reconciliations';
```

Also verify that an expired lease can be reclaimed, that a fenced update using the old token affects zero rows, and that existing owner/storage RLS tests still pass.

## Activation checklist

1. Review and apply the migration in a connected Supabase staging project; run policy tests as authenticated owner, non-owner, anonymous, and service role.
2. Benchmark and approve one route for each desired Auto/Best mapping, including fidelity, latency, source-ratio behavior, and current pricing.
3. Implement and audit an atomic customer-credit ledger adapter; define reserve, finalization, release, and ambiguous-cost reconciliation policy without inventing conversion rates.
4. Deploy a durable scheduled reconciler and alerts for retry exhaustion, ambiguous submissions, output persistence, and billing reconciliation.
5. Integration-test the fal queue and storage stream with non-production credentials and a strict spend cap.
6. Set `FAL_KEY` only in the server runtime, change the selected capabilities to `productionApproved: true`, and then set `VIDEO_GENERATION_ENABLED=true` after approval.
