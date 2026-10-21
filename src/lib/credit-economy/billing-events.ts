import type { PlanId } from "@/lib/credit-economy/catalog";

export type VerifiedBillingEvent =
  | { kind: "subscription_activated" | "subscription_renewed" | "subscription_upgraded" | "subscription_downgraded"; eventReference: string; ownerId: string; planId: PlanId; catalogVersion: string; periodStart: string; periodEnd: string }
  | { kind: "subscription_canceled" | "subscription_payment_failed" | "subscription_expired"; eventReference: string; ownerId: string }
  | { kind: "top_up_verified"; eventReference: string; ownerId: string; packageId: string }
  | { kind: "administrative_grant"; eventReference: string; ownerId: string; credits: number; authorizedBy: string }
  | { kind: "refund_or_reversal"; eventReference: string; ownerId: string; originalGrantReference: string; credits: number };

export interface VerifiedBillingEventAdapter {
  verifyAndNormalize(payload: unknown): Promise<VerifiedBillingEvent | null>;
}

/** Closed by default until a payment provider and its signed webhook contract are approved. */
export class ClosedBillingEventAdapter implements VerifiedBillingEventAdapter {
  async verifyAndNormalize(): Promise<null> { return null; }
}
