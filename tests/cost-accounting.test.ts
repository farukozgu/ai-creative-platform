import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCostEvents, makeUsageEvent, parseProviderUsage, summarizeCostEvents, unknownUsage, type UsageUnits } from "../src/lib/generation/cost/cost-accounting";
import { attachOpenAIResponseTelemetry, getOpenAIResponseTelemetry } from "../src/lib/openai/response-telemetry";

const imageUsage: UsageUnits = { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: null, imageInputTokens: 1_000_000, imageOutputTokens: 1_000_000, otherUnits: null };
const event = (operation: "image_initial" | "image_repair", usage: UsageUnits = imageUsage) => makeUsageEvent({ operation, provider: "openai", model: "gpt-image-2.5-sunburst", requestId: operation, phase: operation === "image_repair" ? "repair" : "initial", occurredAt: "2026-10-20T00:00:00.000Z", usage });

test("parses generic, cached, and image usage without inventing absent fields", () => {
  assert.deepEqual(parseProviderUsage({ input_tokens: 10, output_tokens: 20, input_tokens_details: { cached_tokens: 3 }, image_tokens: { input_tokens: 4, output_tokens: 5 } }), { inputTokens: 10, outputTokens: 20, cachedInputTokens: 3, imageInputTokens: 4, imageOutputTokens: 5, otherUnits: null });
  assert.deepEqual(parseProviderUsage(undefined), unknownUsage);
});

test("carries Responses usage and request IDs outside business payload serialization", () => {
  const output = attachOpenAIResponseTelemetry({ valid: true }, { _request_id: "req_response", usage: { input_tokens: 30, output_tokens: 12, input_tokens_details: { cached_tokens: 7 } } });
  assert.deepEqual(getOpenAIResponseTelemetry(output), { requestId: "req_response", usage: { inputTokens: 30, outputTokens: 12, cachedInputTokens: 7, imageInputTokens: null, imageOutputTokens: null, otherUnits: null } });
  assert.deepEqual(JSON.parse(JSON.stringify(output)), { valid: true });
  assert.equal(getOpenAIResponseTelemetry({ valid: true }), null);
});

test("prices distinct GPT Image text and image units precisely", () => {
  assert.equal(event("image_initial").costUsd, "43.000000");
  assert.equal(event("image_initial").status, "priced");
});

test("distinguishes incomplete, unknown, potentially billed, and known-zero events", () => {
  assert.equal(event("image_initial", unknownUsage).status, "incomplete_usage");
  assert.equal(makeUsageEvent({ operation: "prompt_enhancement", provider: "openai", model: "custom", requestId: null, phase: "supporting", occurredAt: "2026-10-20T00:00:00.000Z", usage: unknownUsage }).status, "unpriced_model");
  assert.equal(makeUsageEvent({ operation: "image_repair", provider: "openai", model: "gpt-image-2.5-sunburst", requestId: null, phase: "repair", occurredAt: "2026-10-20T00:00:00.000Z", usage: unknownUsage, ambiguous: true }).status, "potentially_billed");
  assert.equal(makeUsageEvent({ operation: "segmentation", provider: "fal", model: "fal-ai/birefnet/v2", requestId: null, phase: "supporting", occurredAt: "2026-10-20T00:00:00.000Z", usage: unknownUsage }).status, "zero");
});

test("keeps repair separate and prevents missing-data bias in aggregates", () => {
  const initial = event("image_initial"), repair = event("image_repair");
  assert.equal(summarizeCostEvents([initial, repair]).knownSubtotalUsd, "86.000000");
  const incomplete = makeUsageEvent({ operation: "fidelity_validation", provider: "openai", model: "gpt-4o-mini", requestId: null, phase: "supporting", occurredAt: "2026-10-20T00:00:00.000Z", usage: unknownUsage });
  const aggregate = aggregateCostEvents([[initial], [repair], [incomplete]]);
  assert.equal(aggregate.completeSubmissionCount, 2);
  assert.equal(aggregate.averageKnownCostPerSubmissionUsd, "43.000000");
  assert.equal(aggregate.incompleteSubmissionCount, 1);
});
