import { createHmac, timingSafeEqual } from "node:crypto";
import { videoDraftHash } from "./request-identity";
import { matchesUsdQuoteConfirmation } from "./money";
import type { VideoGenerationDraft } from "./types";

const MAX_AGE_MS = 2 * 60 * 1000;

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`video-beta-quote-v1:${payload}`).digest("hex");
}

/** Bind a server-priced request to its owner, submission, full draft, cost and short expiry. */
export function sealVideoQuote(ownerId: string, draft: VideoGenerationDraft, cost: number, secret: string, now = Date.now(), snapshotHash?: string) {
  if (!secret || !Number.isFinite(cost) || cost <= 0) throw new Error("Video quote signing unavailable.");
  const expiresAt = now + MAX_AGE_MS;
  const payload = Buffer.from(JSON.stringify({ ownerId, submissionId: draft.clientSubmissionId,
    draftHash: videoDraftHash(draft), cost, expiresAt, ...(snapshotHash ? { snapshotHash } : {}) })).toString("base64url");
  return { receipt: `${payload}.${signature(payload, secret)}`, expiresAt };
}

export function verifyVideoQuote(receipt: unknown, ownerId: string, draft: VideoGenerationDraft, cost: number, secret: string, now = Date.now(), snapshotHash?: string) {
  if (!secret || typeof receipt !== "string" || receipt.length > 4096) return false;
  try {
    const [payload, provided, extra] = receipt.split(".");
    if (!payload || !/^[a-f0-9]{64}$/.test(provided ?? "") || extra !== undefined
      || !timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(signature(payload, secret), "hex"))) return false;
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const quote = value as Record<string, unknown>;
    return quote.ownerId === ownerId && quote.submissionId === draft.clientSubmissionId && quote.draftHash === videoDraftHash(draft)
      && (snapshotHash === undefined || quote.snapshotHash === snapshotHash)
      && typeof quote.cost === "number" && matchesUsdQuoteConfirmation(quote.cost, cost)
      && typeof quote.expiresAt === "number" && Number.isSafeInteger(quote.expiresAt)
      && quote.expiresAt > now && quote.expiresAt <= now + MAX_AGE_MS;
  } catch { return false; }
}
