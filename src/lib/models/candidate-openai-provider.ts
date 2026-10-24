import "server-only";

import { getOpenAIClient } from "@/lib/openai/client";
import type { CandidateProvider } from "./candidate-engine";

// Independent text-to-image adapter: Composer's product edit pipeline is untouched.
export const candidateOpenAIProvider: CandidateProvider = {
  async generate(request) {
    const response = await getOpenAIClient().images.generate({
      model: request.model,
      prompt: request.prompt,
      n: 1,
      size: "1024x1280",
      quality: request.quality,
      output_format: "png",
    }, { timeout: 240_000, maxRetries: 0 });
    if (response.data?.length !== 1 || !response.data[0].b64_json) {
      throw new Error("Candidate provider returned no single image.");
    }
    return {
      imageData: Buffer.from(response.data[0].b64_json, "base64"),
      mimeType: "image/png",
      providerRequestId: response._request_id ?? null,
      usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } : undefined,
    };
  },
};
