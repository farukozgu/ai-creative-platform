# D1 revision: three-scene 5s commercial edits

Revised on 2026-11-11. Scope is only Signature Studio / minimal-studio and Light Sweep / metallic-light-sweep, duration 5s, Multi.

## Previous versus revised storyboards

| Preset | Previous D1 | Revised D1 |
| --- | --- | --- |
| Signature Studio | Five locked 1s beats; sparse branch 1+1+2+1 | 2s graphic establish with a tiny primary-view push-in → 2s editorial inspection with a tiny view-local lateral reframe → 1s locked primary hero |
| Light Sweep | Five locked 1s beats; sparse branch 1+1+2+1 | 1s readable full establish → 2s defining left-to-right highlight with subtle camera life → 2s primary hero resolve, tiny widening in the first second and a stable final second |

New D1 planning always produces exactly three scenes, within the new three-scene maximum. Rich and sparse cases share those timings. Rich inspection selects a creative-safe complete side/profile, or a source-backed primary inspection region. Sparse inspection stays on a recognizable primary contour with restrained framing/motion. It never manufactures a view or unresolved microscopic detail.

The product remains fixed in its evidenced orientation. Camera motion stays within the pictured view. View changes are editorial cuts, never turns, morphs or interpolated intermediate angles. Signature retains steady studio lighting; Light Sweep has exactly one dominant highlight pass in Scene 2. Short prompt compilation preserves the actual camera move instead of replacing it with a locked frame.

## Creative-safe reference authority

Identity verification and completeness alone no longer authorize an alternate shot. D1 requires the independent creativeSafeSide review flag, in addition to matched identity and a complete view:

- side-profile: view=side, wholeSideVisible=true, creativeSafeSide=true.
- other-product-view: view=side, wholeViewVisible=true, creativeSafeSide=true.
- A review explicitly describing rear/back, rolled/inverted, ambiguous or clasp-focused presentation vetoes creative binding, even if a contradictory safety flag is true.
- Back/rear, front-only alternates, clasp-focused back views, rolled views and ambiguous orientations do not bind a new D1 creative scene. Other upload roles, including back-view, cannot bypass the role whitelist.
- Missing safety authority fails closed to the primary-only branch. A verified unsafe reference can remain identity evidence; it is not forwarded as a whole-product provider element.
- dial-detail remains required fidelity evidence for recognized watches and never authorizes an alternate subject/view.

Eligible references are selected deterministically by suitable role, content hash, then asset identity. Primary asset/content duplicates are excluded. Only the selected complete side becomes an element, bound to Scene 2. Scenes 1 and 3 remain primary. Preview, signed plan and mocked submit payload agree on the selected asset, view, array index, scene and prompt.

All dial-visible primary scenes retain dial layout, numerals, indices, logo, hands, date window, printed markings and visible complications, fixed across frames. Side-bound scenes preserve their actual pictured geometry and markings without contradictory front-facing dial composition. Required text/fidelity clauses are preserved during compaction; overflow is rejected explicitly.

## Historical receipts and the new-send boundary

The frozen first-D1 builder/compiler is isolated in five-second-multi-legacy.ts solely for receipt replay. The original two-scene plans and the first D1 four/five-scene plans still verify and recompile without reinterpretation. A pre-revision capture of 176 first-D1 cases retains the exact hash d50e859e86b5c3c314d53bf2fdbdfdaa9a5457285fabc1484e47ae1bcc5469f6.

Historical decoding is separate from authorization to create a new video. The D1-only quote/submission boundary now requires the current three-scene plan. An older D1 receipt cannot bypass the scene cap or revive an unsafe old creative binding. Existing-job recovery/idempotency remains unchanged.

When old signed reviews are reusable under the existing identity gates, new planning reuses them as identity evidence with creative binding disabled. It does not automatically pay for another review. New references receive creative-safety assessment in the existing reference-review call; no additional creative-planning or generation call was introduced. The existing recognized-watch dial gate is unchanged.

No global Director/preset version, receipt format or cache-key change was introduced. The optional creativeSafeSide field belongs only to D1's reference review contract. No general beat engine or all-preset framework was added.

## Protected behavior and golden data

Only the two D1 5s Multi configuration cells change, represented by 44 product/profile cases in the 2,112-cell matrix. The other 2,068 current cells retain byte-identical plans, prompts, preset definitions and cache keys against the original capture. All 10s outputs, both C1 presets, Quick Cuts 5s, other presets, Single and hidden/legacy behavior remain unchanged; protected Custom tests pass as well.

No golden JSON or existing expected golden hash was regenerated. Existing frozen comparisons continue to replay their historical plans. A new compatibility assertion pins the already-captured first-D1 outputs; it does not replace an existing golden expectation.

The proposed 10s maximum of six scenes was not implemented in this task. No 10s redesign or shared provider-capability expansion was made. The three-scene limit applies only to the two scoped current D1 modes; protected Quick Cuts remains unchanged.

## Verification

| Check | Result |
| --- | --- |
| D1/compatibility and transaction approval tests | 32 passed: 23 D1/compatibility + 9 transaction tests |
| Protected Video Studio/reference suites | 1,734 passed, 1 existing skip, 0 failed |
| Full golden/C1/fingerprint comparison | 60 passed |
| Current protected matrix | 2,068 byte-identical cells |
| First-D1 historical replay | 176 byte-identical cases and receipt round-trips |
| Prompt scan | 308 cases / 924 scenes; maximum 512 characters; 0 unexpected overflow |
| Deliberate oversized literal text | Explicit rejection passed |
| Full suite | 68 preflight passed; main suite 2,460 passed, 1 existing skip, 0 failed |
| TypeScript | Passed: tsc --noEmit --incremental false |
| ESLint | Passed: npm run lint, no errors/warnings |
| Build | Passed: npm run build -- --webpack, including TypeScript and all 32 static pages |

Tests and build use an ignored local guard against real OpenAI/fal network access. Integration SDK/provider operations are isolated mocks. No actual provider call, dependency change, commit or push occurred. Media provider adapters, transports, endpoints and capabilities are unchanged; only the D1-specific reference-review schema/instructions inside openai-director.ts were extended.

Webpack was used as in the previous D1 verification. A transient mkdir EPERM under the generated .next directory required a retry; no production source or build configuration was changed to resolve it.

No UI, design-system, locale copy or database change was made. Real-video quality remains unverified in this task: a separately authorized render should inspect motion continuity, useful primary/side cuts, watch geometry/markings and the final recognizable product frame.

## Exact files changed by this revision

Production:

- src/lib/video-director/five-second-multi.ts — three-scene grammar, view-local motion, creative-safe side selection and moving-shot compilation.
- src/lib/video-director/five-second-multi-legacy.ts — new frozen first-D1 receipt replay only.
- src/lib/video-director/core.ts — separate current/historical admission, exact storyboard binding and compiler dispatch.
- src/lib/video-director/plan-contract.ts — current D1-only three-scene bounds.
- src/lib/video-director/runtime.ts — identity-only reuse of older reviews, with no extra paid review.
- src/lib/video-director/openai-director.ts — D1-only creative-side safety review schema/instructions.
- src/lib/video-generation/product-reference-policy.ts — independent D1 creative-safety scoping.
- src/lib/video-generation/product-references.ts — safety field type and correct current/historical element-to-scene binding.
- src/app/[locale]/dashboard/video/generation-actions.ts — D1-only current-plan requirement for new quotes/submissions.

Tests:

- tests/video-d1-five-second.test.ts
- tests/video-d1-compatibility.test.ts
- tests/video-director.test.ts
- tests/video-duration-strategy.test.ts
- tests/video-fixed-production-chain.test.ts
- tests/video-lighting-physical-staging.test.ts
- tests/video-physical-staging.test.ts
- tests/video-transaction-approval.test.ts

Report:

- docs/video-d1-five-second-multi.md

This is the revision-only list. Earlier uncommitted D1 work in other files remains in the working tree. No unrelated working-tree changes were reverted.
