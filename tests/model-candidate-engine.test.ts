import assert from "node:assert/strict";
import test from "node:test";
import { buildModelCandidatePrompt, executeModelCandidateWhenEnabled, resolveCandidateProviderRequest, validateCandidateOutput } from "@/lib/models/candidate-engine";
import { emptyModelAppearanceDraft } from "@/features/models/model-profile";
const draft = { ...emptyModelAppearanceDraft, name: "Adult", presentation: "Feminine", ageRange: "18–24" as const, skinTone: "Medium", hairColor: "Brown", hairstyle: "Long", eyeColor: "Brown", silhouette: "Balanced", visualStyle: "Natural editorial" };
test("candidate prompt is fictional adult and contains no product pipeline prompt", () => { const prompt = buildModelCandidatePrompt(draft)!; assert.match(prompt, /fictional adult/i); assert.match(prompt, /no branding/i); assert.doesNotMatch(prompt, /product identity source/i); });
test("candidate requests are single-output and image output validation is bounded", () => { assert.equal(resolveCandidateProviderRequest(draft)?.count, 1); assert.equal(validateCandidateOutput({ imageData: Buffer.from("image"), mimeType: "image/png", providerRequestId: null, usage: undefined }), true); });
test("candidate execution stays closed before the provider can run", async () => { let called = false; const result = await executeModelCandidateWhenEnabled({ generate: async () => { called = true; throw new Error("must not run"); } }, draft); assert.equal(result.status, "disabled"); assert.equal(called, false); });
