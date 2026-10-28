> Bu belge tarihsel kayıttır. Seedance uygulama entegrasyonu kaldırıldı; güncel yönlendirme ve veritabanı geçişi için [Kling video yönlendirmesi](kling-only-video-routing.md) belgesine bakın.

# UGC Standard / Premium preparation

Verified read-only on 2026-10-25. Generate UGC remains disabled in the UI, provider adapter and production entry point. No paid calls, SQL execution/application, billing, cron, workers or dependencies were added. Video Studio, Creative Composer and Model Studio are unchanged.

## Official capability and pricing evidence

| Tier | Official fal endpoint | Documented capabilities |
| --- | --- | --- |
| Standard | `bytedance/seedance-2.0/mini/reference-to-video` | 4–15 seconds or auto; 480p/720p; native audio; up to 9 images, 3 audio files, 3 videos, 12 total references. Audio is MP3/WAV, up to 15 MB each and 15 seconds combined; requires an image/video. |
| Premium | `bytedance/seedance-2.5/reference-to-video` | 4–30 seconds or auto; schema lists 480p/720p/1080p; native audio; up to 30 images, 10 audio files, 10 videos, 50 total references. |

Both schemas include 9:16, 1:1 and 16:9, `image_urls`, `generate_audio`, optional `audio_urls` and H.264. Mini does **not** document Premium's `task` or `bitrate_mode`; its payload omits them. Sources: [Mini API](https://fal.ai/models/bytedance/seedance-2.0/mini/reference-to-video/api), [Premium API](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api).

[Mini pricing](https://fal.ai/models/bytedance/seedance-2.0/mini/reference-to-video) currently lists **$0.007 per 1,000 video tokens** at 480p/720p, or **$0.0042** with video references, counting input plus output video usage. Provider-reported usage takes precedence; fallback estimates/minimums apply. Images alone do not trigger the lower rate. [Premium pricing](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video) lists **$0.0214 per 1,000 tokens** at 480p/720p, approximately **$0.0234** at 1080p, with a 0.6 video-reference multiplier. These are provider documentation rates, not customer quotes, credits, access guarantees or permission to spend. No prices/credits appear in the UI or public capability projection.

## Application subset

| Capability | Standard | Premium |
| --- | --- | --- |
| Duration | 15 seconds | 15 or 30 seconds |
| Resolution | 720p | 720p |
| Aspect ratio | 9:16, 1:1, 16:9 | 9:16, 1:1, 16:9 |
| Private images | Exactly creator + product | Exactly creator + product |
| Audio | Silent/native planning; reference inputs are rejected before claim until private audio storage exists | Silent/native planning; reference inputs are rejected before claim until private audio storage exists |
| Exact speech / voices / captions | Rejected | Rejected |
| 60-second assembly / video reference inputs | Unsupported | Unsupported |
| Production generation | Disabled | Disabled |

Audio references remain metadata/payload planning only. Private audio provisioning, storage and decoding do not exist; the media resolver explicitly rejects reference-audio plans before signing/submission. Native sound does not promise an audio track, exact dialogue, Turkish-language fidelity, voice identity or accurate lip sync. Separate scene directions and exact spoken dialogue are preserved in drafts; requested speech is never silently discarded to make a plan pass. The existing conservative local media limits, prompt cap, source checks and private result validation remain in effect. Provider availability/quality was not exercised.

## Architecture and persistence

- `ugc-model-registry.ts` is server-only and holds endpoint identity, capability-contract version, documented limits and the supported subset. The server projects only tier, supported durations, ratios and resolution into UI props. The browser does not authorize provider routing or invent capabilities.
- The selector uses existing native radios, card/choice styles and focus rules. TR/EN copy explains duration differences and shared limitations. 30 seconds is disabled under Standard; 60 is disabled for both. Switching tiers preserves an incompatible selected duration and shows a warning. Draft save remains available for incompatible briefs; the server preparation policy rejects unsupported durations, ratios, speech and captions before job insertion.
- New configurations persist `modelTier` as an additional configuration key, permitted by the unchanged foundation CHECK. Missing tier hydrates to Premium, preserving previous 30-second drafts and all other settings. Unknown/null tiers fail validation. Model changes are included in every autosave and upload-associated draft save, and restored after repository hydration.
- New job snapshots include `model: { tier, provider, endpointId, version: 1 }`. `version` denotes the reviewed application capability contract, not a fabricated provider model version. Exact endpoint identity already identifies Mini 2.0 versus 2.5. This identity participates in request hashing and owner/idempotency conflict checks; same key with another model conflicts. The preparation helper requires an injected server model policy; absent policy fails closed. No historical job snapshot/hash is rewritten.
- Existing Premium plan version 2 and its internal `seedance-2.5-reference` ID remain unchanged; it is an existing application alias, not an asserted fal model ID. Historical snapshots without a model pin resolve only to Premium and retain the old canonical plan shape. Standard plans use version 3 and the exact official fal endpoint as model ID. Invalid identity/version fails closed; Standard never silently falls back to Premium. Kling version 1 reconciliation remains separate.
- Both Seedance plans use the existing safe claims, one-shot SDK transport verification, ambiguity handling, immutable plan comparison, bounded reconciliation, owned image verification and private result persistence. Mini's payload excludes undocumented controls. Separate verification submission helpers pin the correct endpoint and reject the other tier's payload shape. Neither helper is registered in production.

## Remaining blockers

1. The unapplied pipeline migration proposal has been forward-prepared for Kling v1, Premium v2 and Standard Mini v3 with snapshot-bound route identity. It remains unapplied. Run isolated PostgreSQL tests for exact route/version constraints, concurrent/stale leases, RLS and atomic completion before any activation. No SQL was executed or applied; the installed foundation migration is untouched.
2. Authorize/provision real creator references, retain immutable source bytes, implement private audio storage/decoding and evaluate exact speech/voice requirements. Current UI creators remain placeholders; drafting does not imply they are generatable.
3. Verify account/region access, actual response/media shapes, product and identity fidelity, playback/decoding/audio, queue delays versus signed URL lifetime and runtime/memory budgets with separately authorized provider checks.
4. Billing/credit policy and durable execution remain out of scope and unwired. Do not enable either tier because planner tests pass. Sixty seconds still requires a validated assembly workflow.

## Changed files and verification

New: `src/features/ugc/ugc-model-contract.ts`, `src/lib/ugc/ugc-model-registry.ts` and this audit. Updated: UGC page/actions, workspace/contract, project hydration, Seedance planner, payload builder, shared plan type, private media dispatch and reconciliation dispatch; `tr.json`, `en.json`; UGC foundation/dialogue/pipeline tests. No CSS, package or SQL changes were needed for the tier selector.

Exact changed-file inventory for this task:

```text
src/features/ugc/ugc-model-contract.ts
src/lib/ugc/ugc-model-registry.ts
src/app/[locale]/dashboard/ugc/page.tsx
src/app/[locale]/dashboard/ugc/actions.ts
src/features/ugc/ugc-studio-contract.ts
src/features/ugc/ugc-studio-workspace.tsx
src/lib/ugc/ugc-projects.ts
src/lib/ugc/ugc-seedance-planner.ts
src/lib/ugc/ugc-request-planner.ts
src/lib/ugc/ugc-fal-submission.ts
src/lib/ugc/ugc-private-media.ts
src/lib/ugc/ugc-pipeline.ts
src/messages/tr.json
src/messages/en.json
tests/ugc-foundation.test.ts
tests/ugc-dialogue.test.ts
tests/ugc-pipeline.test.ts
docs/ugc-model-tiers-audit.md
docs/ugc-seedance-integration-audit.md
```

Automated verification covers registry limits, pre-insert rejection, tier save/hydration/legacy defaults, model-pinned hash/idempotency conflicts, Mini payload routing and lower audio limits, untouched historical Premium plan identity, private persistence and duplicate-claim reconciliation.

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, Next.js 16.2.12 production build.
- Focused UGC pipeline/dialogue/foundation tests: **43 passed, 0 failed** on 2026-10-25.
- `git diff --check`: passed. No new dependencies or protected-studio changes.
- TR/EN static React rendering verifies labeled native model radios, selected tier, disabled incompatible duration options, preserved incompatible draft warnings, accessible descriptions and the disabled Generate button. Existing CSS supplies responsive layout, keyboard focus and reduced-motion handling; no new style system was introduced.
- An isolated local Chrome review was attempted with mocked persistence, without credentials or provider access. The sandbox prevented connection to its debug channel, so mobile screenshots, live keyboard interaction and browser-console verification were not completed. Before rollout, manually check mobile/desktop layouts, radio arrow-key/focus behavior, tier switching with an incompatible duration, authenticated autosave/refresh in both locales, private media permissions and playback. No browser success is inferred from static rendering tests.
