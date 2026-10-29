# Kling v3 production stabilization

## Scope and fixes

- Uploaded-source Director plans now carry their verified profile in the authenticated receipt. Quote/submit can restore the same evidence across workers without another analysis or database permission. The existing 14k receipt bound remains; HMAC is verified before decompression, which is capped at 64 KiB. Only the volatile `source.analyzedAt` value is excluded from the plan cache identity; owner, source hash, model, evidence and creative settings remain bound. Existing plans should be prepared again after deployment.
- Quote snapshots also bind source content and geometry, including undirected single shots.
- fal `COMPLETED` is checked for `error`/`error_type`; result 422 and missing video output are provider failures, separate from Storage retry. This follows the [fal queue contract](https://fal.ai/docs/documentation/model-apis/inference/queue).
- Provider reads have an overall deadline. A stored MP4 checkpoint can finish billing without another provider read/download. Storage retry has a distinct TR/EN progress message. Rejected submissions require a new request and fresh approval.
- Terminal reconciliation clears the lease in the same fenced UPDATE, respecting the immutable-terminal trigger. Library reads survive a reconciliation outage. The authenticated background route supports Studio without requiring the legacy beta tester environment variable.
- Development diagnostics use the validated submission UUID as correlation ID and omit prompts, media URLs and credentials.

## Verification

`tests/video-production-integration.test.ts` starts at Studio actions. Application logic, fal SDK, Supabase SDK, receipt checks, repository mapping, reconciliation, MP4 validation and playback authorization run unchanged against isolated HTTP services. The HTTP fixture models database uniqueness, one-shot reservations, leases and immutable rows; it does **not** execute PostgreSQL migrations or prove live database configuration.

All eight Standard/Pro × 5/10s × single/multi configurations are exercised with both AI and fallback plans. The 5s/10s synthetic H.264 MP4 fixtures were generated and decoded with the existing FFmpeg dependency. Failure coverage includes expired/repriced/changed approval, owner/reference changes, eight parallel submissions, rejected/uncertain POSTs, status timeout, provider inference failure, Storage recovery, billing retry, unsafe media, private playback and authenticated background completion.

- 135 targeted tests passed across 11 files.
- TypeScript and ESLint on changed files passed.
- 456 isolated browser checks passed in TR/EN, 320–1440 px, including keyboard/focus, approval, Storage retry and MP4 playback; zero browser runtime errors.
- Production build: `npm run build -- --webpack` passed, including TypeScript and 32 static pages.

No paid inference, production/staging database change, environment change, dependency addition, commit or push was performed. Real provider behavior and deployed SQL remain unverified. For browser-independent completion, an operator must verify the existing authenticated POST scheduler is invoked regularly; this work does not enable cron or spending flags.

## Files changed in this task

- `src/app/[locale]/dashboard/video/generation-actions.ts`
- `src/app/api/internal/video-reconciliation/route.ts`
- `src/lib/video-director/{receipt,runtime}.ts`
- `src/lib/video-generation/{fal-provider,payload-summary,progress-phase,reconciliation,service,supabase-repository,types}.ts`
- `src/features/video/{video-job-progress.tsx,video-studio-types.ts,video-studio-workspace.tsx}`
- `src/messages/{tr,en}.json`
- `tests/video-production-integration.test.ts`
- `tests/fixtures/video-production-harness.ts`
- `tests/fixtures/kling-test-{5,10}s.mp4`
- `tests/{video-progress,video-reconciliation-scheduler,video-transaction-approval}.test.ts`
- `scripts/verify-video-studio-design.mjs`
- This document.
