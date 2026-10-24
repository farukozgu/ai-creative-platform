import "server-only";

import { createServerFalClient } from "@/lib/video-generation/fal-provider";
import { videoEndpointCapabilities } from "@/lib/video-generation/capabilities";
import type { UgcVisualPlan } from "@/lib/ugc/ugc-request-planner";

export type UgcKlingInput = {
  start_image_url: string; prompt: string; duration: "15"; generate_audio: false; enable_safety_checker: true;
  elements: Array<{ frontal_image_url: string; reference_image_urls: string[] }>;
};
export function buildUgcKlingInput(plan: UgcVisualPlan, signedUrls: ReadonlyMap<string, string>): UgcKlingInput {
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
  let sent = false;
  const client = createServerFalClient(dependencies.credentials, {
    fetch: async (url, init) => {
      if (sent) throw new Error("UGC duplicate HTTP submission blocked.");
      sent = true; // Set before awaiting: timeout/network failure can still mean provider acceptance.
      try {
        const parsed = new URL(String(url));
        if (parsed.origin !== "https://queue.fal.run" || init?.method !== "POST") throw new Error("Unexpected UGC transport request.");
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
  const response = await client.queue.submit(videoEndpointCapabilities.klingV3ProImage.endpointId, {
    input, priority: "normal", storageSettings: { expiresIn: "1h" },
  });
  if (typeof response.request_id !== "string" || !/^[a-zA-Z0-9_-]{1,255}$/.test(response.request_id)) throw new Error("Invalid UGC provider task ID.");
  return response.request_id;
}
