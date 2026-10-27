import { NextResponse } from "next/server";

import { isAuthorizedVideoSchedulerRequest } from "@/lib/video-generation/scheduler-auth";
import { isVideoReconciliationSchedulerEnabled } from "@/lib/video-generation/scheduler";
import { reconcileVideoBeta } from "@/lib/video-generation/beta-runtime";
import { canAccessVideoBeta } from "@/lib/video-generation/beta-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * Deployment invokes this endpoint with a server-held Bearer secret. It remains
 * disabled until an approved, atomic video billing policy is installed.
 */
export async function POST(request: Request) {
  if (!isAuthorizedVideoSchedulerRequest(request.headers.get("authorization"), process.env.VIDEO_RECONCILIATION_CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isVideoReconciliationSchedulerEnabled()) {
    return NextResponse.json({ error: "scheduler_disabled" }, { status: 503 });
  }
  const owner = process.env.VIDEO_BETA_USER_IDS?.trim() ?? "";
  if (!canAccessVideoBeta(owner)) return NextResponse.json({ error: "beta_disabled" }, { status: 503 });
  try { return NextResponse.json({ claimed: await reconcileVideoBeta(owner, null, 5) }); }
  catch { return NextResponse.json({ error: "reconciliation_unavailable" }, { status: 503 }); }
}
