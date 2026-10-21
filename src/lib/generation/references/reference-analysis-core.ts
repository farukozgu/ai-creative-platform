import type { ReferenceStyleBrief } from "./reference-style-brief";
import { isReferenceStyleBrief } from "./reference-style-brief";
import type { OpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";
import { getOpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";

export type ReferenceAnalysisImage = {
  data: Buffer;
  mimeType: string;
};

export type ReferenceAnalysisClient = {
  createStyleBrief(images: ReferenceAnalysisImage[]): Promise<unknown>;
};

export type ReferenceAnalysisResult = {
  failure: unknown | null;
  styleBrief: ReferenceStyleBrief | null;
  usableCount: number;
  telemetry: OpenAIResponseTelemetry | null;
};

export async function analyzePreparedReferenceImages(
  images: ReferenceAnalysisImage[],
  client: ReferenceAnalysisClient,
): Promise<ReferenceAnalysisResult> {
  if (!images.length) return { failure: null, styleBrief: null, usableCount: 0, telemetry: null };
  try {
    const styleBrief = await client.createStyleBrief(images);
    return {
      failure: null,
      styleBrief: isReferenceStyleBrief(styleBrief) ? styleBrief : null,
      usableCount: images.length, telemetry: getOpenAIResponseTelemetry(styleBrief),
    };
  } catch (error) {
    return { failure: error, styleBrief: null, usableCount: images.length, telemetry: null };
  }
}
