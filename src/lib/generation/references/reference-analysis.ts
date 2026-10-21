import "server-only";

import sharp from "sharp";

import { getOpenAIClient } from "@/lib/openai/client";
import {
  structuredResponseText,
} from "@/lib/openai/structured-response";
import { getOpenAIDiagnostic, type OpenAIDiagnostic } from "@/lib/openai/response-diagnostics";
import { attachOpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";

import { REFERENCE_ANALYSIS_VERSION } from "./reference-style-brief";
import { REFERENCE_MATCH_VERSION } from "./reference-shot-profile";
import {
  analyzePreparedReferenceImages,
  type ReferenceAnalysisClient,
  type ReferenceAnalysisImage,
  type ReferenceAnalysisResult,
} from "./reference-analysis-core";
import { createReferenceAnalysisInput } from "./reference-analysis-input";

export type { ReferenceAnalysisClient, ReferenceAnalysisImage, ReferenceAnalysisResult } from "./reference-analysis-core";

export type ReferenceAnalysisFailure = OpenAIDiagnostic & {
  stage: "image_prepare" | "openai_request" | "structured_parse" | "structured_validation";
};

export type ReferenceAnalysisResponse = Omit<ReferenceAnalysisResult, "failure"> & {
  diagnostic: ReferenceAnalysisFailure | null;
};

const referenceStyleBriefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["visualIntent", "composition", "lighting", "environment", "color", "texture", "depthOfField", "poseLanguage", "realismCharacter", "shotProfile"],
  properties: {
    visualIntent: { type: "string" },
    composition: { type: "object", additionalProperties: false, required: ["framing", "cameraAngle", "cameraDistance", "subjectPlacement"], properties: { framing: { type: "string" }, cameraAngle: { type: "string" }, cameraDistance: { type: "string" }, subjectPlacement: { type: "string" } } },
    lighting: { type: "object", additionalProperties: false, required: ["character", "direction", "flashBehavior", "ambientExposure", "contrast"], properties: { character: { type: "string" }, direction: { type: "string" }, flashBehavior: { type: ["string", "null"] }, ambientExposure: { type: "string" }, contrast: { type: "string" } } },
    environment: { type: "object", additionalProperties: false, required: ["setting", "architecturalCharacter", "surfaceCharacter"], properties: { setting: { type: "string" }, architecturalCharacter: { type: ["string", "null"] }, surfaceCharacter: { type: ["string", "null"] } } },
    color: { type: "object", additionalProperties: false, required: ["palette", "grading", "saturation"], properties: { palette: { type: "string" }, grading: { type: "string" }, saturation: { type: "string" } } },
    texture: { type: "object", additionalProperties: false, required: ["grain", "sharpness", "retouching"], properties: { grain: { type: "string" }, sharpness: { type: "string" }, retouching: { type: "string" } } },
    depthOfField: { type: "string" }, poseLanguage: { type: ["string", "null"] }, realismCharacter: { type: "string" },
    shotProfile: { type: "object", additionalProperties: false, required: ["framing", "cameraAngle", "cameraDistance", "subjectPlacement", "productScale", "interaction", "humanPose", "handDirection", "lighting", "background", "environment", "surfaces", "props", "depthOfField", "negativeSpace", "realism", "compositionNotes", "nonTransferableIdentityFeatures"], properties: {
      framing: { type: ["string", "null"] }, cameraAngle: { type: ["string", "null"] }, cameraDistance: { type: ["string", "null"] }, subjectPlacement: { type: ["string", "null"] }, productScale: { type: ["string", "null"] }, interaction: { type: ["string", "null"] }, humanPose: { type: ["string", "null"] }, handDirection: { type: ["string", "null"] }, lighting: { type: ["string", "null"] }, background: { type: ["string", "null"] }, environment: { type: ["string", "null"] }, surfaces: { type: ["string", "null"] }, props: { type: ["string", "null"] }, depthOfField: { type: ["string", "null"] }, negativeSpace: { type: ["string", "null"] }, realism: { type: ["string", "null"] }, compositionNotes: { type: ["string", "null"] }, nonTransferableIdentityFeatures: { type: "array", items: { type: "string" } },
    } },
  },
} as const;

const referenceAnalysisInstructions = [
  "Analyze supplied images only as photographic visual-direction references and return one concise combined style brief.",
  "Describe how the images are photographed and styled: composition, framing, camera, lighting, environment, color, texture, pose language, and realism.",
  "Do not identify people or preserve identities. Do not use reference products, garment designs, logos, text, trademarks, artwork, exact hairstyles, or exact compositions as generation requirements.",
  "Populate shotProfile with transferable scene structure only. Explicitly list reference product logos, brand names, labels, conflicting colors, geometry, stone layout, watch dial, shoe panels, garment artwork, and packaging identity in nonTransferableIdentityFeatures.",
  "References have deterministic roles: image 1 is primary composition, image 2 may refine lighting/environment, and image 3 may refine texture/mood. Do not average conflicting compositions.",
  `Analysis contract: ${REFERENCE_MATCH_VERSION}; return an original campaign direction, not an image to copy.`,
].join("\n");

export { createReferenceAnalysisInput } from "./reference-analysis-input";

export function getReferenceAnalysisModel() {
  return process.env.OPENAI_REFERENCE_ANALYSIS_MODEL?.trim()
    || process.env.OPENAI_PROMPT_ENHANCEMENT_MODEL?.trim()
    || "gpt-4o-mini";
}

export async function prepareReferenceAnalysisImage(image: ReferenceAnalysisImage): Promise<ReferenceAnalysisImage | null> {
  try {
    const metadata = await sharp(image.data, { limitInputPixels: 50_000_000 }).metadata();
    if (!metadata.width || !metadata.height) return null;
    const data = await sharp(image.data, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { data, mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

class OpenAIReferenceAnalysisClient implements ReferenceAnalysisClient {
  async createStyleBrief(images: ReferenceAnalysisImage[]): Promise<unknown> {
    let response;
    try {
      response = await getOpenAIClient().responses.create({
        model: getReferenceAnalysisModel(),
        instructions: referenceAnalysisInstructions,
        input: createReferenceAnalysisInput(images),
        max_output_tokens: 700,
        store: false,
        text: structuredResponseText({
          type: "json_schema",
          name: "reference_style_brief_v2",
          description: "Combined photographic visual direction.",
          schema: referenceStyleBriefSchema,
          strict: true,
        }),
      });
    } catch (error) {
      throw new ReferenceAnalysisRequestError("openai_request", error);
    }

    const outputText = response.output_text?.trim();
    if (!outputText) throw new ReferenceAnalysisRequestError("structured_parse", null);
    try {
    return attachOpenAIResponseTelemetry(JSON.parse(outputText) as Record<string, unknown>, response);
    } catch (error) {
      throw new ReferenceAnalysisRequestError("structured_parse", error);
    }
  }
}

class ReferenceAnalysisRequestError extends Error {
  constructor(
    readonly stage: "openai_request" | "structured_parse",
    readonly source: unknown,
  ) {
    super("Reference analysis failed.");
  }
}

export async function analyzeReferenceImages(
  images: ReferenceAnalysisImage[],
  client: ReferenceAnalysisClient = new OpenAIReferenceAnalysisClient(),
): Promise<ReferenceAnalysisResponse> {
  const prepared = (await Promise.all(images.map(prepareReferenceAnalysisImage))).filter(
    (image): image is ReferenceAnalysisImage => image !== null,
  );
  if (!prepared.length) {
    return {
      diagnostic: { ...getOpenAIDiagnostic(null), stage: "image_prepare" },
      styleBrief: null,
      usableCount: 0, telemetry: null,
    };
  }

  const result = await analyzePreparedReferenceImages(prepared, client);
  if (result.styleBrief) {
    return { diagnostic: null, styleBrief: result.styleBrief, usableCount: result.usableCount, telemetry: result.telemetry };
  }

  const requestFailure = result.failure instanceof ReferenceAnalysisRequestError
    ? result.failure
    : null;
  const diagnostic = getOpenAIDiagnostic(requestFailure?.source ?? result.failure);
  return {
    diagnostic: {
      ...diagnostic,
      stage: requestFailure?.stage ?? (result.failure ? "structured_parse" : "structured_validation"),
    },
    styleBrief: null,
    usableCount: result.usableCount,
    telemetry: result.telemetry,
  };
}

export { REFERENCE_ANALYSIS_VERSION };
