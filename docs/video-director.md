# AI Video Director

Video-only planning for Kling v3 Standard/Pro. Composer and image presets are unchanged.

## Flow

1. Prepare the source through existing private Storage and ownership/provenance checks. Reuse its existing Product Understanding profile; never trigger a new product analysis.
2. Select Luxury Fashion Film, Macro Detail Reveal or Minimal Studio and single/multi-shot mode. Presets and the planner have independent versions in `src/lib/video-director/presets.ts`.
3. Show a separate OpenAI ceiling and require explicit per-request consent before requesting an AI plan. `VIDEO_DIRECTOR_ENABLED=true`, existing Video/OpenAI beta access, a configured Composer enhancement model and the existing atomic analysis quota are all required. The paid planner currently admits only `gpt-4o-mini`, because the reused analysis pricing ceiling is verified only for that model and expires with the existing catalog.
4. Use the existing OpenAI client, Structured Outputs helper, enhancement model configuration and response telemetry. Send a bounded source image plus the existing profile, request, preset, selected camera, tier and duration. Strict schema output is also validated locally. No automatic paid retry.
5. Display the English creative plan with localized TR/EN labels. Invalid output, refusal or timeout yields an explicitly labeled conservative preset fallback. The fallback ignores untrusted creative requests and unsupported inferred facts. A free fallback can also be requested without any inference.
6. The user reviews the plan and separately submits video generation. Submission verifies the signed plan and recompiles identity protection for every shot. It never invokes OpenAI. Existing Kling authorization, exact price confirmation, budget reservation, one-POST behavior, reconciliation and private output persistence still apply.

## Cache and identity

Reuse Video Studio's tab-scoped session-cache pattern, storing only a server-signed receipt. A receipt expires after one hour and is bound to owner, original content hash, prepared source reference, full product profile, planner/preset/model version, user request, camera, duration, tier, aspect ratio, critical region and analysis consent. HMAC uses the existing server-only `SUPABASE_SECRET_KEY` with a Director-specific domain; no credential is sent to the client. Cached JSON is never an authority without verification.

A bounded worker cache coalesces concurrent identical requests and retains fallback after an uncertain paid attempt. Coalescing is per worker, not a distributed claim; independent workers without a valid receipt may each process an explicitly approved request. The existing durable OpenAI analysis quota caps each actual HTTP attempt. Session storage failure only disables the browser cache. Successful receipts work across workers. There is no shared Next.js cache around authenticated inference, and no background cache revalidation that could spend money.

The Director selection participates in the existing draft hash. The approved plan and compiled `multi_prompt` are recorded in the existing `provider_metadata.videoPreservation` JSON snapshot; no database schema change is needed. A duplicate persisted video request is recovered before checking receipt expiry, without another provider submission.

## Provider contract

The local product-video policy remains 5 or 10 seconds. Single-shot requests send only `prompt`. Multi-shot requests send only `multi_prompt` and `shot_type: "customize"`. Each element contains `prompt` and a string integer `duration`; two or three positive shot durations must sum exactly to the selected total. Every compiled shot is <=2,500 characters. Audio remains off and the safety checker stays on. Product identity rules are never truncated; bounded complete profile evidence atoms supplement those rules.

Verified against [Kling Standard](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api), [Kling Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api) and [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). The existing conservative six-frame analysis quote covers one low-detail image, <=16,000 UTF-8 bytes of textual request/schema and <=2,200 output tokens. Other enhancement models fail closed for paid planning.

## Local validation

`npx tsx --test tests/video-director.test.ts tests/video-generation-backend.test.ts tests/video-beta.test.ts tests/video-preservation.test.ts tests/video-studio-ui.test.ts tests/video-studio-state.test.ts`

Tests use isolated adapters and synthetic images; no paid API requests, production migrations or deployment. Live production quality still requires a separately authorized campaign review with real product assets.

Browser interaction QA: `VIDEO_QA_PLAYWRIGHT_MODULE` can point to an existing Playwright installation; run `node scripts/verify-video-director-browser.mjs`. It bundles the actual panel with mocked actions, blocks all external requests, and checks TR/EN desktop/mobile keyboard operation, focus, cost consent, multi-shot display, plan invalidation and overflow. Optional `VIDEO_QA_ARTIFACT_DIR` controls screenshot output. Existing production Webpack CSS is included when available; this is an isolated component check, not an authenticated end-to-end production test.

## Changed files

- `src/lib/video-director/{presets,core,receipt,openai-director,runtime}.ts`
- `src/app/[locale]/dashboard/video/{director-actions,generation-actions}.ts`
- `src/features/video/video-director-panel.tsx`, `video-studio-workspace.tsx`, `video-generation-inspector.tsx`, `video-studio-workspace.module.css`
- `src/lib/video-generation/{types,validation,request-identity,fal-request,service}.ts`
- `src/messages/{tr,en}.json`
- `tests/video-director.test.ts`, `tests/video-generation-backend.test.ts`
- `scripts/verify-video-director-browser.mjs`, `.env.example`, `docs/video-director.md`

Pre-existing worktree changes outside this list were retained.

## Verification result

- 76 targeted tests passed, including the existing OpenAI beta transport, Kling budget/idempotency, private source handoff and preservation suites.
- 36 isolated browser checks passed in TR/EN at desktop and mobile sizes; no browser runtime errors. Keyboard selection/focus, cost consent, multi-shot display and invalidation passed.
- ESLint and TypeScript passed.
- `npm run build -- --webpack` passed, including page generation. Default `npm run build` hit a Turbopack CSS worker panic (`node process exited before we could connect`); bundler configuration was not changed.
- No paid API calls, production migration or deployment was performed. Manually review real product assets and visual output quality only under separate cost authorization.
