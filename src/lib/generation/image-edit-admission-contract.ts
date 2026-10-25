import { createHash } from "node:crypto";
import { getOpenAIBetaPolicy } from "@/lib/openai/beta-policy";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const IMAGE_EDIT_ACTIVE_LIMIT_DEFAULT = 2;

export function isImageEditExecutionEnabled(environment: Record<string, string | undefined> = process.env) {
  return environment.IMAGE_EDIT_EXECUTION_ENABLED === "true";
}

export function isImageEditAvailableForUser(userId: string | null, environment: Record<string, string | undefined> = process.env) {
  return isImageEditExecutionEnabled(environment) && getOpenAIBetaPolicy(userId, environment) !== null;
}

export function validateImageEditSubmissionId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

/** The fingerprint covers every input that changes the paid request. */
export function createImageEditRequestFingerprint(input: { projectId: string; baseGenerationId: string; instruction: string }) {
  return createHash("sha256")
    .update(JSON.stringify({ v: 1, projectId: input.projectId, baseGenerationId: input.baseGenerationId, instruction: input.instruction.trim() }))
    .digest("hex");
}
