import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const selection = readFileSync("src/lib/models/composer-model-selection.ts", "utf8");
const boundary = readFileSync("src/lib/models/composer-identity-boundary.ts", "utf8");
const composer = readFileSync("src/components/dashboard/creative-composer.tsx", "utf8");
const generation = readFileSync("src/lib/generation/image-worker-service.ts", "utf8");
const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));
const tr = JSON.parse(readFileSync("src/messages/tr.json", "utf8"));

test("composer offers only current approved, pinned identity versions", () => {
  assert.match(selection, /\.eq\("status", "approved"\)/);
  assert.match(selection, /current_identity_version_id/);
  assert.match(selection, /version\.model_id !== profile\.id/);
  assert.match(selection, /referenceAssetIds/);
  assert.doesNotMatch(selection, /object_path.*ComposerModelIdentity/);
});

test("identity selection is ownership-validated and remains feature-gated", () => {
  assert.match(boundary, /getAuthenticatedUserId/);
  assert.match(boundary, /modelId === candidate\.modelId/);
  assert.match(boundary, /identityVersionId === candidate\.identityVersionId/);
  assert.match(boundary, /identity_generation_disabled/);
  assert.match(composer, /if \(selectedModel\) return;/);
  assert.match(generation, /identity_version_id/);
  assert.match(generation, /identityGenerationDisabled/);
});

test("TR and EN expose the same composer model-selection copy", () => {
  assert.deepEqual(Object.keys(en.Dashboard.composer.modelSelection).sort(), Object.keys(tr.Dashboard.composer.modelSelection).sort());
});
