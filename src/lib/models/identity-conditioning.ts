import "server-only";

import type { ResolvedIdentityReferences } from "./identity-reference-resolution";

export type ConditioningImage = { id: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; data: Uint8Array };
export type IdentityConditionedImageInput = ConditioningImage & { role: "product_primary" | "product_supporting" | "identity_primary_portrait" | "identity_evidence" | "scene_reference"; order: number };

export type IdentityConditionedRequest = {
  execution: "disabled";
  identityVersion: { modelId: string; identityVersionId: string; identityVersionNumber: number };
  images: readonly IdentityConditionedImageInput[];
  prompt: string;
};

export function buildIdentityConditionedRequest(input: {
  products: readonly ConditioningImage[];
  identity: ResolvedIdentityReferences;
  sceneReferences: readonly ConditioningImage[];
  creativeDirection: string;
}): IdentityConditionedRequest | null {
  if (!input.products.length || !input.identity.primaryPortrait.data) return null;
  const images: IdentityConditionedImageInput[] = [
    ...input.products.map((product, index) => ({ ...product, role: index === 0 ? "product_primary" as const : "product_supporting" as const, order: index })),
    { id: input.identity.primaryPortrait.id, mimeType: input.identity.primaryPortrait.mimeType, data: input.identity.primaryPortrait.data, role: "identity_primary_portrait", order: input.products.length },
    ...input.identity.additionalEvidence.map((asset, index) => ({ id: asset.id, mimeType: asset.mimeType, data: asset.data!, role: "identity_evidence" as const, order: input.products.length + 1 + index })),
    ...input.sceneReferences.map((reference, index) => ({ ...reference, role: "scene_reference" as const, order: input.products.length + 1 + input.identity.additionalEvidence.length + index })),
  ];
  return {
    execution: "disabled",
    identityVersion: { modelId: input.identity.modelId, identityVersionId: input.identity.identityVersionId, identityVersionNumber: input.identity.identityVersionNumber },
    images,
    prompt: [
      "PRODUCT FIDELITY: Product inputs are the sole authority for the product’s exact form, color, material, logo, pattern, and construction.",
      "IDENTITY FIDELITY: The pinned approved identity portrait and evidence describe one fictional adult model. Preserve recognizable facial features, hair, and lasting appearance traits. Do not replace this identity with a scene reference or styling request.",
      "CREATIVE DIRECTION: Clothing, pose, lighting, composition, and setting are shoot-specific. Apply them only when they do not redefine product or persistent identity attributes.",
      `Requested shoot direction: ${input.creativeDirection.trim()}`,
      "Identity consistency is evaluated from evidence and is not guaranteed.",
    ].join("\n\n"),
  };
}
