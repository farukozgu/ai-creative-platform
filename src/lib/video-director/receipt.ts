import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { videoDraftHash } from "@/lib/video-generation/request-identity";
import { parseDirectorOutput, type VideoDirectorInput, type VideoDirectorPlan } from "./core";
import { VIDEO_DIRECTOR_VERSION, videoDirectorPresets } from "./presets";

export function directorCacheKey(ownerId: string, sourceSha256: string, model: string, input: VideoDirectorInput) {
  return createHash("sha256").update(JSON.stringify({ ownerId, sourceSha256, model,
    version: VIDEO_DIRECTOR_VERSION, preset: videoDirectorPresets[input.presetId], presetId: input.presetId,
    shotMode: input.shotMode, profile: input.profile,
    draft: videoDraftHash({ ...input.draft, director: undefined }),
  })).digest("hex");
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`video-director-receipt-v1:${payload}`).digest("hex");
}

/** Portable server-authenticated session cache: never trust a browser-supplied plan. */
export function sealDirectorPlan(key: string, plan: VideoDirectorPlan, secret: string, now = Date.now()) {
  if (!secret) throw new Error("Director signing unavailable.");
  const payload = Buffer.from(JSON.stringify({ key, plan, expiresAt: now + 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function openDirectorPlan(receipt: unknown, key: string, input: VideoDirectorInput, secret: string, now = Date.now()): VideoDirectorPlan | null {
  if (!secret || typeof receipt !== "string" || receipt.length > 14000) return null;
  try {
    const [payload, supplied, extra] = receipt.split(".");
    if (!payload || !/^[a-f0-9]{64}$/.test(supplied ?? "") || extra !== undefined
      || !timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(signature(payload, secret), "hex"))) return null;
    const cached = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (cached.key !== key || !Number.isFinite(cached.expiresAt) || cached.expiresAt <= now
      || cached.expiresAt > now + 60 * 60 * 1000 || cached.plan?.version !== VIDEO_DIRECTOR_VERSION
      || cached.plan?.presetId !== input.presetId || cached.plan?.presetVersion !== videoDirectorPresets[input.presetId].version
      || cached.plan?.shotMode !== input.shotMode || !["ai", "fallback"].includes(cached.plan?.origin)) return null;
    const plan = parseDirectorOutput(cached.plan, input);
    return plan ? { ...plan, origin: cached.plan.origin } : null;
  } catch { return null; }
}

/** Coalesce concurrent requests on one worker; durable beta quota still fences every HTTP attempt. */
export class DirectorPlanCache {
  private readonly entries = new Map<string, { expiresAt: number; value: Promise<VideoDirectorPlan> }>();
  getOrCreate(key: string, create: () => Promise<VideoDirectorPlan>, now = Date.now()) {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) return existing.value;
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
    if (this.entries.size >= 100) this.entries.delete(this.entries.keys().next().value!);
    const value = Promise.resolve().then(create);
    this.entries.set(key, { expiresAt: now + 60 * 60 * 1000, value });
    // Cache failures conservatively too; an uncertain paid request must not silently retry.
    return value;
  }
}
