import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const migration = readFileSync(join(process.cwd(), "database/migrations/20261030000000_create_model_identity_foundation.sql"), "utf8");
test("model persistence keeps profiles owner-scoped, draft-only, and versioned", () => { assert.match(migration, /create table public\.model_profiles/); assert.match(migration, /status in \('draft', 'candidate_pending', 'identity_review_pending', 'approved', 'archived'\)/); assert.match(migration, /Owners insert model profiles[\s\S]*status = 'draft'/); assert.match(migration, /Identity versions are immutable/); assert.match(migration, /Model status transition is not enabled/); });
test("model references use a private bucket with no authenticated upload policy", () => { const storageSection = migration.slice(migration.indexOf("insert into storage.buckets")); assert.match(storageSection, /'model-reference-assets'[\s\S]*false/); assert.match(migration, /candidate_generated/); assert.doesNotMatch(storageSection, /for insert\s+to authenticated/); });
