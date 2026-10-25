# KLAY AI

KLAY AI is a Next.js application that turns product photography into campaign-ready image concepts while treating product shape, color, branding, artwork, and material cues as authoritative.

This repository includes implemented application foundations and intentionally gated operational systems. Source code and migrations do not mean a feature is deployed, enabled, or connected to a paid provider.

## Architecture

- Next.js 16 App Router, React 19, and strict TypeScript
- Turkish (`tr`, default) and English (`en`) through `next-intl`
- Supabase browser, server, and server-only privileged clients
- Tailwind CSS and project design tokens
- Server-side OpenAI adapters and optional fal adapters

Code lives in `src/app` (routes/actions), `src/components` (UI), `src/features` (product modules), and `src/lib` (domain, provider, storage, and Supabase logic). Follow [AGENTS.md](AGENTS.md) before making changes.

## Product modules

### Creative Composer and image generation

Creative Composer accepts a product image, optional references, and a preset or creative direction. Its server action creates the generation record and runs the image pipeline synchronously in the same request. The request waits for provider generation, image validation and any eligible repair, then stores the output and returns the completed generation. If execution fails, the action records the failure and returns an error. Generation requires provider credentials, explicit server-side beta access and the atomic request-budget RPC. Image downloads reauthorize ownership on every click and use fresh 60-second private URLs with an attachment filename.

### Product Understanding

Primary uploads can receive a versioned product profile used for safe routing. Normal analysis retains cache and retry-window behavior. Manual forced reanalysis has an owner-scoped admission foundation, but its PostgreSQL migration has not been verified or deployed by this workflow.

### Video, Model Studio, and credits

Video Studio contains source handoff, capability checks, provider/lifecycle/reconciliation foundations, and a Video Library. AI Model Studio includes model creation, references, candidates, identity-fidelity boundaries, and Composer selection. Its interactive portrait action uses OpenAI behind the same beta access and budget boundary; identity approval and identity-conditioned Composer generation remain disabled. Credits include catalog, entitlement, reservation, refund, expiry, and payment-event adapter foundations. Video inference, customer billing, and payment integration remain deferred and disabled.

## Supabase and migrations

Supabase supports authenticated users, projects, assets, generations, and feature-specific records. Additive schema changes live in `database/migrations`.

Do not apply migrations to a linked project as part of local maintenance. Image-edit and product-reanalysis admission migrations need isolated PostgreSQL RPC/concurrency verification before operational use.

## Local development and tests

```bash
npm install
npm run dev
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

`npm test` preserves the existing preflight phase, then discovers every root-level `tests/*.test.ts` and `tests/*.test.tsx` suite not already run by preflight. New test files are therefore included without maintaining a stale full list, and no suite runs twice.

Focused examples:

```bash
npx tsx --test tests/product-reanalysis-admission.test.ts
npx tsx --test tests/image-edit-admission.test.ts
```

Tests are deterministic local checks; they do not apply migrations, mutate Supabase, or make paid provider calls.

## Environment variables

Copy `.env.example`; never commit real values.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase URL and publishable browser key. |
| `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `FAL_KEY` | Server-only credentials. |
| `OPENAI_BETA_ENABLED`, `OPENAI_BETA_USER_IDS` | Explicit opt-in and comma-separated authenticated user UUID allowlist. Missing/invalid configuration denies all OpenAI HTTP requests, including upload analysis and Model Studio portraits. |
| `OPENAI_BETA_USER_DAILY_IMAGES`, `OPENAI_BETA_USER_DAILY_ANALYSES` | UTC daily request ceilings per user; defaults 4 image requests and 24 analysis requests. Repairs and failed/ambiguous attempts consume quota. |
| `OPENAI_BETA_GLOBAL_DAILY_IMAGES`, `OPENAI_BETA_GLOBAL_DAILY_ANALYSES` | Shared UTC daily ceilings across users/server instances; defaults 20 images and 120 analyses. These are request limits, not USD quotes or customer credit prices. |
| `OPENAI_IMAGE_MODEL` | Optional image model override. |
| `OPENAI_PROMPT_ENHANCEMENT_MODEL`, `OPENAI_REFERENCE_ANALYSIS_MODEL` | Optional analysis/prompt model overrides. |
| `OPENAI_FIDELITY_VALIDATION_MODEL`, `OPENAI_PRODUCT_UNDERSTANDING_MODEL` | Optional validation/product-analysis model overrides. |
| `ENABLE_AUTOMATIC_SEGMENTATION` | Optional segmentation gate; only `true` enables it. |
| `GENERATION_MODEL_PRICING` | Optional server-side JSON pricing configuration. |
| `IMAGE_EDIT_EXECUTION_ENABLED` | Image-edit gate; default `false`. |
| `VIDEO_GENERATION_ENABLED`, `VIDEO_RECONCILIATION_SCHEDULER_ENABLED`, `VIDEO_RECONCILIATION_CRON_SECRET` | Video gates and scheduler authorization. |

## Operational status

Image generation runs synchronously from Creative Composer when server-side beta access, credentials and the budget RPC are configured. The common OpenAI transport pins approved request shapes/models, bounds output, disables automatic SDK retries and consumes atomic quota before provider I/O. Missing RPC or quota failure denies the request. `20261025212828_prepare_openai_beta_limits.sql` was installed and behavior-tested only on the explicitly authorized disposable project; production installation, configuration and paid verification require separate approval. Video generation, video reconciliation, payment processing, customer billing and identity-conditioned inference remain gated. UGC Generate remains unconditionally disabled.

Current evidence, migration distinctions and next priorities: [KLAY AI project status](docs/KLAY_AI_PROJECT_STATUS.md). Use explicit test ref `gklpgcyndeghjgemoonk` for routine test operations; the repository's existing CLI link points to production and must not be used as an implicit target. Supabase CLI 2.114.0 and the connected Supabase integration have both been verified without recording credentials.

Passing local tests/builds does not verify remote database policy, migration deployment, provider billing, production configuration, or browser accessibility.
