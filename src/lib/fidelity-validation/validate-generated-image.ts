import "server-only";

import { getOpenAIClient } from "@/lib/openai/client";
import { attachOpenAIResponseTelemetry, getOpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";
import { structuredResponseText } from "@/lib/openai/structured-response";
import { getReferenceAnalysisModel } from "@/lib/generation/references/reference-analysis";
import { buildValidationBrief, renderValidationInstructions } from "./build-validation-brief";
import { mapStructuredValidationOutput, resolveQualityGate, suppressReferenceAuthorityPresetIssues, suppressUnsupportedApparelArtworkIssues } from "./resolve-quality-gate";
import { FIDELITY_VALIDATION_VERSION } from "./validation-version";
import type { FidelityValidationClient, FidelityValidationInput, FidelityValidationResult } from "./types";
import { fidelityValidationCategories } from "./types";

const validationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "category", "severity", "confidence", "identityImpact", "likelyCause", "region", "repairable", "commercialImpact", "finding", "expected"],
        properties: {
          code: { type: "string" },
          category: { type: "string", enum: fidelityValidationCategories },
          severity: { type: "string", enum: ["critical", "major", "minor"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          identityImpact: { type: "string", enum: ["none", "minor", "major", "critical"] },
          likelyCause: { type: "string", enum: ["source_identity_drift", "perspective", "fabric_deformation", "lighting", "body_interaction", "typography_change", "geometry_change", "unknown"] },
          region: { type: "string" },
          repairable: { type: "boolean" },
          commercialImpact: { type: "string", enum: ["none", "low", "medium", "high"] },
          presetMismatchFields: { type: "array", items: { type: "string" } },
          finding: { type: "string" },
          expected: { type: "string" },
        },
      },
    },
  },
} as const;

export function getFidelityValidationModel(): string {
  return process.env.OPENAI_FIDELITY_VALIDATION_MODEL?.trim() || getReferenceAnalysisModel();
}

function imageInput(data: Buffer, mimeType: string) {
  return { type: "input_image" as const, image_url: `data:${mimeType};base64,${data.toString("base64")}`, detail: "high" as const };
}

class OpenAIFidelityValidationClient implements FidelityValidationClient {
  async validate(input: FidelityValidationInput, brief: ReturnType<typeof buildValidationBrief>): Promise<unknown> {
    const supportingProducts = input.supportingProducts ?? [];
    const productCount = 1 + supportingProducts.length;
    const outputIndex = productCount + (input.apparelArtworkIdentity ? 1 : 0) + (input.referenceBaseScene ? 1 : 0) + 1;
    const response = await getOpenAIClient().responses.create({
      model: getFidelityValidationModel(),
      instructions: renderValidationInstructions(brief),
      input: [{ role: "user", content: [
        { type: "input_text", text: `Images 1-${productCount} show the same physical product from different viewpoints. Treat them collectively as identity evidence for one single product; Image 1 is primary and later product images are supporting authority. Do not interpret them as separate products. Image ${outputIndex} is the generated output.${input.referenceBaseScene ? " The image immediately before the output is scene authority only." : ""} Identify only material deviations under the supplied validation policy.` },
        imageInput(input.originalProduct, input.originalMimeType),
        ...supportingProducts.map((product) => imageInput(product.data, product.mimeType)),
        ...(input.apparelArtworkIdentity ? [imageInput(input.apparelArtworkIdentity.data, input.apparelArtworkIdentity.mimeType)] : []),
        ...(input.referenceBaseScene ? [imageInput(input.referenceBaseScene, input.referenceBaseSceneMimeType ?? "image/png")] : []),
        imageInput(input.generatedImage, input.generatedMimeType),
      ] }],
      max_output_tokens: 1800,
      store: false,
      text: structuredResponseText({
        type: "json_schema",
        name: "fidelity_validation",
        description: "Structured calibrated fidelity findings with confidence, identity impact, likely cause, and product usability context.",
        schema: validationSchema,
        strict: true,
      }),
    });
    const output = response.output_text?.trim();
    if (!output) throw new Error("Fidelity validation returned no structured output.");
    return attachOpenAIResponseTelemetry(JSON.parse(output) as Record<string, unknown>, response);
  }
}

export async function validateGeneratedImage(input: FidelityValidationInput, client: FidelityValidationClient = new OpenAIFidelityValidationClient()): Promise<FidelityValidationResult> {
  const brief = buildValidationBrief({ ...input, productImageCount: 1 + (input.supportingProducts?.length ?? 0), referencePreservation: input.referenceAuthority === true || Boolean(input.referenceBaseScene || input.referenceMatch), apparelArtworkIdentity: input.apparelArtworkIdentity ? { available: true, containsText: input.apparelArtworkIdentity.containsText, side: input.apparelArtworkIdentity.side, confidence: input.apparelArtworkIdentity.confidence } : null });
  const normalize = (value: unknown) => suppressReferenceAuthorityPresetIssues(suppressUnsupportedApparelArtworkIssues(mapStructuredValidationOutput(value).filter((issue) => {
    if (!brief.humanRealism?.applied && issue.category === "human_realism") return false;
    if (!brief.apparelFit?.active && issue.category === "apparel_fit") return false;
    return true;
  }), brief.apparelArtworkEvidence?.artworkPresent), brief.presetOverrideReason === "reference_authority" && !brief.preset?.strictProductOnlyStudio, brief.preset?.referenceOverriddenFields ?? []);
  if (input.exactProductApparel && input.apparelArtworkIdentity) {
    const result = await client.validate(input, brief);
    const raw = normalize(result);
    const gate = resolveQualityGate(raw);
    return { ...gate, version: FIDELITY_VALIDATION_VERSION, telemetry: getOpenAIResponseTelemetry(result) };
  }
  const raw = await client.validate(input, brief);
  const result = resolveQualityGate(normalize(raw));
  return { ...result, version: FIDELITY_VALIDATION_VERSION, telemetry: getOpenAIResponseTelemetry(raw) };
}

export async function validateGeneratedImageBestEffort(input: FidelityValidationInput): Promise<FidelityValidationResult> {
  try {
    return await validateGeneratedImage(input);
  } catch {
    return {
      status: "validation_unavailable",
      checks: [],
      issues: [],
      severity: null,
      retryRecommended: false,
      commerciallyUsable: null,
      summary: "Semantic fidelity validation was unavailable; generation remains accessible and was not marked as passed.",
      version: FIDELITY_VALIDATION_VERSION,
      telemetry: null,
    };
  }
}
