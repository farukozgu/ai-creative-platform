import assert from "node:assert/strict";
import test from "node:test";
import { canApproveCandidate, resolveCandidateGenerationPolicy, validateCandidateSubmission } from "@/lib/models/candidate-contracts";
import { emptyModelAppearanceDraft } from "@/features/models/model-profile";
test("candidate generation remains closed and unbilled", () => assert.deepEqual(resolveCandidateGenerationPolicy(), { enabled: false, billing: "closed", executor: "disabled", provider: "openai" }));
test("candidate approval requires completed owned evidence", () => { assert.equal(canApproveCandidate({ jobStatus: "succeeded", candidateStatus: "ready", ownerMatches: true, primaryReferenceOwned: true }), true); assert.equal(canApproveCandidate({ jobStatus: "ambiguous", candidateStatus: "ready", ownerMatches: true, primaryReferenceOwned: true }), false); assert.equal(canApproveCandidate({ jobStatus: "succeeded", candidateStatus: "ready", ownerMatches: false, primaryReferenceOwned: true }), false); });
test("candidate submission retains adult-only validation", () => assert.equal(validateCandidateSubmission({ ...emptyModelAppearanceDraft, name: "Adult", presentation: "Feminine", ageRange: "18–24", skinTone: "Medium", hairColor: "Brown", hairstyle: "Long", eyeColor: "Brown", silhouette: "Balanced", visualStyle: "Natural editorial" })?.ageRange, "18–24"));
