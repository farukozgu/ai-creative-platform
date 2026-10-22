import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveIdentityFidelityEvaluation, proposeIdentityRepair } from "../src/lib/models/identity-fidelity";

const resolver = readFileSync("src/lib/models/identity-reference-resolution.ts", "utf8");
const conditioning = readFileSync("src/lib/models/identity-conditioning.ts", "utf8");
test("pinned approved resolution verifies ownership, primary portrait, and private availability", () => {
  assert.match(resolver, /import "server-only"/);
  assert.match(resolver, /current_identity_version_id !== identityVersionId/);
  assert.match(resolver, /reference\.view === "front"/);
  assert.match(resolver, /private_asset_unavailable/);
  assert.match(resolver, /asset\.userId === input\.userId/);
});
test("request contracts separate and order product, identity, and scene evidence", () => {
  assert.match(conditioning, /role: "product_primary"/);
  assert.match(conditioning, /role: "identity_primary_portrait"/);
  assert.match(conditioning, /role: "identity_evidence"/);
  assert.match(conditioning, /role: "scene_reference"/);
  assert.match(conditioning, /execution: "disabled"/);
});
test("identity evaluation has explicit non-fabricated outcomes and repair stays closed", () => { const pass = resolveIdentityFidelityEvaluation(["recognizable_face", "facial_features_stable", "hair_and_appearance_consistent", "reference_quality_adequate"].map((signal) => ({ signal: signal as "recognizable_face" | "facial_features_stable" | "hair_and_appearance_consistent" | "reference_quality_adequate", observed: true, source: "mock" as const }))); assert.equal(pass.outcome, "pass"); assert.equal(pass.evaluated, false); const fail = resolveIdentityFidelityEvaluation([{ signal: "significant_identity_drift", observed: true, source: "mock" }]); assert.equal(fail.outcome, "fail"); assert.equal(proposeIdentityRepair(fail).maxAdditionalProviderCalls, 0); });
