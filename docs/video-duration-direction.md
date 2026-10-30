# KLAY AI — Duration-aware cinematic direction

## Scope and audit

The 24 preset IDs, category recommendations, evidence extraction and risk alternatives remain in place. The pilot affects only Cinematic Hero, Macro Detail Reveal and Luxury Fashion Film. The other 21 presets retain 5s multi = 2+3 and 10s multi = 3+4+3. Existing uncommitted single-5s Cinematic Hero framing and negative terms were preserved.

Previously, `directorShotContract`, the AI instructions and fallback each independently restricted 5s to two shots with a 2s minimum. The provider adapter already accepted 1s shot durations but capped the array at three entries. The shared duration strategy now supplies active directions and timing to fallback, AI context and cache identity. Pilot admission allows 2–5 shots, at least 1s each; a model may simplify when evidence is sparse. Fallback uses the authored timing below. Every shot still has one continuous action, a distinct purpose, and a verified or generic focus. The sum must match the requested duration exactly.

The existing compiler retains camera, composition, light, subject action, pace and canonical focus, then appends preservation rules. Each multi-shot prompt stays within 512 characters, including matched-reference prefixes and marked-region rules. No substring truncation or replacement with a generic zoom was introduced. Cuts occur only between `multi_prompt` entries; `shot_type=customize`, source image, audio-off, safety checker and cfg remain intact.

## Creative matrix

15s cells are authored strategy only, unavailable to generation. All angles below mean reframing or shallow camera travel over the already visible face. They do not establish rear or internal geometry.

| Preset / duration | Single: one continuous take | Multi: shot grammar and exact seconds |
| --- | --- | --- |
| Cinematic Hero / 5s | Existing stable push-in, traveling highlight, full product margins, calm finish | Overview 1 → surface 1 → source-facing lateral reframe 1 → alternate evidenced construction 1 → hero 1. Crisp direct scale changes. |
| Cinematic Hero / 10s | Lateral glide, contour highlight, offset-to-balanced full product. Settle 2, travel 6, hold 2 | Overview 2 → traveling macro surface 2 → medium reset 2 → construction accent 1 → hero 3. Developed travel and longer resolution. |
| Cinematic Hero / 15s — design only | Medium-to-full continuous pull-back; contour light. Settle 3, reveal 8, hold 4 | Overview 3 → traveling surface 3 → visible-face reframe 3 → construction study 2 → campaign hero 4. Breathing space between detail and full scale. |
| Macro Detail Reveal / 5s | Locked resolvable close frame, brief focus settle, grazing light and sustained detail | Detail hook 1 → adjacent surface trace 1 → context reset 1 → recognizable hero 2. Detail comes first. |
| Macro Detail Reveal / 10s | One lateral macro trace: settle 2, inspect 6, hold 2; raking light | Optical detail discovery 3 → adjacent texture 3 → context 1 → pull-back hero 3. Detail-led inspection with a short scale reset. |
| Macro Detail Reveal / 15s — design only | Evidence close-up opens continuously to full form: detail 4, reveal 8, hold 3 | Detail discovery 4 → tactile trace 4 → medium context 2 → hero 5. Extended surface study and product recognition. |
| Luxury Fashion Film / 5s | Locked long-lens silhouette, asymmetric campaign space; moving contour highlight and poised hold | Silhouette 1 → editorial lateral contour 1 → isolated detail 1 → hero 2. Hero receives 40% of the film. |
| Luxury Fashion Film / 10s | Full silhouette with lateral long-lens glide, sculpted side key and restrained fill: poise 3, travel 4, hold 3 | Spatial pull-back 2 → contour reframe 2 → detail pause 3 → asymmetric campaign hero 3. Deliberate editorial pacing. |
| Luxury Fashion Film / 15s — design only | Long-lens pull-back from medium to generous campaign space: poise 4, reveal 7, hold 4 | Spatial reveal 3 → contour 3 → detail study 4 → lingering hero 5. Negative space and longer pauses lead. |

Transitions are direct cuts with matching visible outlines or detail positions, planned between entries only. Single takes never promise a cut, montage, dissolve or separate angle. Explicit user camera and evidence-backed focus/order still override compatible preset defaults.

## Evidence and preservation

Material, stitching, marks, closures and construction details come from the existing validated Product Understanding evidence. A second detail may be selected for a later construction shot, without inventing one. If evidence is absent, fallback widens the view and differentiates its margins instead of claiming a seam, material or new physical property. No manufacturing sequence, rear face, open closure, new wearer or prop is assumed. A source-resolved macro remains conditional on actual image resolution; a verified semantic label alone does not guarantee usable texture pixels.

Quota reservation, request limits, quoted maximum cost, user approval, signed submission identity, receipt authentication/expiry and Product Understanding cache are unchanged. Director and contract versions were advanced so older cached/signed plans cannot masquerade as the new grammar. Pilot 5s multi requests use the existing 4000-output-token ceiling already used by 10s multi; other 5s requests retain 2200. The shared paid transport ceiling and quota enforcement were not raised.

## Why 15s is unavailable

The provider documents total durations through 15 seconds and per-shot durations beginning at one second: [Standard API](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api), [Pro API](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api). This repository intentionally supports a narrower product contract.

Before enabling 15s, update and test these dependencies together:

- `video-generation/types.ts`, `validation.ts`, `capabilities.ts`: supported duration types, admission and tier capability lists.
- `video-generation/beta-policy.ts`, `beta-runtime.ts`: environment allowlists and verified per-duration quote/budget reservation.
- Database duration constraints and relevant reservation/quote RPC contracts: the foundation schema permits only 5/10. Audit subsequent constraints and functions before a migration.
- `video-generation/fal-request.ts`, Director admission and token/context bounds: currently reject 15s intentionally.
- Studio duration types/options, TR/EN messages if needed, credit/budget previews, signed quote/submit/recovery tests and fidelity/output checks.

No migration, policy setting, price or UI option was changed here. UI continues to expose 5/10 only.

## Reproducible examples and A/B test

Run `npx tsx scripts/export-video-duration-examples.ts` to regenerate [the complete 18-cell strategy and 12 final Kling payloads](./video-duration-examples.json). These are synthetic bag fixtures and deterministic fallback plans compiled locally, not live vision findings or paid model results. Payload source URLs are deliberately invalid placeholders. The JSON contains each shot's purpose, exact duration, evidence references, camera, lighting, composition, rhythm and final prompt.

First A/B pair: same real source with resolvable front stitching, same tier/aspect ratio, same evidence and empty brief; A = Cinematic Hero 5s single, B = Cinematic Hero 5s multi. Review actual cuts and useful distinct images, logo/silhouette/color fidelity, seam credibility, source-bound angles, final hero recognition and real output duration. Repeat to distinguish strategy from generation variance. Then compare the Macro detail-first and Luxury hero-weighted variants. Keep quote approval enabled for every real submission.

The 5/10s implementation is ready for a controlled first paid A/B evaluation through the existing approval flow. Generated visual quality, cut obedience and product fidelity are still unmeasured. No paid inference, commit, push or production mutation was performed.

## Changed files and verification

Implementation: `src/lib/video-director/duration-strategy.ts`, `presets.ts`, `preset-contract.ts`, `preset-library.ts`, `plan-contract.ts`, `core.ts`, `openai-director.ts`, `openai-director-chat.ts`; `src/lib/video-generation/fal-request.ts`.

Regression coverage: `tests/video-duration-strategy.test.ts`, `tests/video-director.test.ts`, `tests/video-director-stabilization.test.ts`, `tests/video-preset-library.test.ts`. Existing working-tree changes, including `receipt.ts`, were retained. Artifacts: this report, `docs/video-duration-examples.json`, `scripts/export-video-duration-examples.ts`. No dependency added.

- 144/144 targeted and regression tests passed: creative matrix, sparse evidence, explicit cameras, critical regions, both tiers, independent five-shot AI response, compiler, receipts, production integration mocks, quote approval, credit billing, product analysis/references, preservation and Studio UI contracts.
- `npx tsc --noEmit` passed.
- Final `npm run build` passed with default Turbopack, including TypeScript and all 32 static pages. The earlier sandbox run stalled and the sandbox Webpack attempt hit `.next/types` EPERM; running the local build outside the sandbox resolved the permission issue. A Webpack build also passed.
- Plain `npm run lint` encountered 2315 errors in pre-existing generated `.next-reference-check*` folders. `npm run lint -- --ignore-pattern '.next-reference-check*/**'` passed without changing lint configuration or deleting those outputs.
- Browser-based manual mobile, keyboard/focus and console inspection was not performed. UI, styling, translations and dependencies were not changed; existing responsive/i18n UI contract tests passed.
