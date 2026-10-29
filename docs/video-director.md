# KLAY AI Video Director 3.1

Video-only planning for Kling v3 Standard/Pro. Composer and image presets are unchanged.

## Flow

1. Prepare the source through existing private Storage and ownership/provenance checks. Reuse its existing Product Understanding profile; never trigger a new product analysis.
2. Choose from the [24-style Creative Video Preset Library](video-preset-library.md), retaining Luxury Fashion Film, Macro Detail Reveal and Minimal Studio IDs/behavior, and single/multi-shot mode. Presets and the planner have independent versions in `src/lib/video-director/presets.ts`. Category filters and six-card pages keep discovery bounded; source-bound recommendations never trigger paid analysis.
3. Show a separate OpenAI ceiling and require explicit per-request consent before requesting an AI plan. `VIDEO_DIRECTOR_ENABLED=true`, existing Video/OpenAI beta access, a configured Composer enhancement model and the existing atomic analysis quota are all required. The paid planner currently admits only `gpt-4o-mini`, because the reused analysis pricing ceiling is verified only for that model and expires with the existing catalog.
4. Use the existing OpenAI client, Structured Outputs helper, enhancement model configuration and response telemetry. Send one bounded source image, a compact evidence-indexed product context, the full original TR/EN user request, the preset creative brief, selected camera, tier and duration. The AI interprets intent, fills missing production decisions and chooses a distinct purpose and evidence-backed focus for each scene. An empty request is valid. No automatic paid retry or new product analysis.
5. Display the English intent interpretation and creative plan with localized TR/EN purpose labels. Invalid output, refusal or timeout yields an explicitly labeled basic preset fallback. The fallback selects existing evidence but does not claim to interpret user intent. A free fallback can also be requested without any inference.
6. The user reviews the plan and the exact compiled provider prompts, then separately approves video generation. Submission verifies the signed plan and recompiles identity protection for every shot. It never invokes OpenAI. Exact provider contract validation also runs before credit reservation. Existing Kling authorization, exact price confirmation, budget reservation, one-POST behavior, reconciliation and private output persistence still apply.

## Product grounding and creative freedom

`product-context.ts` reuses the existing verified profile, category/type, confidence, rigidity, forbidden transformations and up to 24 complete evidence atoms. Apparel construction and visible details from jewelry, watches, cosmetics, footwear and bags inform the plan. Uncertain, hidden, instruction-like and low-confidence facts are excluded. Materials require sufficient material-field confidence. No new Product Understanding call is introduced.

The structured focus is an exact evidence atom with its index, or a generic source-visible form/detail focus when evidence is insufficient. The server rejects mismatched references, known unsupported product claims, unseen surfaces, internal montages, conflicting camera instructions and duplicate scene purposes. Automatic multi-shot direction rejects an all-push-in plan. Explicit camera choices take precedence; compatible scale and framing remain. Controlled source-facing product movement and lighting reveals are permitted. Requested spins are interpreted by the planner as safer views of known surfaces; raw requests are never submitted directly through the Director path.

The planner receives the full request, including order and negation, rather than the legacy keyword summary. Presets supply different creative briefs; static fallback shots are not sent to the AI as templates. The free fallback remains deliberately simpler and clearly labeled.

## Cache and identity

Reuse Video Studio's tab-scoped session-cache pattern, storing only a server-signed receipt. A receipt expires after one hour and is bound to owner, original content hash, prepared source reference, full product profile, planner/preset/model version, user request, camera, duration, tier, aspect ratio, critical region and analysis consent. HMAC uses the existing server-only `SUPABASE_SECRET_KEY` with a Director-specific domain; no credential is sent to the client. Cached JSON is never an authority without verification.

A bounded worker cache coalesces concurrent identical requests and retains fallback after an uncertain paid attempt. Coalescing is per worker, not a distributed claim; independent workers without a valid receipt may each process an explicitly approved request. The existing durable OpenAI analysis quota caps each actual HTTP attempt. Session storage failure only disables the browser cache. Successful receipts work across workers. There is no shared Next.js cache around authenticated inference, and no background cache revalidation that could spend money.

The Director selection participates in the existing draft hash. The approved plan and compiled `multi_prompt` are recorded in the existing `provider_metadata.videoPreservation` JSON snapshot; no database schema change is needed. A duplicate persisted video request is recovered before checking receipt expiry, without another provider submission.

## Provider contract

The local product-video policy remains 5 or 10 seconds. Single-shot requests send only `prompt` (<=2,500 characters). Multi-shot requests send only `multi_prompt` and `shot_type: "customize"` (<=512 characters per scene). A new 5-second Director plan has two shots; 10 seconds has two or three, each at least two seconds, summing exactly to the selected total. Existing provider validation remains compatible with older jobs. Audio remains off and the safety checker stays on.

All six actual creative fields are retained in the compiled prompt, followed by short affirmative identity directions. Scene-specific fields have Structured Output budgets. Mandatory decisions reserve space before optional complete evidence atoms; overlong mandatory direction fails to the labeled fallback instead of truncating or replacing it with generic camera language. Multi-shot negatives permit intentional cuts; single-shot negatives retain the cut restriction.

Planner/preset and browser cache versions changed to `video-director-3.0` / preset v3. Existing HMAC verification rejects earlier receipts for new submissions. Already persisted jobs retain their stored snapshots and idempotent recovery.

## Acceptance examples and actual limits

[Two authored product plans with all six compiled Kling scene prompts](video-director-3-examples.md) use a belted jacket and a perfume bottle. These are offline acceptance fixtures passed through the real parser/compiler, not live OpenAI responses or rendered Kling results.

No paid model output was evaluated in this change. Semantic interpretation is delegated to the existing OpenAI planner; offline tests verify complete context transfer, output contracts, failure handling and exact compilation, not the aesthetic quality of a live model response. The local product-claim checks cannot prove every possible visual assertion. Source pixels and a human review remain necessary for fine logos, text and material identity.

The existing Product Understanding taxonomy supports six verticals, not electronics. A raw upload or product without a usable verified profile falls back to source-visible form/lighting instead of asserting detailed anatomy or materials; the planner may recognize the category from the same source image but does not create a new verified profile. No taxonomy, database, migration or environment changes are introduced here.

Verified against [Kling Standard](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api), [Kling Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api) and [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). The existing conservative six-frame analysis quote covers one low-detail image, <=16,000 UTF-8 bytes of textual request/schema and <=2,200 output tokens. Other enhancement models fail closed for paid planning.

## Local validation

`npx tsx --test tests/video-director.test.ts tests/video-generation-backend.test.ts tests/video-beta.test.ts tests/video-preservation.test.ts tests/video-studio-ui.test.ts tests/video-studio-state.test.ts`

Tests use isolated adapters and synthetic images; no paid API requests, production migrations or deployment. Live production quality still requires a separately authorized campaign review with real product assets.

Browser interaction QA: `VIDEO_QA_PLAYWRIGHT_MODULE` can point to an existing Playwright installation; run `node scripts/verify-video-studio-design.mjs`. It bundles the real Studio with mocked actions, blocks external requests, and checks TR/EN at 320/390/768/1024/1440 px, keyboard operation, focus, blank motion descriptions, cost consent, multi-shot display, plan invalidation and overflow. Optional `VIDEO_QA_ARTIFACT_DIR` controls screenshot output. This is an isolated UI check, not an authenticated end-to-end production test.

## Changed files

- `src/lib/video-director/{presets,core,creative-request,identity-evidence,openai-director,product-context}.ts`
- `src/app/[locale]/dashboard/video/{director-actions,generation-actions}.ts`
- `src/features/video/{video-director-panel.tsx,video-studio-state.ts}`
- `src/lib/video-generation/{validation,service}.ts`
- `src/messages/{tr,en}.json`
- `tests/{video-director,video-generation-backend,video-studio-state}.test.ts`, `tests/fixtures/video-director-fixtures.ts`
- `scripts/verify-video-studio-design.mjs`, `docs/{video-director,video-director-3-examples}.md`

Pre-existing worktree changes outside this list were retained.

## 3.1 stabilization

3.1 stabilization: the planning schema fixes `intentContract` to the server's exact values, including explicit camera selections. Shared shot bounds and compiler-derived text reserves account for expanded evidence, marked-region fidelity prose and reference prefixes. Cross-field rules (duration totals, distinct purposes/directions, requested focus/order and safe motion) remain runtime checks and are stated in the planning instructions. Reference-review schema branches prohibit details on uncertain/conflicting images.

Product-claim validation checks summary, intent and creative shot fields separately, with bounded synonyms and explicit cinematic contexts. Focus text is supplied by canonical evidence rather than model prose. Unsupported materials, mechanisms, components and attribute/part combinations still fail closed. Rejections include an exact field path; provider/parsing/business/compiler failures remain separate, including on cached fallback reuse. The contract revision participates in cache/signature keys so plans from the previous acceptance contract are not reused. Offline acceptance coverage is in `tests/video-director-stabilization.test.ts`.

This stabilization passed 71 targeted tests across seven files, TypeScript (`--noEmit --incremental false`), ESLint on the changed TypeScript files, and `npm run build -- --webpack` (32 static pages). The sandboxed build encountered Windows `EPERM`; the same command passed outside that restriction. The four independent mock OpenAI responses (automatic watch, footwear, ring and eyewear) remained AI through business validation, Kling compilation and signed-plan reopening. No paid provider calls, database/environment changes, dependency additions or UI changes were made.

## Earlier verification result

- 116 targeted tests passed across 11 suites, including OpenAI beta transport, Director, Kling budget/idempotency, source preparation, UI/state, transaction approval, credit billing, reconciliation and preservation.
- 396 isolated browser checks passed in TR/EN at desktop and mobile sizes; zero browser runtime errors. Keyboard selection/focus, blank descriptions, cost consent, multi-shot display and invalidation passed.
- ESLint and TypeScript passed.
- `npm run build -- --webpack` passed, including 32 static pages. Default `npm run build` remained at the Turbopack compile stage without diagnostics and was stopped; bundler configuration was not changed. The prior repo notes also record a Turbopack CSS-worker failure in this environment.
- A final sandboxed repeat hit Windows `EPERM` while creating build output folders. The same final Webpack build succeeded outside that filesystem restriction, including TypeScript and all 32 pages; no source/config workaround was introduced.
- No paid API calls, production migration or deployment was performed. Manually review real product assets and visual output quality only under separate cost authorization.
