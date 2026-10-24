import "server-only";

import { NextResponse } from "next/server";

import { isImageGenerationWorkerEnabled, runImageGenerationBatch } from "@/lib/generation/image-scheduler";
import { runQueuedImageGeneration } from "@/lib/generation/image-worker-service";
import { isAuthorizedVideoSchedulerRequest } from "@/lib/video-generation/scheduler-auth";

export async function handleImageWorkerRequest(request: Request, expectedSecret: string | undefined) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({ error: "use_selected_local_image_worker" }, { status: 409 });
  }
  if (!isAuthorizedVideoSchedulerRequest(request.headers.get("authorization"), expectedSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isImageGenerationWorkerEnabled()) {
    return NextResponse.json({ error: "worker_disabled" }, { status: 503 });
  }
  try {
    const result = await runImageGenerationBatch(runQueuedImageGeneration);
    console.info("[image-worker] batch_complete", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[image-worker] batch_failed", { reason: error instanceof Error ? error.name : "worker_error" });
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}
