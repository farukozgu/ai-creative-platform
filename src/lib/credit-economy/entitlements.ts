import { PLAN_CATALOG, type PlanId } from "@/lib/credit-economy/catalog";

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "expired";
export type ActiveSubscription = { planId: PlanId; status: SubscriptionStatus; currentPeriodEnd: string };
export type VideoTier = "standard" | "pro";

export function hasActivePaidPlan(subscription: ActiveSubscription | null, now = new Date()) {
  return subscription?.status === "active" && Date.parse(subscription.currentPeriodEnd) > now.getTime();
}

export function canUseVideoTier(subscription: ActiveSubscription | null, tier: VideoTier, now = new Date()) {
  if (!subscription || !hasActivePaidPlan(subscription, now)) return false;
  const entitlements = PLAN_CATALOG[subscription.planId].entitlements;
  return tier === "standard" ? entitlements.standardVideo : entitlements.proVideo;
}
