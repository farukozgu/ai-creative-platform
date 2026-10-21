export type GenerationProvider = "openai";

export type ImageGenerationQuality = "preview" | "standard" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export type GenerationAspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";

/** @deprecated Legacy image edit rows may still contain 4:5. */
export type AspectRatio = GenerationAspectRatio | "4:5";

export type ProductPreservationMode = "reference_edit" | "pixel_lock";

export type FidelityStatus = "not_checked" | "locked" | "failed" | "not_available";

export type ImageGenerationSourceAsset = {
  id: string;
  bucketId: string;
  objectPath: string;
  data: Blob | Buffer;
  mimeType: string;
};

export type GenerationImageRole =
  | "product_identity_source"
  | "product_identity_supporting"
  | "generated_attempt"
  | "apparel_artwork_identity_source"
  | "reference_base_scene"
  | "scene_reference"
  | "style_reference"
  | "mask"
  | "generated_attempt";

export type ReferenceRole = "primary" | "supporting";

export type GenerationImageInput = ImageGenerationSourceAsset & {
  role: GenerationImageRole;
  order: number;
  referenceRole?: ReferenceRole;
};

export type ApparelArtworkIdentitySource = {
  assetId: string;
  side: "front" | "back" | "unknown";
  source: "detected_crop" | "profile_estimate" | "unavailable";
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  cropMetadata: { sourceWidth: number; sourceHeight: number; left: number; top: number; width: number; height: number } | null;
  confidence: number;
  containsText: boolean;
  identityCritical: boolean;
};

export type HumanRealismMetadata = {
  version: string;
  expected: boolean;
  applied: boolean;
  focusAreas: string[];
  issues: Array<{ issueCode: string; confidence: number; severity: string; region: string; repairable: boolean; commercialImpact: string }>;
  hardFailure: boolean;
  repairEligible: boolean;
  repairTriggered: boolean;
  repairCategory: string | null;
  validationResult: "pass" | "pass_with_warnings" | "fail" | "validation_unavailable" | null;
  repairType: string | null;
};

export type ImageGenerationRequest = {
  generationId: string;
  projectId: string;
  sourceAsset: ImageGenerationSourceAsset;
  images?: readonly GenerationImageInput[];
  prompt: string;
  provider: GenerationProvider;
  model: string;
  quality: ImageGenerationQuality;
  aspectRatio: AspectRatio;
  operation?: "image_edit" | "edit" | "reference_product_replacement";
};

export type ImageGenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  imageInputTokens?: number;
  imageOutputTokens?: number;
};

export type ImageGenerationResult = {
  imageData: Buffer;
  mimeType: string;
  provider: GenerationProvider;
  model: string;
  width?: number;
  height?: number;
  providerMetadata?: Record<string, string | number | boolean | null>;
  usage?: ImageGenerationUsage;
};

export interface ImageGenerationProviderClient {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export class GenerationProviderError extends Error {
  readonly provider: GenerationProvider;

  constructor(message: string, provider: GenerationProvider, options?: ErrorOptions) {
    super(message, options);
    this.name = "GenerationProviderError";
    this.provider = provider;
  }
}
