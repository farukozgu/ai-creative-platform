import "server-only";
import sharp from "sharp";
import { getOpenAIVideoStudioAnalysisClient } from "@/lib/openai/client";
import { attachOpenAIResponseTelemetry } from "@/lib/openai/response-telemetry";
import { getPromptEnhancementModel } from "@/lib/generation/prompts/prompt-enhancer-config";
import { directorPlanDescriptions, type VideoDirectorInput } from "./core";
import { buildDirectorRequest } from "./openai-director";
import { directorShotContract, DirectorStructuredOutputError } from "./plan-contract";

/** Offline-testable alternative; deliberately not connected to the production Director. */
export async function createChatVideoPlan(input: VideoDirectorInput, source: Buffer) {
  const { context, schema, instructions, intentContract } = buildDirectorRequest(input);
  const prepare = async (bytes: Buffer) => sharp(bytes, { limitInputPixels: 40_000_000 })
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const refs = input.referenceImages ?? [];
  if (refs.length !== (input.draft.productReferences?.length ?? 0)) throw new Error("Missing reference pixels.");
  const images = await Promise.all([source, ...refs.map(ref => ref.prepared)].map(prepare));
  const model = getPromptEnhancementModel();
  const response = await getOpenAIVideoStudioAnalysisClient(model, "director-chat").chat.completions.create({
    model, store: false,
    max_completion_tokens: input.shotMode === "multi" && (input.draft.durationSeconds === 10
      || directorShotContract(input.shotMode, input.draft.durationSeconds, input.presetId).maxShots > 3) ? 4000 : 2200,
    messages: [{ role: "system", content: instructions }, { role: "user", content: [
      { type: "text", text: context }, ...images.map(image => ({ type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "low" as const } })),
    ] }],
    response_format: { type: "json_schema", json_schema: { name: "video_director_plan", strict: true, schema } },
  }, { timeout: 30000 });
  const choice = response.choices[0];
  if (choice?.message.refusal) throw new DirectorStructuredOutputError("structured_output_refusal");
  if (choice?.finish_reason !== "stop") throw new DirectorStructuredOutputError(choice?.finish_reason === "length"
    ? "incomplete_max_output_tokens" : choice?.finish_reason === "content_filter" ? "incomplete_content_filter" : "incomplete_structured_output");
  const text = choice.message.content?.trim();
  if (!text) throw new DirectorStructuredOutputError("empty_structured_output");
  let plan: unknown;
  try { plan = JSON.parse(text); } catch { throw new DirectorStructuredOutputError("invalid_structured_output"); }
  if (!plan || typeof plan !== "object" || Array.isArray(plan) || ["intentContract", "summary", "intent"].some(key => Object.hasOwn(plan, key)) || !("shots" in plan) || !Array.isArray(plan.shots)) {
    throw new DirectorStructuredOutputError("invalid_structured_output");
  }
  return attachOpenAIResponseTelemetry({ ...plan, ...directorPlanDescriptions(input, plan.shots.length), intentContract }, {
    _request_id: response._request_id,
    usage: response.usage ? { input_tokens: response.usage.prompt_tokens, output_tokens: response.usage.completion_tokens,
      input_tokens_details: { cached_tokens: response.usage.prompt_tokens_details?.cached_tokens } } : undefined,
  });
}
