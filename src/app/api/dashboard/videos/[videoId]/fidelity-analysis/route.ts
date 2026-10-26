import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import { analyzeVideoFidelity } from "@/lib/video-fidelity/analyze-video";
import { getVideoFidelityAnalysisAvailability, VIDEO_FIDELITY_ESTIMATED_MAX_COST_USD } from "@/lib/video-fidelity/availability";
import { readOwnedVideoFidelityMedia } from "@/lib/video-fidelity/private-media";
import { prepareVideoFidelityRequest, prepareVideoFidelitySourcePreview, VIDEO_FIDELITY_MAX_REQUEST_BYTES } from "@/lib/video-fidelity/prepare-input";
import { sampleVideoFrameTimestamps } from "@/lib/video-fidelity/sampling";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ videoId: string }> };

async function readBoundedJson(request: Request): Promise<unknown | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > VIDEO_FIDELITY_MAX_REQUEST_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > VIDEO_FIDELITY_MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isSameOriginJsonMutation(request: Request) {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!origin || contentType !== "application/json") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function GET(request: Request, context: RouteContext) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  const { videoId } = await context.params;
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "source" && kind !== "video") return NextResponse.json({ status: "invalid" }, { status: 400 });
  try {
    const media = await readOwnedVideoFidelityMedia(ownerId, videoId, kind);
    if (!media) return NextResponse.json({ status: "unavailable" }, { status: 404 });
    const responseMedia = kind === "source"
      ? await prepareVideoFidelitySourcePreview({ data: media.bytes, mimeType: media.mimeType })
      : media;
    if (!responseMedia) return NextResponse.json({ status: "unavailable" }, { status: 422 });
    const responseBytes = "data" in responseMedia ? responseMedia.data : responseMedia.bytes;
    return new Response(new Uint8Array(responseBytes), {
      status: 200,
      headers: {
        "Content-Type": responseMedia.mimeType,
        "Content-Length": String(responseBytes.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOriginJsonMutation(request)) return NextResponse.json({ status: "invalid_origin" }, { status: 403 });
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  const { videoId } = await context.params;
  const repository = new SupabaseVideoJobRepository();
  const job = await repository.findOwned(ownerId, videoId);
  if (!job || job.status !== "succeeded" || job.mode !== "image" || !job.sourceId) {
    return NextResponse.json({ status: "unavailable" }, { status: 404 });
  }

  const availability = getVideoFidelityAnalysisAvailability(ownerId);
  if (!availability.enabled || availability.maximumEstimatedCostUsd !== VIDEO_FIDELITY_ESTIMATED_MAX_COST_USD) {
    return NextResponse.json({ status: "disabled" }, { status: 409 });
  }
  const body = await readBoundedJson(request);
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  if (!record || record.consent !== true || record.confirmedMaximumCostUsd !== VIDEO_FIDELITY_ESTIMATED_MAX_COST_USD) {
    return NextResponse.json({ status: "confirmation_required" }, { status: 400 });
  }

  const prepared = await prepareVideoFidelityRequest(record, job.durationSeconds);
  if (!prepared) return NextResponse.json({ status: "invalid_media" }, { status: 400 });
  if (sampleVideoFrameTimestamps(job.durationSeconds).length !== prepared.frames.length) {
    return NextResponse.json({ status: "invalid_media" }, { status: 400 });
  }

  try {
    const report = await analyzeVideoFidelity({
      jobId: job.id,
      sourceAssetId: job.sourceId,
      sourceImage: prepared.source.data,
      sourceMimeType: prepared.source.mimeType,
      frames: prepared.frames,
      durationSeconds: job.durationSeconds,
    });
    return NextResponse.json({ status: "success", report }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    // A timed-out provider response may have been billed. Never retry this request automatically.
    return NextResponse.json({ status: "uncertain" }, { status: 502 });
  }
}
