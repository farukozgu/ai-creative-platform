export type CreditSource = {
  grantId: string;
  kind: "subscription_period" | "top_up" | "administrative" | "promotional";
  availableCredits: number;
  expiresAt: string | null;
  createdAt: string;
};

export type SourceAllocation = { grantId: string; credits: number; expiresAt: string | null };

export function isSourceEligible(source: CreditSource, at: Date) {
  return source.availableCredits > 0 && (source.expiresAt === null || Date.parse(source.expiresAt) > at.getTime());
}

export function allocateCredits(sources: readonly CreditSource[], requiredCredits: number, at: Date): SourceAllocation[] | null {
  if (!Number.isSafeInteger(requiredCredits) || requiredCredits <= 0) return null;
  const ordered = sources.filter((source) => isSourceEligible(source, at)).sort((left, right) => {
    if (left.expiresAt === null && right.expiresAt !== null) return 1;
    if (left.expiresAt !== null && right.expiresAt === null) return -1;
    const expiryDifference = (left.expiresAt ? Date.parse(left.expiresAt) : 0) - (right.expiresAt ? Date.parse(right.expiresAt) : 0);
    return expiryDifference || Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.grantId.localeCompare(right.grantId);
  });
  let remaining = requiredCredits;
  const allocations: SourceAllocation[] = [];
  for (const source of ordered) {
    const credits = Math.min(remaining, source.availableCredits);
    if (credits > 0) allocations.push({ grantId: source.grantId, credits, expiresAt: source.expiresAt });
    remaining -= credits;
    if (remaining === 0) return allocations;
  }
  return null;
}

export function resolveRefundEligibility(allocation: SourceAllocation, at: Date) {
  return allocation.expiresAt === null || Date.parse(allocation.expiresAt) > at.getTime()
    ? { availableCredits: allocation.credits, expiredCredits: 0 }
    : { availableCredits: 0, expiredCredits: allocation.credits };
}
