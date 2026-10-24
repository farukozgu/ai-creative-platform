import { handleLocalImageWorker, readLocalImageStatus } from "@/lib/generation/local-image-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 780;
export const POST = handleLocalImageWorker;
export const GET = readLocalImageStatus;
