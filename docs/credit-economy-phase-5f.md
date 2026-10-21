# Credit Economy v1.0 (Phase 5F)

The server catalog version is `2026-10-v1`. Money is stored as integer USD cents and credits as integers. Starter, Creator, Growth, Business, and Studio grant 1,200, 3,500, 6,500, 14,000, and 30,000 credits for $15, $29, $49, $99, and $199 per monthly period. Top-ups are 1,000/$10, 3,000/$30, and 10,000/$100.

Accounts without a current `active` paid subscription have no video entitlement. Starter and Creator allow Standard Video; Growth, Business, and Studio also entitle Pro Video. Entitlement never implies sufficient balance. Top-ups do not change entitlements.

Standard Video quotes are 300 credits for 5 seconds and 600 for 10 seconds. Pro Video pricing is closed, so it cannot be reserved or submitted. Image prices are represented, but charging remains disabled: the current execution pipeline does not expose a reliable, pre-submission server classification between Standard and Precision/Complex. Automatic repair is explicitly non-billable as a second operation.

The additive migration records immutable verified/admin event references and idempotent grants in the canonical account and append-only ledger. Period uniqueness permits one subscription grant per subscription and billing period. Row/account locks, unique keys, and balance checks protect concurrent processing. Lifecycle events are internal contracts only; the payment adapter is closed and no checkout/webhook endpoint exists.

Phase 5G supersedes the previously unresolved expiration boundary: subscription sources expire at verified period end, top-ups do not expire, and refunds retain source eligibility. Cancellation stops future grants and entitlement at the paid period end. Payment failure changes subscription state and grants nothing.

Before activation: approve expiration/rollover and customer failure/refund rules; choose a provider and signed webhook schema; map provider products to immutable catalog versions; verify and deploy all migrations in order; approve production routes and scheduler; finish an authoritative image execution classifier; run RLS/concurrency integration tests against staging; and explicitly enable customer debit and inference flags.
