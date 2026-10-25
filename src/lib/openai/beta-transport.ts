import type { OpenAIBetaPolicy, OpenAIBudgetKind } from "./beta-policy";
import { getOpenAIBetaPolicy } from "./beta-policy";

export class OpenAIBetaAccessError extends Error {
  constructor() { super("OpenAI beta access or request budget unavailable."); this.name = "OpenAIBetaAccessError"; }
}

type Dependencies = {
  authenticate(): Promise<string | null>;
  reserve(userId: string, kind: OpenAIBudgetKind, limits: { user: number; global: number }): Promise<boolean>;
  send: typeof fetch;
  env: Record<string, string | undefined>;
};

const sizes = new Set(["1536x864", "864x1536", "1024x1024", "1536x1152", "1152x1536", "2688x1152", "1024x1280"]);
const imageKeys = new Set(["model", "prompt", "n", "size", "quality", "output_format", "input_fidelity"]);

function reject(): never { throw new OpenAIBetaAccessError(); }

function validateImage(fields: Record<string, unknown>, policy: OpenAIBetaPolicy) {
  if (Object.keys(fields).some(key => !imageKeys.has(key)) || fields.model !== policy.imageModel
    || String(fields.n) !== "1" || !sizes.has(String(fields.size)) || fields.output_format !== "png"
    || (fields.quality !== undefined && !["low", "medium", "high", "xhigh", "auto"].includes(String(fields.quality)))
    || typeof fields.prompt !== "string" || fields.prompt.length > 64_000 || !fields.prompt.trim()) reject();
}

function validateAnalysis(body: Record<string, unknown>, policy: OpenAIBetaPolicy) {
  const tokens = body.max_output_tokens ?? 2200;
  if (typeof body.model !== "string" || !policy.analysisModels.includes(body.model)
    || typeof tokens !== "number" || !Number.isSafeInteger(tokens) || tokens < 1 || tokens > 2200
    || body.background === true || body.stream === true || body.previous_response_id || body.conversation
    || (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length))) reject();
  let textLength = 0, images = 0;
  function inspect(value: unknown) {
    if (typeof value === "string") {
      if (value.startsWith("data:image/")) images++;
      else textLength += value.length;
    } else if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === "object") Object.values(value).forEach(inspect);
  }
  inspect(body.input);
  inspect(body.instructions);
  if (textLength > 64_000 || images > 10) reject();
  return { ...body, max_output_tokens: tokens, store: false };
}

/** One atomic quota reservation per actual HTTP attempt, before any provider I/O. */
export function createOpenAIBetaFetch(deps: Dependencies): typeof fetch {
  return async (input, init) => {
    // Installed OpenAI SDK checks FormData support using this inert local URL.
    if (input === "data:," && !init) return new Response("");
    if (input instanceof Request) reject();
    const url = new URL(String(input));
    if (url.origin !== "https://api.openai.com" || url.username || url.password || url.search
      || init?.method !== "POST" || !["/v1/images/edits", "/v1/images/generations", "/v1/responses"].includes(url.pathname)) reject();
    const userId = await deps.authenticate();
    const policy = getOpenAIBetaPolicy(userId, deps.env);
    if (!userId || !policy) reject();
    const kind: OpenAIBudgetKind = url.pathname === "/v1/responses" ? "analysis" : "image";
    let body = init.body;
    if (body instanceof FormData && url.pathname === "/v1/images/edits") {
      const fields: Record<string, unknown> = {};
      let files = 0, bytes = 0;
      for (const [key, value] of body.entries()) {
        if (typeof value === "string") {
          if (key in fields) reject();
          fields[key] = value;
        } else {
          if (!/^image(?:\[\d*\])?$/.test(key) || !["image/png", "image/jpeg", "image/webp"].includes(value.type)
            || value.size <= 0 || value.size > 20 * 1024 * 1024) reject();
          files++; bytes += value.size;
        }
      }
      if (!files || files > 10 || bytes > 100 * 1024 * 1024) reject();
      validateImage(fields, policy);
    } else if (typeof body === "string" && url.pathname !== "/v1/images/edits") {
      if (Buffer.byteLength(body) > 64 * 1024 * 1024) reject();
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) reject();
      const fields = parsed as Record<string, unknown>;
      if (kind === "image") validateImage(fields, policy);
      else body = JSON.stringify(validateAnalysis(fields, policy));
    } else reject();
    if (!policy.limits[kind].user || !policy.limits[kind].global
      || !await deps.reserve(userId, kind, policy.limits[kind])) reject();
    // Consumption is intentionally never refunded: timeout/error can mean provider acceptance.
    return deps.send(input, { ...init, body, redirect: "error" });
  };
}
