import type { VideoGenerationDraft } from "./types";

type Environment = Record<string, string | undefined>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canAccessVideoBeta(ownerId: string, env: Environment = process.env) {
  const ids = (env.VIDEO_BETA_USER_IDS ?? "").split(",").map(id => id.trim());
  return env.VIDEO_BETA_ENABLED === "true" && uuid.test(ownerId) && ids.length === 1 && ids[0] === ownerId;
}

/** A human approves one immutable submission ID and a USD ceiling, never a blanket spend flag. */
export function canSubmitVideoBeta(ownerId: string, draft: VideoGenerationDraft, cost: number, env: Environment = process.env) {
  const ceiling = Number(env.VIDEO_BETA_APPROVED_MAX_COST_USD ?? "0");
  return canAccessVideoBeta(ownerId, env) && env.VIDEO_GENERATION_ENABLED === "true"
    && uuid.test(env.VIDEO_BETA_APPROVED_SUBMISSION_ID ?? "")
    && env.VIDEO_BETA_APPROVED_SUBMISSION_ID === draft.clientSubmissionId
    && env.VIDEO_BETA_APPROVED_TIER === draft.quality
    && env.VIDEO_BETA_APPROVED_DURATION_SECONDS === String(draft.durationSeconds)
    && Number.isFinite(cost) && cost > 0 && cost <= ceiling && ceiling <= 10;
}
