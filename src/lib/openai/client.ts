import "server-only";

import OpenAI from "openai";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { createOpenAIBetaFetch } from "./beta-transport";
import { reserveOpenAIBetaRequest } from "./beta-budget";

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
