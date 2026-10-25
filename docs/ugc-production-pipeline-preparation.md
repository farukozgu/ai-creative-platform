# UGC pipeline preparation — disabled

> Historical Kling preparation below. New submission verification defaults to Seedance 2.5. Version 1 Kling plans retain their original reconciliation route. The [current audit](ugc-seedance-integration-audit.md) supersedes capability statements below. The review-only SQL proposal now accepts historical Kling/15s and Seedance/15s or 30s plans; it remains unapplied. No installed foundation migration was changed.

## Scope and current audit

No paid requests, provider-credit use, live Supabase mutations, migration application, billing integration, cron or worker deployment occurred. Generate UGC, the existing UGC adapter's `submit`, and the new `requestUgcGeneration` entry point remain unconditionally disabled. No environment flag enables them. No new pipeline module is imported by an app route, action or UI component. Verification services require explicitly injected dependencies; the submission helper requires an injected fetch and credential and has no live transport default.

The existing integration is **fal.ai**, not direct Kling authentication. `FalVideoGenerationProvider` already supplied `FAL_KEY` authentication and queue submit/status/result APIs. Shared client creation was extracted into `createServerFalClient`; Video Studio retains its existing defaults/payloads/approval gates. Its status reader now rejects unknown statuses instead of treating every unexpected response as completion. Tests verify all three existing valid mappings. The UGC task reader continues to use that class.

Installed `@fal-ai/client` queue submission overrides client retry configuration with three retries. Merely setting `retry.maxRetries = 0` on a client is insufficient. The UGC-only submission helper reuses shared client construction and `queue.submit` with a request-scoped fetch latch set **before** awaiting network I/O. Generic sanitized errors remove retryable HTTP/network metadata; the latch independently rejects any subsequent HTTP attempt. The fetch rejects redirects, unexpected origin/method and has a 30-second timeout. Tests exercise the installed SDK itself against fake responses; they never call fal.

## Verified schema versus application support

Read-only source: [official selected Kling v3 Pro I2V schema](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api).

The schema supports a start image, 3–15-second durations, character/object image elements, and a downloadable video file. Image elements expose a frontal image and 1–3 reference images, referenced using `@Element1`, etc. It has no aspect-ratio input; the start image determines ratio. Native audio is documented for English/Chinese; other languages translate to English. Element voice IDs have a separate creation workflow. These statements do not establish exact script delivery or synchronized speech quality.

The new planner only prepares **15-second silent visual requests** with verified private image inputs. Current saved UGC projects still contain placeholder creator concepts and spoken dialogue, so they explicitly fail planning. The test-only successful fixtures are not available UI creators.

| Input | Preparation behavior |
| --- | --- |
| Creator concept | Selection retained; `placeholder_visual` is rejected. Future trusted provisioning must supply an actual `image_reference` and authorized reference set. No creator identity/consent/fidelity approval is inferred from that field. |
| Product | Snapshot product path must match the product element's frontal image. No product-to-creator substitution. |
| Start frame / references | All inputs use `ugc-product-assets` owner/project paths with pinned SHA-256 and dimensions. Planner validates shapes and 1–3 reference limits. Media resolver verifies actual bytes/format/dimensions before signing. |
| Scene / environment / lighting / framing / format | Retained separately in the immutable plan and translated into textual visual direction, not invented provider controls. Prompt limit checked. |
| Spoken dialogue / language / voice / tone | Retained in the brief. Nonempty speech returns exact-dialogue, voice-selection and lip-sync-unverified issues; Turkish adds an explicit unsupported-speech issue. No spoken words are appended to the visual prompt. |
| Subtitles | Explicit unsupported result when requested. No silent omission or unimplemented postproduction claim. |
| Duration / ratio | Only 15 seconds; 30/60 rejected. Decoded start image must match requested ratio; no fabricated aspect-ratio payload parameter. |

English native-audio handling, exact spoken words, voice-preset mapping, Turkish speech, lip synchronization and subtitles remain unimplemented/unverified. Turkish would need a suitable speech service and validated synchronization, potentially separate lip sync. All output generation stays disabled regardless of planner success.

## Immutable snapshot and plan contract

`planUgcKlingRequest` takes an owned database job, never current project settings. Future reference-enabled snapshots must include `referenceImages.startImage`, `.creator` and `.product`, each image carrying `objectPath`, `sha256`, `width`, `height`; creator/product elements contain `frontal` and `references`. No client-facing action accepts or provisions these assets today.

Successful new reference-enabled snapshots must have `request_hash = SHA256(canonicalUgcJson(snapshot))`. JSONB reorders keys, so serialization-order hashing is unsuitable for this new contract. Existing draft hashes and stored snapshots are never rewritten; their unsupported placeholders/speech are reported before checking the new reference-enabled canonical digest. The provider plan stores a canonical snapshot digest and pins version, provider, model and endpoint. Reconciliation recomputes and canonically compares the plan, independent of JSONB property order. Signed URLs are ephemeral and are not persisted in the plan.

The existing project `configuration.script` compatibility field, separate scene/dialogue persistence and existing Video Studio duration registry are unchanged. The new UGC planner independently admits provider-supported 15 seconds without broadening Video Studio's 5/10-second contract.

## State and database preparation

`database/migrations/20261104000000_prepare_ugc_pipeline_claims.sql` is **forward-only, review-only, not applied**. The applied foundation migration was not modified. Added fields are necessary because the foundation has no immutable provider route/plan or reconciliation lease/fencing state.

- `claim_ugc_submission` uses an owner/hash-scoped row lock with `SKIP LOCKED` and atomically changes draft to queued. A submission timestamp prevents reuse. The existing unique active-project index also arbitrates different job IDs/idempotency keys. No SQL transaction spans network I/O.
- Claims carry a random token, increasing version and 180-second expiry. Before a POST, `is_ugc_claim_current` requires enough remaining time for the bounded submit/checkpoint. Only the claimant may attach a task ID. Provider plans/identity, started submission and attached task IDs become immutable; provider/task pairs are unique.
- A timeout, invalid submission response or failure checkpointing an accepted task becomes `provider_submission_ambiguous`. There is no automatic resubmission. A crashed claimant with no saved task ID is reconciled to ambiguous after lease expiry. Ambiguous jobs continue to occupy the active-project slot and need manual investigation; no automatic recovery can guarantee a lost provider task ID.
- `claim_ugc_reconciliation` scopes a single due active job to an owner. It claims no ambiguous/terminal jobs and cannot overlap a current lease. There is no scheduled scanner or hosting integration.
- `finish_ugc_claim` requires the exact live token/version. Pending status cannot regress from processing to queued. Backoff is bounded, and reconciliation stops after 24 attempts. Safe error codes are persisted; raw provider errors/URLs/credentials are not returned.
- Provider COMPLETED is not job success. A successful final RPC performs queued→processing if needed, then commits all output metadata and succeeded in one transaction, respecting the existing result CHECK. Expired workers cannot commit metadata. Output metadata becomes immutable at terminal state.
- All RPCs are service-role-only with an empty search path; existing authenticated column grants and owner/storage RLS remain in force. No new financial columns or RPCs exist.

SQL has only been statically inspected/tested here. `database/verification/ugc_pipeline_preparation.sql` contains read-only metadata queries and a staging concurrency/permission checklist. It was not run. Real PostgreSQL concurrency, migration compatibility and role/RLS validation are required before any activation.

## Private media flow

`SupabaseUgcPrivateMedia.resolveInput` checks paths against the owned immutable job, reads private sources, verifies SHA-256, decodes image metadata with existing sharp, checks dimensions/orientation/non-animation, and signs provider-only HTTPS URLs for one hour. Conflicting metadata for repeated object paths is rejected. URLs must belong to the configured Supabase origin and signed private bucket path. Missing/replaced sources fail before POST. The URL lifetime versus actual provider queue delay requires live verification; no bucket is made public.

Result handling reuses the existing provider URL/size validator, with additional restricted media hosts, no credentials/custom ports, HTTPS, redirect rejection, 60-second download timeout, MIME/declared-size checks and a 250 MiB transferred-byte cap. Missing Content-Length is allowed. MP4 box boundaries, a nonempty media box, a video track, duration near 15 seconds and requested aspect ratio are inspected. This is **container inspection, not full codec decoding, audio verification, frame-quality or lip-sync validation**; production needs additional playback/decoding and fidelity checks. Bounded downloads are buffered, so memory limits need benchmarking before launch.

Uploads use service role, `upsert: false`, and deterministic `ugc-generated-videos/{owner}/{project}/{job}.mp4`. After upload-before-DB-checkpoint failure, a subsequent claimant validates and reuses the existing complete object. Stale workers cannot overwrite it or commit metadata. Invalid stored objects fail closed; quarantine/deletion is a manual operation in this phase. No orphan cleanup scheduler was added.

`createOwnedUgcVideoAccess` authenticates the user again, loads an owner-scoped succeeded job, verifies the exact bucket/path and returns a five-minute signed URL using the authenticated client/RLS. Provider URLs are never returned as playback URLs. Existing UGC result access remains unchanged; this new access helper is not wired to a route yet.

## Remaining work / activation boundaries

1. Review the forward migration, then separately authorize staging application and execute the metadata, concurrency, stale-lease and role/RLS checks. Production remains disabled.
2. Provision actual authorized creator/reference/start-frame assets, generate canonical immutable snapshots, preserve referenced media for the job lifetime and benchmark identity/product fidelity. Existing product replacement/removal still deletes old assets; the prepared resolver detects loss but does not implement a new retention system.
3. Resolve speech/language/voice/lip-sync/subtitle requirements explicitly. Current UI jobs cannot use the supported silent visual subset without losing requested capabilities and therefore are rejected.
4. Add full playback/decoder verification, test private media recovery/orphan handling, load/memory budgets and queue-versus-signed-URL lifetime. Verify the actual fal queue/status/result shapes with separately authorized controlled provider calls later.
5. Review the unregistered verification seams and explicitly wire a future approved executor/reconciler only after the above. This task adds no billing and makes no readiness or spend-policy decision.

## Files and validation

New modules: `ugc-request-planner.ts`, `ugc-fal-submission.ts`, `ugc-pipeline-types.ts`, `ugc-pipeline-repository.ts`, `ugc-pipeline.ts`, `ugc-private-media.ts`. Shared change: `video-generation/fal-provider.ts`. SQL: the new migration and its separate read-only verification file. Tests: `tests/ugc-pipeline.test.ts`. No package changes, UI changes, Creative Composer changes or Model Studio changes.

Focused UGC plus existing Video backend/billing/scheduler/state/UI/library/handoff tests: **89 passed**. `npx tsc --noEmit`, `npm run lint`, `npm run build` and `git diff --check` passed. Tests use fake fetch/storage/repositories and actual SDK request logic with fake credentials; no network leaves the test. Mobile/focus/browser-console checks are not part of this server-only change; authenticated refresh, Storage RLS and real playback remain staging/manual checks.
