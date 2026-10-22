import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const ui = read("src/features/models/candidate-review.tsx");
const data = read("src/lib/models/candidate-review.ts");
const route = read("src/app/api/model-reference/[referenceId]/route.ts");

test("candidate review uses persisted rows, explicit empty state and multiple selection", () => {
  assert.match(data, /from\("model_candidates"\)/);
  assert.match(ui, /data\.candidates\.length === 0/);
  assert.match(ui, /setSelectedId\(candidate\.id\)/);
  assert.match(ui, /ready\.length >= 2/);
  assert.doesNotMatch(ui, /placeholder.*(?:face|portrait)/i);
});

test("approval stays disabled and private object paths stay server side", () => {
  assert.match(ui, /<Button disabled>/);
  assert.doesNotMatch(ui, /approveCandidate|approvalRpc|\.rpc\(/);
  assert.match(route, /getAuthenticatedUserId/);
  assert.match(route, /\.eq\("user_id", userId\)/);
  assert.match(data, /\/api\/model-reference\/\$\{asset\.id\}/);
});

test("review states and reference labels exist in both locales", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)).Dashboard.modelReview;
    for (const key of ["empty", "unavailable", "previewMissing", "approvalDisabled", "compare"]) assert.ok(messages[key]);
    for (const key of ["queued", "processing", "succeeded", "failed", "ambiguous", "unknown"]) assert.ok(messages.job[key]);
    for (const key of ["validated", "missing", "pending", "rejected", "unavailable"]) assert.ok(messages.evidenceState[key]);
  }
});
