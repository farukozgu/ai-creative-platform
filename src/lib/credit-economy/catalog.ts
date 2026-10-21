export const CREDIT_CATALOG_VERSION = "2026-10-v1" as const;

export type PlanId = "starter" | "creator" | "growth" | "business" | "studio";

export type PlanDefinition = {
  id: PlanId;
  version: typeof CREDIT_CATALOG_VERSION;
  monthlyPriceCents: number;
  monthlyCredits: number;
  entitlements: { standardVideo: true; proVideo: boolean };
};

export const PLAN_CATALOG = {
  starter: { id: "starter", version: CREDIT_CATALOG_VERSION, monthlyPriceCents: 1500, monthlyCredits: 1200, entitlements: { standardVideo: true, proVideo: false } },
  creator: { id: "creator", version: CREDIT_CATALOG_VERSION, monthlyPriceCents: 2900, monthlyCredits: 3500, entitlements: { standardVideo: true, proVideo: false } },
  growth: { id: "growth", version: CREDIT_CATALOG_VERSION, monthlyPriceCents: 4900, monthlyCredits: 6500, entitlements: { standardVideo: true, proVideo: true } },
  business: { id: "business", version: CREDIT_CATALOG_VERSION, monthlyPriceCents: 9900, monthlyCredits: 14000, entitlements: { standardVideo: true, proVideo: true } },
  studio: { id: "studio", version: CREDIT_CATALOG_VERSION, monthlyPriceCents: 19900, monthlyCredits: 30000, entitlements: { standardVideo: true, proVideo: true } },
} as const satisfies Record<PlanId, PlanDefinition>;

export const TOP_UP_CATALOG = {
  credits_1000: { id: "credits_1000", version: CREDIT_CATALOG_VERSION, priceCents: 1000, credits: 1000 },
  credits_3000: { id: "credits_3000", version: CREDIT_CATALOG_VERSION, priceCents: 3000, credits: 3000 },
  credits_10000: { id: "credits_10000", version: CREDIT_CATALOG_VERSION, priceCents: 10000, credits: 10000 },
} as const;

export function isPlanId(value: string): value is PlanId {
  return value in PLAN_CATALOG;
}
