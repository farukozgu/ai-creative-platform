import type { VideoGenerationDraft } from "./types";
import { usdToMicrosCeil, usdToMicrosFloor } from "./money";

type Environment = Record<string, string | undefined>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canAccessVideoBeta(ownerId: string, env: Environment = process.env) {
  if (env.VIDEO_STUDIO_ENABLED === "true") {
    if (!uuid.test(ownerId)) return false;
    if (env.VIDEO_STUDIO_ACCESS_MODE === "authenticated") return true;
    if (env.VIDEO_STUDIO_ACCESS_MODE && env.VIDEO_STUDIO_ACCESS_MODE !== "allowlist") return false;
    const ids = (env.VIDEO_STUDIO_USER_IDS ?? env.VIDEO_BETA_USER_IDS ?? "").split(",").map(id => id.trim());
    return ids.length > 0 && ids.every(id => uuid.test(id)) && ids.includes(ownerId);
  }
  const ids = (env.VIDEO_BETA_USER_IDS ?? "").split(",").map(id => id.trim());
  return env.VIDEO_BETA_ENABLED === "true" && uuid.test(ownerId) && ids.length === 1 && ids[0] === ownerId;
}

/** Public option availability only; never a spending authorization. */
export function getVideoStudioOptions(env: Environment = process.env) {
  const studio = env.VIDEO_STUDIO_ENABLED === "true";
  const tiers = (studio ? env.VIDEO_STUDIO_ALLOWED_TIERS ?? "standard,pro" : env.VIDEO_BETA_ALLOWED_TIERS ?? "").split(",").map(value => value.trim());
  const durations = (studio ? env.VIDEO_STUDIO_ALLOWED_DURATIONS ?? "5,10" : env.VIDEO_BETA_ALLOWED_DURATIONS ?? "").split(",").map(value => value.trim());
  return {
    tiers: tiers.length > 0 && tiers.every(value => ["standard", "pro"].includes(value)) ? tiers : [],
    durations: durations.length > 0 && durations.every(value => ["5", "10"].includes(value)) ? durations.map(Number) : [],
  };
}

/** Operator policy is independent of the customer's per-request confirmation. */
export function videoSubmissionPolicyChecks(ownerId: string, draft: VideoGenerationDraft, cost: number, env: Environment = process.env): Record<string, boolean> {
  if (env.VIDEO_STUDIO_ENABLED === "true") {
    const options = getVideoStudioOptions(env);
    const configured = env.VIDEO_STUDIO_MAX_COST_PER_REQUEST_USD ?? "2";
    const highLimits = env.VIDEO_STUDIO_ALLOW_HIGH_LIMITS === "true";
    const ceiling = usdToMicrosFloor(configured);
    const amount = usdToMicrosCeil(cost);
    const withinCeiling = configured === "unlimited" ? highLimits
      : ceiling !== null && ceiling > BigInt(0) && (ceiling <= BigInt(2_000_000) || highLimits) && amount !== null && amount <= ceiling;
    return { access_allowed: canAccessVideoBeta(ownerId, env), generation_enabled: env.VIDEO_GENERATION_ENABLED === "true",
      studio_spending_enabled: env.VIDEO_STUDIO_SPENDING_ENABLED === "true", submission_id_valid: uuid.test(draft.clientSubmissionId),
      tier_allowed: options.tiers.includes(draft.quality), duration_allowed: options.durations.includes(draft.durationSeconds),
      cost_valid: amount !== null && amount > BigInt(0), within_cost_ceiling: withinCeiling };
  }
  const ceiling = usdToMicrosFloor(env.VIDEO_BETA_MAX_COST_PER_REQUEST_USD ?? "0");
  const costMicros = usdToMicrosCeil(cost);
  const tiers = (env.VIDEO_BETA_ALLOWED_TIERS ?? "").split(",").map(value => value.trim());
  const durations = (env.VIDEO_BETA_ALLOWED_DURATIONS ?? "").split(",").map(value => value.trim());
  const betaAllowlist = (env.VIDEO_BETA_USER_IDS ?? "").split(",").map(value => value.trim());
  const allowlistedAdmin = env.VIDEO_BETA_ENABLED === "true" && uuid.test(ownerId)
    && betaAllowlist.length === 1 && betaAllowlist[0] === ownerId;
  const validCost = costMicros !== null && costMicros > BigInt(0) && costMicros < BigInt("1000000000000");
  return { access_allowed: canAccessVideoBeta(ownerId, env), generation_enabled: env.VIDEO_GENERATION_ENABLED === "true",
    beta_approvals_enabled: env.VIDEO_BETA_TRANSACTION_APPROVALS_ENABLED === "true", submission_id_valid: uuid.test(draft.clientSubmissionId),
    tier_allowed: tiers.length > 0 && tiers.every(value => ["standard", "pro"].includes(value)) && tiers.includes(draft.quality),
    duration_allowed: durations.length > 0 && durations.every(value => ["5", "10"].includes(value)) && durations.includes(String(draft.durationSeconds)),
    cost_valid: validCost, within_cost_ceiling: allowlistedAdmin || (ceiling !== null && costMicros !== null && costMicros <= ceiling && ceiling <= BigInt(2_000_000)) };
}

export function canSubmitVideoBeta(ownerId: string, draft: VideoGenerationDraft, cost: number, env: Environment = process.env) {
  return Object.values(videoSubmissionPolicyChecks(ownerId, draft, cost, env)).every(Boolean);
}
