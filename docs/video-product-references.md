# Smart Product References

Implemented for Kling v3 Standard/Pro image-to-video. No live OpenAI/Fal/Kling request was made during validation.

## User flow and suggestions

The compact TR/EN reference section sits below the main image. Three optional slots accept JPEG/PNG uploads (10 MB client limit) or owned library images. Any slot also accepts a custom detail; users can replace/remove images. Existing private preparation/upload paths are reused.

Category suggestions cover apparel (texture/construction/side), watches (dial/case/strap), cosmetics/perfume (label/cap/side), bags (label/hardware/side), shoes (sole/side/texture), jewelry (craft/angle/texture), furniture, electronics, eyewear, headwear, food and packaging. Relevant preset detail terms reorder suggestions. Wording is conditional: suggestions do not assert that these parts exist. Unknown profiles use detail/angle/label.

Locally uploaded main images without a persisted Product Understanding profile retain generic suggestions. There is no automatic paid classification call. Existing owned generated-image profiles supply category and evidence when available.

## Analysis and Director

Reference selection alone starts no paid analysis. The existing explicitly approved AI Director request receives the main image plus up to three references, all low-detail resized images. Existing profiles, user intent and preset strategy accompany the pixels. This remains one model call under the existing six-image, 16 KB text, 2,200 output-token ceiling. No analysis fee or mandatory call was added.

Structured Output adds an ordered review for each reference: matched/conflict/uncertain, reason, and at most two directly visible construction/shape/mark-layout details. Conflicting and uncertain inputs cannot carry evidence. Material composition, brands and hidden mechanisms are not inferred. Main identity takes precedence. These model judgments remain fallible.

Accepted details extend the in-memory evidence list after the main-profile atoms; shot evidenceRefs point into that list. The signed ordered review maps added atoms back to reference indices. Stored Product Understanding profiles are not overwritten. Existing explicit intent acceptance checks remain in force. New material claims and unknown rear views remain restricted.

Free fallback adds no new reference evidence and sends no references to Kling. UI explains this. AI review results appear in the plan and verified payload preview, including exclusions and reasons. Rejected model output uses the existing explicit fallback flow.

## Provider contract and security

Official schemas checked:

- [Standard](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api)
- [Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api)

Both accept image elements with a frontal image and 1–3 reference images. The application uses exactly one product element: main prepared image remains start_image_url and frontal_image_url; only matched references enter reference_image_urls. Detail crops are never separate products. The compiler reserves space for @Element1 before applying the 512/2500 character limits.

Private payload shape (illustrative URLs only):

    {
      "start_image_url": "https://private.example/main.png",
      "elements": [{
        "frontal_image_url": "https://private.example/main.png",
        "reference_image_urls": ["https://private.example/detail.png"]
      }],
      "prompt": "@Element1: ...compiled shot...",
      "duration": "5",
      "generate_audio": false,
      "enable_safety_checker": true
    }

Each reference is an owned prepared asset with original-content SHA-256. Director preparation, quote and submit reread ownership/provenance. Identity/hash/order/purpose participate in draft hashes and Director cache/signature keys; quote snapshots also bind reference reviews. Plan version is video-director-3.1-references-v1, invalidating previous plans. Reference edits discard UI plan and cost approval. Existing submit idempotency, atomic reservations and recovery are retained.

Provider images are private, expiring signed URLs; no bucket policy or permanent public file is introduced. Before reservation, matched images must resolve with at least ten minutes URL lifetime, valid prepared image metadata, minimum 300 px dimensions and at most 10 MB. Only the two existing supported models accept the element payload; unresolved element tokens and excess/non-HTTPS URLs are rejected.

Published audio-off prices remain Standard $0.084/s and Pro $0.112/s. The documented image-element input has no separately listed surcharge; this is not a live billing experiment. Existing server quote, pricing expiry and budget gates remain authoritative.

## Verification

- 81 targeted tests passed, including the full existing preset benchmark regression.
- New reference matrix covers six product fixtures × Standard/Pro × 5/10 s × single/multi.
- Main-only compatibility, conflict/uncertainty exclusion, new construction evidence provenance, deletion/replacement invalidation, old quote rejection, unsupported routes, image-count/URL constraints, exact compiler/payload binding and pre-reservation reference resolution are covered.
- Mocked OpenAI adapter confirms four image inputs and the reference review schema within the quoted text ceiling.
- TypeScript and ESLint passed.
- Production build was attempted: Turbopack did not progress and was stopped; webpack failed with EPERM creating a directory under .next. Build success is not claimed.
- Offline compiler examples: [JSON](video-product-references-examples.json), reproduced with npx tsx scripts/check-video-product-references.ts. Reviews in these examples are authored fixtures, not real image-analysis judgments.

## Files changed for this feature

- UI: video-product-references.tsx, video-generation-inspector.tsx, video-studio-workspace.tsx, video-director-panel.tsx; tr.json/en.json.
- Actions: dashboard/video/director-actions.ts, generation-actions.ts.
- Director: core.ts, openai-director.ts, presets.ts, runtime.ts.
- Generation: product-references.ts, reference-context.ts, prepared-source.ts, request-identity.ts, validation.ts, types.ts, fal-request.ts, payload-summary.ts, service.ts.
- Tests: video-product-references.test.ts, video-director.test.ts, video-generation-backend.test.ts, video-transaction-approval.test.ts.
- Offline example script and this documentation.

No dependency, production DB/env/migration/job change, commit or push was made. Mobile/browser visual QA, actual same-product recognition, tiny-label readability, Kling adherence, temporal geometry fidelity and actual billing remain unverified in live production.
