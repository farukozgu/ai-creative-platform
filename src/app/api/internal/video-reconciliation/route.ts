import { NextResponse } from "next/server";

import { isAuthorizedVideoSchedulerRequest } from "@/lib/video-generation/scheduler-auth";
import { isVideoReconciliationSchedulerEnabled } from "@/lib/video-generation/scheduler";
import { reconcileVideoBeta } from "@/lib/video-generation/beta-runtime";
import { canAccessVideoBeta } from "@/lib/video-generation/beta-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A single provider read/result/download can exceed the former 55s deadline.
// Lease fences and durable output recovery protect overlapping cron invocations.
export const maxDuration = 180;

/**
 * Deployment invokes this endpoint with a server-held Bearer secret. It remains
 * disabled until an approved, atomic video billing policy is installed.
 */
async function reconcile(request: Request, secret: string | undefined) {
  if (!isAuthorizedVideoSchedulerRequest(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isVideoReconciliationSchedulerEnabled()) {
    return NextResponse.json({ error: "scheduler_disabled" }, { status: 503 });
  }
  // Studio admission already checked each persisted job's owner, approval and
  // reservation. The authenticated worker only reconciles those existing jobs.
  const studio = process.env.VIDEO_STUDIO_ENABLED === "true";
  const owner = studio ? null : process.env.VIDEO_BETA_USER_IDS?.trim() ?? "";
  if (!studio && !canAccessVideoBeta(owner!)) return NextResponse.json({ error: "beta_disabled" }, { status: 503 });
  // Bound one invocation to one existing job; do not hold five leases while
  // sequential downloads consume the function's execution window.
  try { return NextResponse.json({ claimed: await reconcileVideoBeta(owner, null, 1) }); }
  catch { return NextResponse.json({ error: "reconciliation_unavailable" }, { status: 503 }); }
}

/** Native Vercel cron: GET with the platform's CRON_SECRET bearer header. */
export async function GET(request: Request) { return reconcile(request, process.env.CRON_SECRET); }

/** Existing external schedulers retain their explicitly configured credential. */
export async function POST(request: Request) { return reconcile(request, process.env.VIDEO_RECONCILIATION_CRON_SECRET); }
