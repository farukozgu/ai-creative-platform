# Phase 7D — Safe Project Media Deletion Design

Status: design only. No storage object, generation, project, or job is deleted by this document or its accompanying source changes.

## Observed ownership boundaries

- `projects.user_id` is the project owner.
- Product and reference `assets` are project-owned and stored under the owner/project object-path prefix in `product-assets`.
- Image outputs use generation records and private generated-media object paths scoped to owner/project.
- Video source/output references and queued/processing generation records can outlive a browser request and must be treated as in-flight.
- Model reference assets and identity records are not project media and must never be swept by project deletion.

## Required future lifecycle

1. Authorize the owner and mark the project `deletion_requested`; reject new work while retaining all rows and media.
2. Atomically create one idempotent cleanup-outbox record per project with a fencing/version token. A worker claims it using a bounded lease.
3. Inspect generation/job state. Queued, processing, claimed, ambiguous, or reconciliation-required records remain retained until their lifecycle reaches an explicit safe terminal/deletion state. Never issue a provider retry or refund from cleanup.
4. Build the object list from owned database references, not path-prefix listing. Before deleting an object, verify it is not referenced by another retained row or a non-project resource.
5. Delete storage in bounded batches. Record each successful object deletion and retry failures with backoff. A missing object is a successful idempotent result.
6. Only after all referenced objects are confirmed deleted or explicitly retained, delete/soft-delete metadata according to an approved retention policy. Keep an audit trail and cleanup failure diagnostics without URLs or secrets.
7. A scheduled orphan audit may report objects without live references, but must never delete them automatically until ownership, retention, and shared-reference rules are independently reviewed.

## Consistency and recovery

Database state is the authority for intended deletion; storage is eventually consistent cleanup work. A failed storage batch leaves the outbox pending and is retried with the same fence. Stale workers cannot complete a newer cleanup lease. No broad prefix delete is safe because a path match does not prove exclusive ownership.

## Preconditions for implementation

An additive migration defining the outbox, state transition RPCs, owner authorization, and lease fencing; isolated PostgreSQL tests; private-storage fixture tests; explicit retention decisions for historical generations/video outputs; and operational observability for pending age, retry count, object count, and terminal failures.
