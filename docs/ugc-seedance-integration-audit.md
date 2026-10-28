> Bu belge tarihsel kayıttır. Seedance uygulama entegrasyonu kaldırıldı; güncel yönlendirme ve veritabanı geçişi için [Kling video yönlendirmesi](kling-only-video-routing.md) belgesine bakın.

# UGC Seedance integration preparation — disabled

> Tier architecture update: see [Standard / Premium audit](ugc-model-tiers-audit.md) for the new Mini registry/selector, immutable model identity, limits and remaining SQL blocker. Premium's validated subset below remains available for planning; production remains disabled.

Provider schema reviewed read-only on 2026-10-25; capability expansion remains preparation only. No paid API requests, live database/storage mutations, credential/account verification, migration application, dependencies or UI changes. Generate UGC, `requestUgcGeneration`, and adapter `submit` remain unconditionally disabled. No new module is registered with a route, action, cron or worker.

## Decision and documented API evidence

Selected exact endpoint: **`bytedance/seedance-2.5/reference-to-video`**, through the existing fal client/server credential. UGC model ID: `seedance-2.5-reference`. Plan version: `2`. This UGC-only route is independent of Video Studio's registry. Existing Video Studio Kling code/behavior, Creative Composer and Model Studio are unchanged.

The [official 2.5 API schema](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api) documents 4–30 whole seconds or auto, 480p/720p/1080p, explicit ratios, synchronized audio, reference/editing/extension modes, and H.264/H.265. Reference limits: 30 images (30 MB each), 10 videos (200 MB each, 1.8–30.2 seconds each/combined maximum 30.2 seconds), 10 audio files (15 MB each, 1.8–30.2 seconds each/combined maximum 30.2 seconds), 50 total. Images use `@Image1` syntax. Output includes a video file URL. These are documented provider capabilities, not tested application guarantees.

The [official 2.5 endpoint page](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video) lists $0.0214/1,000 tokens at 480p/720p and approximately $0.0234 at 1080p. Approximate 720p rate: $0.473/output second without video references. With video references, a 0.6 multiplier applies and input plus output duration is billable. Its token estimate is width × height × (input video seconds + output seconds) × 24 / 1024. Published approximations/worked examples do not all reconcile exactly; no billable application quote or credit policy is implemented. Confirm authoritative usage, minimums and account rates before launch. Audio on/off has the same documented price.

The [2.0 schema](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api) provides 4–15 seconds, up to 9 images, 3 videos, 3 audio files, 12 references total, native audio and explicit ratios. Its [current pricing page](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video) lists $0.014/1,000 tokens at 480p/720p/1080p without video references, $0.0086016 with them; 4K approximately $0.008/$0.0048. Video-reference usage includes input and output. Since 2.5 has a documented API, 2.0 was evaluated but is not selected or installed as an automatic fallback.

Documentation discrepancies remain: 2.5's landing page describes a 720p ceiling while its API schema lists 1080p; schema uses `@Image1` but endpoint prose/examples also use `[Image1]`. Preparation follows the API schema, fixes 720p, and requires prompt/reference evaluation before activation. API existence does not verify this account's access or regional eligibility. No direct ByteDance credentials or ElevenLabs integration is needed for the selected fal route.

## Reuse audit and implementation

| Area | Disposition |
| --- | --- |
| Drafts / split scene direction and spoken dialogue | Existing contract, repositories, TR/EN forms and save/load serialization unchanged. No draft or stored snapshot conversion. |
| Identity / canonical hashes / ownership | Reuse `UgcSnapshotJob`, UUID/path checks and canonical JSON hashing. New reference-enabled jobs must match the canonical digest. Legacy jobs are not rehashed. |
| Provider interface | `UgcSeedanceVideoProvider` implements existing `UgcVideoProvider`; blocked submit cannot construct a client or POST. Lazy status/result reader shares existing fal transport only. Owned task inspection rejects route mismatch, terminal/draft/ambiguous tasks; completion remains processing until private persistence. |
| Kling-only inputs | Start frame, element structure, `@Element` syntax and source-derived ratio remain only in legacy preparation. No Kling payload is relabeled as Seedance. |
| Seedance preparation | New planner uses explicit ratio and ordered creator/product `@Image` references. Preserves scene direction and spoken dialogue independently in the immutable brief. No dialogue is appended to a silent visual prompt. |
| Claim / reconciliation | Reuse the same fenced claim/current-lease/finish repository interface, ambiguity handling, bounded retries and no status regression. Submission verification defaults to Seedance; explicitly injected planner override retains legacy tests. Reconciliation selects version 1 Kling or version 2 Seedance and compares the entire recomputed canonical pinned plan. |
| fal submission safety | Both verification helpers use the existing request-scoped fetch latch and sanitized errors against actual installed SDK retry logic. Exact queue origin/path/method and no redirects. No default fetch/credential in these helpers; no production caller. |
| Private sources / results | Reuse owned paths, SHA-256 checks, sharp decoding, private signing, bounded output download, requested 15/30-second duration and ratio MP4 inspection, deterministic no-overwrite upload, recovery and final atomic metadata/success transition. No provider URL reaches the UI. |

Legacy Kling adapter/planner/builder/submission helper remain available. Version 1 tasks never resolve through a mutable Seedance default. No files under `src/lib/video-generation`, Video Studio, Composer or Model Studio were edited.

## Prepared application subset and explicit rejections

This is preparation support, not enabled production generation:

- A single **15- or 30-second** 720p reference-guided clip; 9:16, 1:1 or 16:9. These are the supported existing application duration choices, not all provider 4–30-second choices. Generation stays disabled for every duration.
- Exactly two authorized private image identities: creator then product. A future trusted provisioning workflow must store `seedanceReferences: { creator, product }` in the immutable snapshot. Each image uses existing `objectPath`, `sha256`, `width`, `height`; product path must match snapshot product. Conservative local subset: JPEG/PNG/WebP, up to 10 MiB, 300–4096 pixels per side, ratio 0.4–2.5. Source reference ratio need not equal output ratio.
- Scene direction, environment, lighting, framing, format and tone map to the visual prompt. These are guidance, not exact visual guarantees. The 3000-code-point assembled-prompt cap is a local policy, not a claimed provider maximum. Payload explicitly fixes reference task, H.264 and standard bitrate. Signed URLs are ephemeral and excluded from persisted plans.
- Language and voice preferences are retained in the brief, dormant without speech. Any nonempty spoken dialogue explicitly fails exact-dialogue, voice-selection and lip-sync checks in every audio mode; Turkish also reports unsupported speech **in this application**, not an asserted provider language prohibition. Native provider audio does not establish exact TR/EN dialogue, preset voices or measured synchronization. Subtitles are rejected when selected.
- 60 seconds is rejected without truncation. No clip assembly, continuity, mixing or caption workflow exists for it. Native 30-second request planning and media duration checks are supported; production remains disabled.
- Old Kling `referenceImages`, extra Seedance reference fields, video/audio URL inputs, placeholder creators, missing/cross-owner sources, mismatched product paths and invalid hashes fail closed. No start frame is fabricated and no unsupported setting silently becomes a default.

Current UI-created drafts still contain placeholder concepts and require dialogue for job preparation. They therefore do not qualify for the silent reference-enabled subset. This change does not weaken draft validation, fabricate creator assets or make a current draft generatable.

### Separate audio planning contract

`ugc-seedance-audio.ts` validates immutable snapshot `seedanceAudio` independently from scene direction and spoken dialogue:

| Snapshot selection | Planned provider input | Limits |
| --- | --- | --- |
| Omitted or `{ mode: "silent" }` | `generate_audio: false`; no `audio_urls` | Historical omitted selection keeps exactly the previous plan shape; no snapshot/hash rewrite. |
| `{ mode: "native" }` | `generate_audio: true`; no `audio_urls` | Native sound guidance only; no exact speech or voice commitment. |
| `{ mode: "reference", references: [...] }` | `generate_audio: true`, optional `audio_urls` resolved from a trusted signed-URL map; positional `@Audio1` guidance | 1–10 owned/project-scoped MP3/WAV identities, each SHA-256, byte size up to 15 MiB and metadata duration 1.8–30.2 seconds; combined maximum 30.2 seconds. |

Reference identity fields: `objectPath`, `sha256`, `byteSize`, `durationSeconds`, `contentType` (`audio/mpeg` for `.mp3`, `audio/wav` for `.wav`). Unknown audio settings, unsupported modes, reference lists on silent/native modes, URL-only identities, foreign paths, bad hashes/types/sizes/durations and excess references fail explicitly. Builder revalidates audio metadata/flag consistency and rejects missing or unsafe signed URLs. Existing direct snapshot `audio_urls` remains rejected; untrusted external URLs never become durable plan inputs.

**Reference audio remains unsupported by the application pending private media provisioning.** The planner validates documented reference metadata but now rejects reference-audio jobs before claim because the installed private product bucket permits only images and there is no audio resolver. `SupabaseUgcPrivateMedia` keeps its defensive rejection too. No bucket policy is widened, no unverified audio URL is fetched, and no audio bucket is created. Private upload/provisioning, byte/hash/content validation and decoded duration verification require separate implementation. Metadata limits do not prove actual file contents or runtime. Native/silent plans continue through the existing image resolver. All modes still encounter the disabled production gate.

The output validator checks video-track duration against the immutable snapshot's 15/30-second selection, within 0.5 seconds, for both persistence and recovery. It rejects mismatched clips rather than accepting any duration under 30. It does not verify that a generated audio track exists, speech matches dialogue, or lip sync is accurate; those remain production blockers.

## Activation blockers

1. **Database contract:** the unapplied `20261104000000_prepare_ugc_pipeline_claims.sql` proposal allowlists historical v1 Kling/15s, v2 Premium/15 or 30s, and v3 Mini/15s. It pins eligible old Kling task IDs with a migration-only route marker when their snapshot has no model identity. Submission claims bind provider/model/endpoint to the immutable snapshot; model-less historical Premium snapshots remain reconcilable. Provider plan and task identity are immutable after claim. Completion duration is checked against the pinned plan. Lease fencing, ownership, idempotency, ambiguity, task uniqueness and terminal immutability protections remain. Only this unapplied proposal was edited; the installed foundation migration was neither changed nor reapplied. SQL tests are static; staging PostgreSQL concurrency/RLS/null-boundary checks remain required before any separate authorized application.
2. **Assets and retention:** authorized creator/product reference provisioning, canonical immutable snapshot creation and retention of source bytes for job lifetime. Existing replacement/removal can delete sources; detection is implemented, retention is not.
3. **Speech and output:** exact dialogue, TR/EN language behavior, voice selection, native sound quality/audio-track presence, private audio reference provisioning/decoding, measured lip sync, captions and product/identity fidelity need implementation/evaluation. Keep unsupported requests rejected. Add decoder/playback validation; current checks inspect the MP4 container, not actual decoded video/audio quality.
4. **Runtime and finance:** account/region access, authoritative pricing/billing/reservations, error classification, durable worker scheduling, polling limits versus provider runtime, queue delay versus signed-URL lifetime, memory limits, orphan handling and stale-worker recovery need validation before any wiring. No pricing estimate is a spending approval.
5. **Duration:** validate native 30-second behavior, runtime/memory and cost policy before activation. A validated clip assembly workflow is required before advertising 60 seconds. Generation remains disabled at every duration.
6. **Controlled provider verification:** eventually verify actual request/status/result/media shapes and reference syntax with separately authorized calls. This task provides only mock/SDK-with-fake-fetch evidence and makes no paid calls.

## Validation

Tests cover both providers: new routing/payload, immutable scene/dialogue fields, unsupported options and long durations, private media verification, blocked concurrent adapter submissions without credentials, actual SDK one-shot protection using fake fetch, safe duplicate claims, ambiguous submission and completion only after private persistence. Existing UGC foundation/dialogue and Video Studio regressions are included in final checks.

Browser/mobile/focus/console verification was not performed because no UI changed. Before rollout, manually verify authenticated TR/EN save/reload, real private Storage RLS, canonical provisioning, concurrent/stale leases, output recovery/playback, and provider quality/access. Automated validation results are recorded after the final local run below.

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed (Next.js 16.2.12 production build, 32 generated pages).
- Focused UGC pipeline/dialogue/foundation tests: **44 passed, 0 failed** on 2026-10-25. Coverage includes both Seedance routes, plan-to-snapshot claim identity, rejected settings/audio refs, historical Kling task reconciliation, backward-compatible snapshots and static SQL contract checks.
- `git diff --check`: pending final check. SQL was not applied; paid requests and database/storage writes were not made.
