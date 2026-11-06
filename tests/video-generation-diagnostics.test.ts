import assert from "node:assert/strict";
import test from "node:test";
import { safeOpenAIStatus } from "../src/lib/video-generation/diagnostics";

for (const code of ["quota_limited", "budget_unavailable", "configuration_error"] as const) {
  test(`safe diagnostics classify local budget failure: ${code}`, () => {
    const error = Object.assign(new Error("private provider text"), { cause: Object.assign(new Error("private budget detail"), { name: "OpenAIBudgetError", budgetFailure: code }) });
    assert.deepEqual(safeOpenAIStatus(error), { status: null, code, category: "local_budget" });
  });
}

test("safe diagnostics classify local access denial without exposing error text", () => {
  const error = Object.assign(new Error("private provider text"), { cause: { name: "OpenAIBetaAccessError", message: "secret details" } });
  assert.deepEqual(safeOpenAIStatus(error), { status: null, code: "access_denied", category: "local_access" });
});

test("safe diagnostics retain provider HTTP and network classes without raw errors", () => {
  const http = safeOpenAIStatus(Object.assign(new Error("secret key and request body"), { status: 429, code: "rate_limit_exceeded" }));
  assert.deepEqual(http, { status: 429, code: "rate_limit_exceeded", category: "provider_http" });
  const network = safeOpenAIStatus(Object.assign(new Error("secret request payload"), { name: "APIConnectionError", code: "ECONNRESET" }));
  assert.deepEqual(network, { status: null, code: "ECONNRESET", category: "network" });
});

test("diagnostics discard provider fields that can carry identifiers or credentials", () => {
  for (const code of ["sk-fixture-credential", "sb_secret_fixture", "10000000-0000-4000-8000-000000000001"]) {
    assert.deepEqual(safeOpenAIStatus({ status: 401, code }), { status: 401, code: null, category: "provider_http" });
  }
});
