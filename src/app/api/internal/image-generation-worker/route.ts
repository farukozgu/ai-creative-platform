import { handleImageWorkerRequest } from "@/lib/generation/image-worker-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 780;

/**
 * This endpoint is for a server-held scheduler secret only. It is deliberately
 * disabled unless an independent scheduler/worker is deployed; a route handler
 * is not itself a durable worker.
 */
export async function POST(request: Request) {
  return handleImageWorkerRequest(request, process.env.IMAGE_GENERATION_WORKER_SECRET);
}
