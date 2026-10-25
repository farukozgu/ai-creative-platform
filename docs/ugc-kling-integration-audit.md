# UGC / existing Kling integration audit

> Historical Kling preparation audit. New UGC preparation selects Seedance 2.5; see the [current provider separation audit](ugc-seedance-integration-audit.md). Keep this document and the legacy adapter for historical pinned Kling tasks. Video Studio's provider code and behavior are unchanged by the separation.

## Phase 1 findings (before implementation)

The existing integration is Kling through **fal.ai**, not a direct Kling REST/JWT integration. There is no separate Kling access/secret key or authentication implementation to reuse or replace.

| Area | Local implementation | Actual state / reuse |
| --- | --- | --- |
| Authentication / HTTP | `src/lib/video-generation/fal-provider.ts`, `@fal-ai/client`, server-only `FAL_KEY` | Reuse the class; do not introduce another client or credential. Constructor requires a key; no key validity or account access was checked. |
| Routing / capabilities | `capabilities.ts` | Standard routes to Kling v3 Pro I2V; Pro routes to Seedance. Both `productionApproved: false`. |
| Payload | `fal-request.ts` | Kling sends `start_image_url`, prompt, string duration, audio off, safety on. Only 5/10 seconds are typed and admitted locally. No separate creator/product inputs. |
| Text to video | `types.ts`, `validation.ts` | Historical records can contain text mode; new requests reject it. No active T2V builder. Older documentation mentions endpoints that are no longer in the registry. |
| Async transport | `FalVideoGenerationProvider` | Queue submit, status, result, cancel implemented. No live execution verified in this audit. |
| Submission | `service.ts` | Unique persisted submission precedes POST; uncertain submission is marked ambiguous and not automatically resubmitted. Requires approved capabilities and billing. |
| Video routes | `dashboard/video/generation-actions.ts`, `dashboard/video/actions.ts`, video library pages | Authenticated status/library/source operations exist. Production submit action ends at `billing_unavailable`; it does not wire the submit service. |
| Billing | `billing.ts`, `supabase-credit-billing.ts` | Atomic ledger adapter exists, but pricing policy is closed and production wiring remains disabled. |
| Recovery | `reconciliation.ts`, `scheduler.ts`, `api/internal/video-reconciliation/route.ts` | Retry/backoff and fenced SQL leases exist for Video Studio. Internal route ends at `billing_unavailable`; no active worker. |
| Output | `output.ts`, `media-access.ts` | Allowlisted HTTPS download, redirect rejection, MP4 header/size checks, streaming byte cap, private `generated-videos`, signed playback. Not a codec/duration probe. |
| UGC foundation | `ugc-studio-contract.ts`, `ugc-projects.ts`, UGC actions and existing foundation SQL | Owned drafts, product storage, hashed immutable job snapshots, owner/idempotency uniqueness, one active project job, signed successful outputs. Preparation only; provider initially an unused interface. |
| Gates / tests | `.env.example`, `tests/video-*.test.ts`, `tests/ugc-foundation.test.ts` | Video and scheduler flags default off. Mocked backend, billing, scheduler, UI/state and UGC foundation tests exist. No live provider evidence. |

Existing local UGC files and migration were already uncommitted when this task started. They are the input foundation, not newly created by this audit. No credentials were printed and no provider or Supabase mutation was performed.

## Capability assessment

Provider schema checked read-only: [official Kling v3 Pro I2V schema](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api). This describes provider capabilities, not approved application support.

The endpoint requires a start image; optional elements can reference characters/objects. Provider durations are 3–15 seconds. Native voice output supports English/Chinese; other languages are translated to English. Elements may reference a voice ID, obtained through a separate voice workflow. None of those optional inputs are currently implemented locally. The schema returns a downloadable video file. It exposes no explicit aspect-ratio input for this endpoint.

| UGC setting | Safe mapping today | Missing work |
| --- | --- | --- |
| Creator Ada/Deniz/Maya | None: saved concepts are `placeholder_visual`, not identities or provider images | Real authorized creator assets, identity/reference policy and evaluation |
| Product photo | Private product asset exists; it must not silently substitute for a creator/product scene | Validated composite start frame or reviewed element-reference builder; snapshot source retention |
| Script | Cannot treat dialogue as an ordinary motion prompt and claim spoken delivery | Script-to-scene planning, speech generation and lip-sync/synchronization validation |
| Language / voice / tone | No speech mapping: shared builder forces audio off | Separate verified speech pipeline; voice presets do not equal provider voice IDs; Turkish needs a suitable service |
| Format / environment / lighting / framing | Potential prompt direction only, not dedicated request fields | Reviewed prompt composer and benchmarks; no exact visual guarantees |
| 15 / 30 / 60 seconds | All unsupported by current shared 5/10-second contract | 15 needs deliberate shared-contract expansion; 30/60 need multi-clip generation/editing and cost policy; never truncate silently |
| 9:16 / 1:1 / 16:9 | Source-derived | Decode prepared start frame and validate ratio; no fabricated ratio parameter |
| Subtitles | No local provider mapping | Timed captions and rendering/postproduction |
| Poll / result | Reuse existing fal status/result methods | UGC-owned task mapping, worker and durable delivery; provider completion alone is not job success |

## Sharing limits and persistence plan

Reuse authentication, transport, endpoint registry and existing payload builder. Do not call Video Studio's submission service, repository or output store with a UGC record. They use `generations`, video billing and `${owner}/${job}/output.mp4` in `generated-videos`. UGC requires `ugc_video_jobs` and `${owner}/${project}/${job}.mp4` in `ugc-generated-videos`.

The existing UGC result constraint prohibits processing-state output checkpoints, whereas Video Studio checkpoints output before billing and success. This is a genuine incompatibility with **direct reuse of that reconciler**, not a need for a migration in this preparation phase. UGC needs its own final atomic metadata/success transition. The current SQL has no UGC worker lease/fencing RPC. Design and report any required lease schema extension before enabling production; no new migration is introduced here.

For eventual delivery: load the owned immutable job, resolve its pinned provider/model/endpoint, poll the stored `provider_request_id`, retrieve the file, apply the existing URL/redirect/stream limits plus MP4 probing and measured duration, upload with service role to the deterministic UGC path, and atomically commit all required output metadata with `succeeded`. Enforce the existing 250 MiB application cap even though the UGC bucket permits 512 MiB. Serve only owner-authorized short-lived signed URLs. Never expose provider URLs in the UI. Recovery after upload-before-DB-commit must verify and reuse an existing complete object rather than overwrite it; quarantine/delete invalid orphans. Do not mark a task succeeded merely because fal reports COMPLETED.

## Duplicate submission and activation requirements

Draft idempotency is not provider idempotency. Before any future POST, atomically claim `draft -> queued` with owner/project/hash checks; only the successful claimant can submit. The existing unique active-project index arbitrates different keys. A timeout, process crash after claim, or failure attaching the returned task ID must block automatic resubmission and enter ambiguous/manual reconciliation. The shared fal client does not pass a provider deduplication key; its POST retry semantics also require verification before activation. Persist provider/endpoint/model routing before dispatch (versioned snapshot plan or another reviewed immutable routing representation), then attach the task ID exactly once. Do not re-resolve an old task through a mutable default route. No claim or paid submission is implemented in this phase.

Installed SDK inspection found a concrete submission hazard: `node_modules/@fal-ai/client/src/queue.js` passes `QUEUE_RETRY_CONFIG` with `maxRetries: 3` to queue submission. `request.js` merges per-operation options over client configuration and retries eligible errors, including transport errors and HTTP 429/502/503/504 (`retry.js`). A single application submit can therefore send up to four POST attempts. Merely setting client-level `retry.maxRetries = 0` does not override that queue option. The existing authentication and read-only methods can be shared now, but its submission transport cannot be enabled safely for UGC until a reviewed no-repeat POST policy or documented provider deduplication guarantee is in place. No SDK/provider submission behavior was changed for Video Studio.

The existing output downloader also treats a missing Content-Length header as zero (`Number(null)`), rejecting otherwise valid chunked responses. Its checks do not probe MP4 structure or measured duration. These are limitations to resolve before reusing download code for real UGC delivery; the existing Video Studio output store was left unchanged.

Snapshot immutability does not preserve media bytes: existing product replacement/removal deletes old objects. Pin/copy sources per job before activation. Add atomic billing, provider error classification, bounded/fenced durable polling, retention and orphan recovery. Verify RLS and bucket constraints in staging, asset dimensions and fidelity, scripts/audio/lip sync, supported durations and output media, and SDK submission retry behavior. A separately authorized controlled provider verification is still required. Keep UGC generation disabled until all of these are resolved.

## Phase 2 implementation

- `ugc-kling-provider.ts` implements the UGC abstraction using the existing `FalVideoGenerationProvider`. Client construction is lazy; blocked submission never reads credentials or constructs transport. The adapter only exposes the existing status/result transport, with an unconditional blocked submission result and no submit method on its transport dependency.
- `inspectOwnedTask` maps a trusted owned task ID and pinned provider/model/endpoint to monotonic queued/processing observations. Terminal, draft, missing-ID and ambiguous jobs never poll. COMPLETED produces an output-ready processing proposal, never success. It performs no database transitions, downloads or uploads and is not exposed through a public route/action.
- `ugc-kling-preparation.ts` evaluates the saved immutable snapshot against the existing capability registry, reports blockers without duration/audio substitution, and prepares the UGC-specific private output destination. It neither modifies historical snapshots nor registers a runnable generation request. Existing draft actions and UI responses are unchanged; a future worker can consume this dry-run plan after its missing prerequisites are implemented.
- Existing UGC preparation now checks the project identity as well as hash/status on both normal idempotency lookup and insert-race recovery. Snapshot settings are copied to prevent subsequent in-memory edits changing a prepared job.
- `.env.example` documents the existing shared server credential. No new dependency, flag, provider endpoint, migration, paid request or live database change was added. Video Studio, Creative Composer and Model Studio code remain unchanged.

The new tests use injected/mock transports and isolated module loading; they cannot submit real provider requests. They cover unsupported UI durations, placeholder/reference and speech blockers, snapshot preservation, private output paths, repeated/concurrent blocked submissions, shared status/result routing, ownership and pinned-route checks, completion-before-persistence, no status regression, and cross-project idempotency including unique-insert races.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed (Next.js 16.2.12 production build, including UGC and existing Video routes).
- Focused UGC and Video backend/billing/scheduler/state/UI/library/handoff suite: 66 tests passed.
- No new packages or migrations. No real provider requests, downloads, uploads, database changes or credential verification.
- Browser/mobile/focus/console checks were not performed; no rendered UI was changed. Before activation, manually verify TR/EN draft save/reload, staging ownership/RLS, concurrent claims, ambiguous recovery, source retention and private media delivery. Provider capability and fidelity validation remains outstanding and separately requires authorization for any paid calls.

## Follow-up: scene direction and spoken dialogue

The applied foundation migration's `ugc_projects_configuration_check` was inspected before changing persistence. It requires `configuration.script` to be a JSON string of at most 3000 PostgreSQL characters and constrains existing format/settings. It does not reject additional JSON keys. No migration is necessary: saves retain `script` as an exact mirror of `spokenDialogue`, and independently persist `sceneDirection` and `spokenDialogue`. Both new fields have independent 3000-code-point application limits. They are never concatenated into the legacy field. Existing script-only configurations hydrate with empty scene direction and unchanged dialogue; explicitly cleared dialogue stays empty. Conflicting script/dialogue mirrors are rejected rather than silently choosing one. The original migration was neither edited nor rerun.

Both fields now survive draft serialization, repository hydration and initial workspace state, and enter new immutable job snapshots/hashes independently. Existing stored snapshots are not rewritten. Kling preparation exposes visual direction and spoken dialogue separately; only scene direction is a future visual prompt input. The existing silent provider request builder and disabled UGC submission remain unchanged.

The UI keeps the existing Script & voice card and language/voice/tone controls. It adds clearly described textareas, a dialogue-only word count, an approximate speaking estimate at 150 words/minute and a warning above the selected duration. This is a planning heuristic, not measured audio. The localized AI dialogue-generation button remains natively disabled without a text-generation service.

The [official selected Kling v3 Pro schema](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api) was checked again read-only: native audio is documented for English/Chinese, and other languages are translated to English. The current shared builder explicitly disables audio. There is no implemented exact-dialogue, voice-preset, Turkish-speech or synchronized lip-sync contract. English native-audio use would require reviewed request handling and verification; Turkish requires a suitable separate speech service and validated synchronization, potentially a separate lip-sync pipeline. The UI makes no synchronized-speech claim.

Live PostgreSQL constraint metadata was not accessible through available connections; inspection used the repository's applied SQL definition. If staging has drifted, verify it read-only before rollout:

```sql
select pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.ugc_projects'::regclass
  and conname = 'ugc_projects_configuration_check';
```

Follow-up validation: TypeScript, lint, production build and 31 focused tests passed. Tests cover Turkish/English rendered form copy and accessible field descriptions, disabled generation actions, word counts/duration boundaries, legacy and split-text round trips through a mocked repository, Unicode limits, independent snapshot hashes and separation of visual/speech preparation. No live database writes, paid requests, package additions or schema changes were made. Browser/mobile focus and real authenticated refresh checks still need manual verification.
