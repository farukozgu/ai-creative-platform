import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPlanId } from "@/lib/credit-economy/catalog";
import type { ActiveSubscription, SubscriptionStatus } from "@/lib/credit-economy/entitlements";

export async function getActiveSubscription(ownerId: string): Promise<ActiveSubscription | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("billing_subscriptions")
    .select("plan_id,status,current_period_end")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || !isPlanId(data.plan_id)) return null;
  return { planId: data.plan_id, status: data.status as SubscriptionStatus, currentPeriodEnd: data.current_period_end };
}
