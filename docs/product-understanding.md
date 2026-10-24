# Product Understanding foundation

## Current pipeline

```text
Creative Composer / project page
  -> create project (projects)
  -> client uploads product image to product-assets
  -> registerProductAsset records assets row (asset_type=product)
  -> save creative_direction on projects
  -> optional preset + up to 3 reference images
  -> createQueuedImageGeneration snapshots direction and request metadata
  -> the server action runs the image pipeline synchronously and loads product/reference assets
  -> reference style analysis + optional Prompt Intelligence enhancement
  -> strategy router
  -> final prompt policy compiler
  -> OpenAI images.edit
  -> optional Pixel Lock composite + verification
  -> generated-assets upload + generations completion metadata
```

The primary orchestration is `src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts`. Composer and project-page submissions await this pipeline in the server action before returning.

### Current decisions and policies

- Presets are selected in `CreativePresetRail` / `CreativeComposer`, resolved from `creative-presets.ts`, and stored in generation `provider_metadata`.
- Reference images are stored as `assets.asset_type = reference_image`; `reference-analysis.ts` converts them into a photographic style brief only, not product facts.
- `resolveGenerationStrategy` uses a preset strategy hint first, then its optional `productContext` (not supplied by the current actions), then user-prompt intent, then a rigid-product fallback.
- Vertical/category is derived from preset use case or creative text by `resolveImageGenerationContext`; `vertical-quality-profiles.ts` and `global-photorealism-policy.ts` add deterministic policies.
- `build-image-generation-prompt.ts` combines preservation, vertical fidelity, realism, composition, and enhanced creative direction. `OpenAIImageProvider` calls `images.edit` using the supplied asset.
- Pixel Lock attempts segmentation and a prepared canvas. It composites the original product after generation and verifies it; unavailable preparation falls back to reference editing. Fidelity and provider/prompt/reference metadata are written to `generations.provider_metadata`.

## Current product knowledge gaps

**Currently known**

- The latest product asset's UUID, project/user relation, bucket, object path, creation time, and asset type.
- The product pixels at generation time; the source image is always passed to OpenAI and is authoritative.
- Request-level preset, free-text direction, reference-style brief, selected strategy, and preservation/fidelity outcome.

**Not currently known or stored per product asset**

- Product vertical/subcategory, wearability, rigidity, material, dominant colors, shape, logo/text/artwork regions, or identity-critical attributes.
- Suitable/unsuitable scenes and explicit allowed/forbidden transformations.
- Structured apparel, jewelry, watch, cosmetic, or footwear identity data.

**Inferred from prompt/preset only**

- Category and visual intent (`resolveImageGenerationContext`).
- On-model/still-life and preservation strategy (`resolveGenerationStrategy`).
- Vertical policy selection and prompt-enhancer quality context.

**Unsafe fallbacks**

- Unrecognised prompts become generic `product` / `rigid_product`.
- Apparel is always routed to fashion on-model once its category is selected; jewelry body placement depends on prompt wording.
- Pixel Lock gracefully falls back to `reference_edit` if segmentation/preparation is unavailable; this is not equivalent fidelity protection.
- Reference analysis deliberately excludes product identity, so it cannot supply product facts.

## ProductProfile

`src/lib/product-understanding/types.ts` defines a versioned, model-independent asset interpretation. It has common semantic fields (vertical, subcategory, wearability, rigidity, material, color, shape, branding regions, interaction targets, transformations, scene affinities, confidence, source) plus a discriminated `verticalAttributes` object.

`schemaVersion` governs stored JSON compatibility. `analysisVersion`, `source.model`, and `source.analyzedAt` identify a particular analysis run. `isProductProfile` is a lightweight boundary validation for persisted/model-returned JSON; it is intentionally not a substitute for source-image evidence.

The profile is advisory. The original product asset remains the source of truth: prompt compilation, validation, and later repair must defer to visible pixels when profile and image disagree.

## Persistence recommendation

Do not use `generations.provider_metadata`: it is an immutable request/output record and one product can have many generations. Do not use `assets.derivation_metadata`: it is already semantically reserved for derived artifacts such as product masks.

When analysis is introduced, add a nullable, versioned JSONB `product_profile` column to `assets` (or an equivalent one-to-one asset-profile table only if profile history/querying becomes necessary). It belongs to the immutable product asset, supports re-analysis without generation coupling, and avoids a migration today while no profile is produced. The current schema has no suitable product metadata JSON field.

## Future service and integration

Implement a server-only `analyzeProductAsset({ productAsset, image }): Promise<ProductProfile>` behind a retryable service interface. It should use a vision-capable OpenAI model with strict JSON, validate the result, record model/version/timestamp, and return a non-fatal result. Generation must continue using existing behavior when analysis fails.

```text
UPLOAD PRODUCT
  -> PRODUCT UNDERSTANDING
  -> PRODUCT PROFILE
  -> SCENE SUITABILITY
  -> PROMPT COMPILER
  -> STRATEGY ROUTER
  -> IMAGE GENERATION
  -> FIDELITY VALIDATOR
  -> QUALITY GATE
```

- Strategy Router: use profile vertical, wearability, rigidity, and interaction targets before text heuristics.
- Vertical Quality Profile: select from stored vertical; apply vertical attributes as concrete invariants.
- Prompt Compiler: add profile constraints only as advisory evidence, never against the source asset.
- Scene Suitability Engine: consume scene affinity tags plus product semantics.
- Reference Match: compare references to the profile without treating references as identity truth.
- Fidelity Validator and Quality Gate: compare generated output to both source asset and structured invariants, with source pixels prevailing.

## Analyzer implementation

`analyze-product-asset.ts` is server-only. On product asset registration it securely re-reads the owned asset, prepares a detail-preserving 2048px JPEG analysis copy, requests strict OpenAI Responses JSON, validates it, and persists only valid supported profiles to `assets.product_profile`. It is best-effort: unsupported products and failures leave the asset usable and preserve any earlier valid profile.

`OPENAI_PRODUCT_UNDERSTANDING_MODEL` selects the analyzer model. When unset, it reuses the repository's existing reference-analysis model selection. The service returns `supported`, `unsupported`, or `failed`; it never adds unsupported verticals to `ProductProfile`.

Use `analyzeProductAsset({ assetId, userId, force })` for controlled re-analysis. A valid current schema/analysis version is reused unless `force` is true. `getProductProfileForAsset(userId, assetId)` returns only validated, owned profiles.
