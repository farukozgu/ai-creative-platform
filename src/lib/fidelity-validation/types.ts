import type { CompositionProfile } from "@/lib/composition-intelligence/types";
import type { CreativeComplianceResolution } from "@/lib/creative-direction-compliance/types";
import type { ProductProfile } from "@/lib/product-understanding/product-profile";
import type { GenerationStrategy } from "@/lib/generation/strategy/generation-strategy";
import type { SceneSuitabilityResolution } from "@/lib/scene-suitability/types";
import type { SupportedVertical } from "@/lib/verticals/supported-verticals";
import type { ReferenceMatchResolution } from "@/lib/generation/references/resolve-reference-match";
import type { ProductIdentityManifest } from "@/lib/product-identity/types";
import type { HumanRealismPolicy } from "@/lib/human-realism/types";
import type { ApparelFitProfile } from "@/lib/apparel-fit-preservation/types";
import type { PresentationContractField, PresentationModeContract } from "@/lib/creative-presets/presentation-mode-contracts";
import type { OpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";

export const fidelityValidationCategories = [
  "product_identity", "geometry", "color_material", "branding_text", "body_interaction",
  "composition_visibility", "creative_requirement", "realism", "human_realism", "apparel_fit", "duplication", "structural_integrity", "reference_match",
] as const;
export type FidelityValidationCategory = (typeof fidelityValidationCategories)[number];
export type FidelityIssueSeverity = "critical" | "major" | "minor";
export type FidelityValidationStatus = "pass" | "pass_with_warnings" | "fail" | "validation_unavailable";
export type FidelityIdentityImpact = "none" | "minor" | "major" | "critical";
export type FidelityLikelyCause = "source_identity_drift" | "perspective" | "fabric_deformation" | "lighting" | "body_interaction" | "typography_change" | "geometry_change" | "unknown";
export type FidelityCommercialImpact = "none" | "low" | "medium" | "high";

export type FidelityValidationIssue = {
  code: string;
  issueCode?: string;
  category: FidelityValidationCategory;
  severity: FidelityIssueSeverity;
  confidence?: number;
  identityImpact?: FidelityIdentityImpact;
  likelyCause?: FidelityLikelyCause;
  region?: string;
  repairable?: boolean;
  commercialImpact?: FidelityCommercialImpact;
  presetMismatchFields?: PresentationContractField[];
  finding: string;
  expected: string;
  sourceAuthoritative: boolean;
};

export type FidelityValidationCheck = {
  category: FidelityValidationCategory;
  passed: boolean;
  finding: string;
  issueCodes: string[];
};

export type FidelityValidationResult = {
  status: FidelityValidationStatus;
  checks: FidelityValidationCheck[];
  issues: FidelityValidationIssue[];
  severity: FidelityIssueSeverity | null;
  retryRecommended: boolean;
  commerciallyUsable: boolean | null;
  summary: string;
  version: string;
  telemetry?: OpenAIResponseTelemetry | null;
};

export type FidelityValidationBrief = {
  vertical: SupportedVertical | "product";
  strategy: GenerationStrategy;
  humanRealism?: HumanRealismPolicy;
  apparelFit?: { active: boolean; profile: ApparelFitProfile | null };
  footwearAnatomyRequired?: boolean;
  sourceAuthority: string;
  productImageCount?: number;
  referencePreservation: boolean;
  presetOverrideReason?: "reference_authority" | null;
  productProfile: ProductProfile | null;
  sceneSuitability: SceneSuitabilityResolution | null;
  composition: CompositionProfile | null;
  appliedRequirements: CreativeComplianceResolution["applied"];
  allowedTransformations: string[];
  verticalChecks: string[];
  referenceMatch?: ReferenceMatchResolution | null;
  identityManifest?: ProductIdentityManifest | null;
  apparelArtworkIdentity?: { available: boolean; containsText: boolean; side: "front" | "back" | "unknown"; confidence: number } | null;
  apparelArtworkEvidence?: { artworkPresent: boolean | null; artworkSide: "front" | "back" | "unknown" } | null;
  preset?: {
    familyId: string; variantId: string | null; vertical?: string;
    allowedSceneTypes?: readonly string[]; disallowedSceneTypes?: readonly string[];
    hardRules?: readonly string[]; softRules?: readonly string[];
    presentationMode?: string | null;
    humanPresence?: "none" | "partial" | "full" | null;
    interactionMode?: string | null;
    strictProductOnlyStudio?: boolean;
    modeContract?: PresentationModeContract | null;
    referenceOverriddenFields?: readonly PresentationContractField[];
    presetPreservedFields?: readonly PresentationContractField[];
  } | null;
  variationHistory?: { recentVariantIds: readonly string[]; repeatedSceneCount: number } | null;
};

export type FidelityValidationInput = {
  originalProduct: Buffer;
  supportingProducts?: Array<{ data: Buffer; mimeType: string }>;
  generatedImage: Buffer;
  originalMimeType: string;
  referenceBaseScene?: Buffer;
  referenceBaseSceneMimeType?: string;
  generatedMimeType: string;
  productProfile: ProductProfile | null;
  vertical: SupportedVertical | "product";
  strategy: GenerationStrategy;
  humanRealism?: HumanRealismPolicy;
  apparelFit?: { active: boolean; profile: ApparelFitProfile | null };
  sceneSuitability: SceneSuitabilityResolution | null;
  composition: CompositionProfile | null;
  creativeCompliance: CreativeComplianceResolution | null;
  referenceStyleContext?: string | null;
  referenceAuthority?: boolean;
  referenceMatch?: ReferenceMatchResolution | null;
  identityManifest?: ProductIdentityManifest | null;
  apparelArtworkIdentity?: { data: Buffer; mimeType: string; containsText: boolean; side: "front" | "back" | "unknown"; confidence: number } | null;
  apparelArtworkEvidence?: FidelityValidationBrief["apparelArtworkEvidence"];
  exactProductApparel?: boolean;
  preset?: FidelityValidationBrief["preset"];
  variationHistory?: FidelityValidationBrief["variationHistory"];
};

export type FidelityValidationClient = {
  validate(input: FidelityValidationInput, brief: FidelityValidationBrief): Promise<unknown>;
};
