import "server-only";

import OpenAI from "openai";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { createOpenAIBetaFetch } from "./beta-transport";
import { reserveOpenAIBetaRequest } from "./beta-budget";
import { getVideoStudioOpenAIPolicy } from "./beta-policy";

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to create the OpenAI client on the server.");
  }

  return new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0,
    fetch: createOpenAIBetaFetch({ authenticate: getAuthenticatedUserId, reserve: reserveOpenAIBetaRequest,
      send: fetch, env: process.env }),
  });
}

/** Video Studio analysis client: existing Studio authorization plus the shared atomic OpenAI analysis budget. */
export function getOpenAIVideoStudioAnalysisClient(model: string, purpose?: "director" | "director-chat") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to create the Video Studio analysis client on the server.");
  return new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0,
    fetch: createOpenAIBetaFetch({ authenticate: getAuthenticatedUserId, reserve: reserveOpenAIBetaRequest,
      policyForUser: (userId, env) => getVideoStudioOpenAIPolicy(userId, model, env),
      analysisMaxOutputTokens: purpose === "director" || purpose === "director-chat" ? 4000 : 2200,
      allowDirectorChat: purpose === "director-chat", send: fetch, env: process.env }),
  });
}
