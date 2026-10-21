import { NextResponse } from "next/server";

import { isAuthorizedVideoSchedulerRequest } from "@/lib/video-generation/scheduler-auth";
import { isVideoReconciliationSchedulerEnabled } from "@/lib/video-generation/scheduler";

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
  // No configured production billing policy exists yet. Do not claim jobs or
  // contact fal.ai until one is explicitly installed and reviewed.
  return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
}
