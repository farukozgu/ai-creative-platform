import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import { readOwnedVideoFidelityMedia } from "@/lib/video-fidelity/private-media";
import { prepareVideoFidelitySourcePreview } from "@/lib/video-fidelity/prepare-input";
import { fidelityPreviewData, prepareOwnedVideoFidelity } from "@/lib/video-fidelity/prepare-owned";
import { readOwnedVideoReview, resumeOwnedVideoReview } from "@/lib/video-fidelity/reviews";
import { quoteVideoFidelity } from "@/lib/video-fidelity/pricing";
import { getVideoFidelityAnalysisAvailability } from "@/lib/video-fidelity/availability";

export const runtime = "nodejs";
export const maxDuration = 90;
type RouteContext = { params: Promise<{ videoId: string }> };
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, context: RouteContext) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  const { videoId } = await context.params;
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, videoId);
  if (!job) return NextResponse.json({ status: "unavailable" }, { status: 404 });
  const kind = new URL(request.url).searchParams.get("kind");
  try {
    if (kind === "review") return NextResponse.json({ status: "success", review: await readOwnedVideoReview(ownerId, videoId) }, { headers: privateHeaders });
    if (kind === "frames") return NextResponse.json({ status: "success", ...fidelityPreviewData(await prepareOwnedVideoFidelity(ownerId, videoId)) }, { headers: privateHeaders });
    if (kind !== "source" && kind !== "video") return NextResponse.json({ status: "invalid" }, { status: 400 });
    const media = await readOwnedVideoFidelityMedia(ownerId, videoId, kind);
    if (!media) return NextResponse.json({ status: "unavailable" }, { status: 404 });
    const responseMedia = kind === "source" ? await prepareVideoFidelitySourcePreview({ data: media.bytes, mimeType: media.mimeType }) : media;
    if (!responseMedia) return NextResponse.json({ status: "unavailable" }, { status: 422 });
    const bytes = "data" in responseMedia ? responseMedia.data : responseMedia.bytes;
    return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": responseMedia.mimeType, "Content-Length": String(bytes.length) } });
  } catch { return NextResponse.json({ status: "unavailable" }, { status: 503, headers: privateHeaders }); }
}

export async function POST(request: Request, context: RouteContext) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return NextResponse.json({ status: "invalid_origin" }, { status: 403 });
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  const { videoId } = await context.params;
  const job = await new SupabaseVideoJobRepository().findOwned(ownerId, videoId);
  if (!job || job.status !== "succeeded" || job.provider !== "fal") return NextResponse.json({ status: "unavailable" }, { status: 404 });
  if (!request.body) return NextResponse.json({ status: "invalid" }, { status: 400 });
  const reader = request.body.getReader(); let bytes = 0; const parts: Uint8Array[] = [];
  while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 4096) { await reader.cancel(); return NextResponse.json({ status: "invalid" }, { status: 413 }); } parts.push(item.value); }
  let body: Record<string, unknown>;
  try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); }
  catch { return NextResponse.json({ status: "invalid" }, { status: 400 }); }
  const quote = quoteVideoFidelity(Boolean(job.preservation?.criticalRegion));
  if (!getVideoFidelityAnalysisAvailability(ownerId, Boolean(job.preservation?.criticalRegion)).enabled) return NextResponse.json({ status: "disabled" }, { status: 409 });
  const automatic = body.resume === true && Boolean(job.preservation?.analysisConsent);
  if (!automatic && body.request !== true) return NextResponse.json({ status: "invalid" }, { status: 400 });
  if (!quote) return NextResponse.json({ status: "disabled" }, { status: 409 });
  try {
    const review = await resumeOwnedVideoReview(ownerId, videoId, automatic ? undefined : { model: quote.model, maximumCostUsd: quote.maximumEstimatedCostUsd, pricingVersion: quote.pricingVersion }, body.locale === "en" ? "en" : "tr");
    return NextResponse.json({ status: review?.status === "succeeded" ? "success" : review?.status ?? "uncertain", report: review?.report ?? null }, { headers: privateHeaders });
  } catch { return NextResponse.json({ status: "uncertain" }, { status: 502, headers: privateHeaders }); }
}
