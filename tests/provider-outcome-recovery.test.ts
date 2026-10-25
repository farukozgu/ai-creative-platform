import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isProviderOutcomeAmbiguous } from "../src/lib/generation/providers/provider-error-diagnostics";

test("provider connection failures and server errors are marked as ambiguous", () => {
  assert.equal(isProviderOutcomeAmbiguous({ name: "GenerationProviderError", cause: { name: "APIConnectionTimeoutError", message: "Request timed out." } }), true);
  assert.equal(isProviderOutcomeAmbiguous({ status: 500, message: "Internal server error" }), true);
  assert.equal(isProviderOutcomeAmbiguous({ status: 408, message: "Request timeout" }), true);
});

test("known provider rejections and local beta denials are safe to retry", () => {
  assert.equal(isProviderOutcomeAmbiguous({ status: 400, message: "Invalid request" }), false);
  assert.equal(isProviderOutcomeAmbiguous({ status: 429, message: "Rate limited" }), false);
  assert.equal(isProviderOutcomeAmbiguous({ name: "OpenAIBetaAccessError", message: "Budget unavailable" }), false);
  assert.equal(isProviderOutcomeAmbiguous(new Error("Invalid local image dimensions")), false);
});

test("the Composer preserves a submission key after transport uncertainty and exposes a deliberate retry", async () => {
  const form = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generate-image-form.tsx", "utf8");
  const action = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");

  assert.match(form, /Keep the submission id: the next click will resolve the same request idempotently/);
  assert.match(form, /submissionUnconfirmed \? messages\.checkSubmission/);
  assert.match(form, /result\.status === "reconciliation_required" \? messages\.outcomeUnknown/);
  assert.match(action, /providerOutcomeAmbiguous \? "reconciliation_required" : "failed"/);
  assert.match(action, /resolveSubmittedGenerationStatus\(terminalGeneration\?\.status\)/);
  assert.match(action, /resolveSubmittedGenerationStatus\(existingGeneration\.status\)/);
});
