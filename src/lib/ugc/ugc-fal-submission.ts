import "server-only";

import { createServerFalClient } from "@/lib/video-generation/fal-provider";
import { videoEndpointCapabilities } from "@/lib/video-generation/capabilities";
import type { UgcKlingVisualPlan } from "@/lib/ugc/ugc-request-planner";
import { ugcSeedanceRoute } from "@/lib/ugc/ugc-seedance-planner";
import type { UgcSeedanceVisualPlan, UgcMiniVisualPlan } from "@/lib/ugc/ugc-seedance-planner";
import { isUgcModelIdentity, ugcModelRegistry } from "@/lib/ugc/ugc-model-registry";
import { planUgcSeedanceAudio } from "@/lib/ugc/ugc-seedance-audio";

export type UgcKlingInput = {
  start_image_url: string; prompt: string; duration: "15"; generate_audio: false; enable_safety_checker: true;
  elements: Array<{ frontal_image_url: string; reference_image_urls: string[] }>;
};
export function buildUgcKlingInput(plan: UgcKlingVisualPlan, signedUrls: ReadonlyMap<string, string>): UgcKlingInput {
  const urlFor = (path: string) => {
    const value = signedUrls.get(path);
    if (!value || new URL(value).protocol !== "https:") throw new Error("UGC source unavailable.");
    return value;
  };
  return { start_image_url: urlFor(plan.startImage.objectPath), prompt: plan.prompt, duration: "15", generate_audio: false, enable_safety_checker: true,
    elements: plan.elements.map(element => ({ frontal_image_url: urlFor(element.frontal.objectPath), reference_image_urls: element.references.map(image => urlFor(image.objectPath)) })) };
}

/** Verification seam: requires an explicitly injected transport; never registered in production. */
export async function submitUgcKlingOnce(input: UgcKlingInput, dependencies: { fetch: typeof fetch; credentials: string }) {
  return submitUgcFalOnce(videoEndpointCapabilities.klingV3ProImage.endpointId, input, dependencies);
}

export type UgcSeedanceInput = {
  prompt: string; image_urls: string[]; duration: "15" | "30"; resolution: "720p";
  aspect_ratio: UgcSeedanceVisualPlan["aspectRatio"]; generate_audio: boolean; audio_urls?: string[];
  task?: "reference"; codec: "H264"; bitrate_mode?: "standard";
};
export type UgcFalInput = UgcKlingInput | UgcSeedanceInput;

export function buildUgcSeedanceInput(plan: UgcSeedanceVisualPlan | UgcMiniVisualPlan, signedUrls: ReadonlyMap<string, string>): UgcSeedanceInput {
  const model = plan.version === 3 ? ugcModelRegistry.standard : ugcModelRegistry.premium;
  if (plan.version !== model.planVersion || plan.provider !== model.identity.provider || plan.endpointId !== model.identity.endpointId
    || plan.modelId !== model.modelId || !(model.supported.durations as readonly number[]).includes(plan.durationSeconds)
    || (plan.model !== undefined && !isUgcModelIdentity(plan.model, model.identity.tier)) || (plan.version === 3 && !plan.model)
    || plan.resolution !== "720p" || plan.images.length !== 2 || !["9:16", "1:1", "16:9"].includes(plan.aspectRatio)
    || plan.brief.spokenDialogue.trim()) throw new Error("Unsupported UGC Seedance plan.");
  const audio = plan.audio ?? { mode: "silent", generateAudio: false, references: [] };
  // Revalidate metadata at the builder boundary; signed URLs never become snapshot inputs.
  const owner = plan.images[0].objectPath.split("/");
  const checkedAudio = planUgcSeedanceAudio({ id: "", ownerId: owner[0], projectId: owner[1] },
    { spokenDialogue: plan.brief.spokenDialogue, settings: { language: plan.brief.language } },
    { mode: audio.mode, references: audio.references });
  if (!checkedAudio.ok || audio.generateAudio !== checkedAudio.plan.generateAudio || plan.generateAudio !== audio.generateAudio) {
    throw new Error("Unsupported UGC Seedance audio plan.");
  }
  if (audio.mode === "reference" && (audio.references.length > model.documented.maxAudioReferences
    || audio.references.reduce((total, ref) => total + ref.durationSeconds, 0) > model.documented.maxAudioSeconds)) throw new Error("Unsupported UGC model audio references.");
  const urlFor = (objectPath: string) => {
    const value = signedUrls.get(objectPath);
    if (!value) throw new Error("UGC source unavailable.");
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Invalid UGC source URL.");
    return value;
  };
  const image_urls = plan.images.map(image => urlFor(image.objectPath));
  return { prompt: plan.prompt, image_urls, duration: plan.durationSeconds === 30 ? "30" : "15", resolution: "720p", aspect_ratio: plan.aspectRatio,
    generate_audio: audio.generateAudio,
    ...(audio.mode === "reference" ? { audio_urls: audio.references.map(ref => urlFor(ref.objectPath)) } : {}),
    ...(plan.version === 2 ? { task: "reference" as const, bitrate_mode: "standard" as const } : {}), codec: "H264" };
}

/** Verification only: no default credentials/fetch and no production call site. */
export function submitUgcSeedanceOnce(input: UgcSeedanceInput, dependencies: { fetch: typeof fetch; credentials: string }) {
  if (input.task !== "reference" || input.bitrate_mode !== "standard") throw new Error("UGC payload does not match Premium route.");
  return submitUgcFalOnce(ugcSeedanceRoute.endpointId, input, dependencies);
}

/** Mini preparation seam only; no caller/default network transport is registered. */
export function submitUgcMiniOnce(input: UgcSeedanceInput, dependencies: { fetch: typeof fetch; credentials: string }) {
  if (input.duration !== "15" || input.task !== undefined || input.bitrate_mode !== undefined) throw new Error("UGC payload does not match Standard route.");
  return submitUgcFalOnce(ugcModelRegistry.standard.identity.endpointId, input, dependencies);
}

async function submitUgcFalOnce(endpointId: string, input: UgcFalInput, dependencies: { fetch: typeof fetch; credentials: string }) {
  let sent = false;
  const client = createServerFalClient(dependencies.credentials, {
    fetch: async (url, init) => {
      if (sent) throw new Error("UGC duplicate HTTP submission blocked.");
      sent = true; // Set before awaiting: timeout/network failure can still mean provider acceptance.
      try {
        const parsed = new URL(String(url));
        if (parsed.origin !== "https://queue.fal.run" || parsed.pathname !== `/${endpointId}` || parsed.search || init?.method !== "POST") throw new Error("Unexpected UGC transport request.");
        return await dependencies.fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) });
      } catch {
        // Strip retryable SDK/network error metadata. The latch is a second independent guard.
        throw new Error("UGC provider submission outcome is uncertain.");
      }
    },
    responseHandler: async response => {
      if (!response.ok) throw new Error("UGC provider submission outcome is uncertain.");
      try { return await response.json() as unknown; } catch { throw new Error("Invalid UGC submission response."); }
    },
  });
  const response = await client.queue.submit(endpointId, {
    input, priority: "normal", storageSettings: { expiresIn: "1h" },
  });
  if (typeof response.request_id !== "string" || !/^[a-zA-Z0-9_-]{1,255}$/.test(response.request_id)) throw new Error("Invalid UGC provider task ID.");
  return response.request_id;
}
