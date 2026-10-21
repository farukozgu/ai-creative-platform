import { handleImageWorkerRequest } from "@/lib/generation/image-worker-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 780;

/** Vercel Cron sends CRON_SECRET as an Authorization Bearer token. */
export async function GET(request: Request) {
  return handleImageWorkerRequest(request, process.env.CRON_SECRET);
}
