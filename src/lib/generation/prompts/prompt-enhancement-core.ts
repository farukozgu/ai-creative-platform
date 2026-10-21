import type { ProductPreservationMode } from "../types";
import {
  renderReferenceStyleBrief,
  type ReferenceStyleBrief,
} from "../references/reference-style-brief";
import {
  isCreativeBrief,
  renderCreativeBrief,
  type CreativeBrief,
} from "./creative-brief";
import type { OpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";
import { getOpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";

export type { CreativeBrief } from "./creative-brief";

export type PromptEnhancementInput = {
  enabled: boolean;
  generationType: "image" | "video";
  preservationMode: ProductPreservationMode;
  productCategory?: string | null;
  presetId?: string | null;
  presetTitle?: string | null;
  presetDescription?: string | null;
  presetCreativeDirection?: CreativeBrief | null;
  referenceStyle?: ReferenceStyleBrief | null;
  useCase?: string | null;
  generationMode?: "image" | "video" | null;
  userCreativeDirection: string;
};

export type PromptEnhancementResult = {
  enhancedPrompt: string | null;
  prompt: string;
  succeeded: boolean;
  userPrompt: string;
  telemetry?: OpenAIResponseTelemetry | null;
};

export type PromptEnhancementClient = {
  createCreativeBrief(input: PromptEnhancementInput): Promise<unknown>;
};

export const renderEnhancedCreativePrompt = renderCreativeBrief;

function preserveFashionCaptureProfile(
  input: PromptEnhancementInput,
  brief: CreativeBrief,
): CreativeBrief {
  if (input.useCase !== "apparel" || !input.presetCreativeDirection?.capture) {
    return brief;
  }

  return { ...brief, capture: input.presetCreativeDirection.capture };
}

export async function enhanceCreativeDirectionWithClient(
  input: PromptEnhancementInput,
  client: PromptEnhancementClient,
): Promise<PromptEnhancementResult> {
  const userPrompt = input.userCreativeDirection.trim();
  const presetDirection = input.presetCreativeDirection
    ? renderCreativeBrief(input.presetCreativeDirection)
    : "";
  const referenceDirection = input.referenceStyle
    ? renderReferenceStyleBrief(input.referenceStyle)
    : "";
  const rawPrompt = [
    presetDirection,
    referenceDirection,
    userPrompt
      ? input.presetCreativeDirection || input.referenceStyle
        ? `User customization (highest creative priority): Apply this request to the relevant creative fields while preserving compatible preset defaults and reference photographic direction: ${userPrompt}`
        : userPrompt
      : "",
  ].filter(Boolean).join("\n\n");

  if (!input.enabled || !rawPrompt) {
    return { enhancedPrompt: null, prompt: rawPrompt, succeeded: false, userPrompt, telemetry: null };
  }

  try {
    const brief = await client.createCreativeBrief({ ...input, userCreativeDirection: userPrompt });
    if (!isCreativeBrief(brief)) {
      return { enhancedPrompt: null, prompt: rawPrompt, succeeded: false, userPrompt, telemetry: getOpenAIResponseTelemetry(brief) };
    }

    const enhancedPrompt = renderEnhancedCreativePrompt(
      preserveFashionCaptureProfile(input, brief),
    ).trim();
    if (!enhancedPrompt) {
      return { enhancedPrompt: null, prompt: rawPrompt, succeeded: false, userPrompt, telemetry: getOpenAIResponseTelemetry(brief) };
    }

    return { enhancedPrompt, prompt: enhancedPrompt, succeeded: true, userPrompt, telemetry: getOpenAIResponseTelemetry(brief) };
  } catch {
    return { enhancedPrompt: null, prompt: rawPrompt, succeeded: false, userPrompt, telemetry: null };
  }
}
