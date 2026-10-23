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

The dashboard provides Creative Composer, product/reference assets, presets, fidelity policies, prompt construction, generation records, validation, and bounded repair logic. The image path has durable queue, lease, fencing, heartbeat, and reconciliation foundations. Worker and cron routes are server-gated; their presence does not mean production generation is active.

### Product Understanding

Primary uploads can receive a versioned product profile used for safe routing. Normal analysis retains cache and retry-window behavior. Manual forced reanalysis has an owner-scoped admission foundation, but its PostgreSQL migration has not been verified or deployed by this workflow.

### Video, Model Studio, and credits

Video Studio contains source handoff, capability checks, provider/lifecycle/reconciliation foundations, and a Video Library. AI Model Studio includes model creation, references, candidates, identity-fidelity boundaries, and Composer selection. Credits include catalog, entitlement, reservation, refund, expiry, and payment-event adapter foundations. Video inference, Model candidate execution, customer billing, and payment integration remain deferred and disabled.

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
| `OPENAI_IMAGE_MODEL` | Optional image model override. |
| `OPENAI_PROMPT_ENHANCEMENT_MODEL`, `OPENAI_REFERENCE_ANALYSIS_MODEL` | Optional analysis/prompt model overrides. |
| `OPENAI_FIDELITY_VALIDATION_MODEL`, `OPENAI_PRODUCT_UNDERSTANDING_MODEL` | Optional validation/product-analysis model overrides. |
| `ENABLE_AUTOMATIC_SEGMENTATION` | Optional segmentation gate; only `true` enables it. |
| `GENERATION_MODEL_PRICING` | Optional server-side JSON pricing configuration. |
| `IMAGE_GENERATION_WORKER_ENABLED`, `IMAGE_GENERATION_WORKER_SECRET`, `CRON_SECRET` | Image worker gate and authorization. |
| `IMAGE_EDIT_EXECUTION_ENABLED` | Image-edit gate; default `false`. |
| `VIDEO_GENERATION_ENABLED`, `VIDEO_RECONCILIATION_SCHEDULER_ENABLED`, `VIDEO_RECONCILIATION_CRON_SECRET` | Video gates and scheduler authorization. |

## Operational status

The default posture is fail-closed. Image workers, image edits, video generation, video reconciliation, payment processing, and customer billing are disabled unless explicitly and safely activated outside this task. Model Studio execution and identity-conditioned inference are deferred. Migrations in this repository are not claimed to be deployed.

Passing local tests/builds does not verify remote database policy, migration deployment, provider billing, production configuration, or browser accessibility.
