import type { VideoGenerationAspectRatio, VideoSourceReference } from "@/lib/video-generation/types";

export type ResolvedVideoSource = {
  reference: VideoSourceReference;
  providerUrl: string;
  expiresAt: string;
  mimeType: "image/jpeg" | "image/png";
  sizeBytes: number;
  width: number;
  height: number;
  aspectRatio: VideoGenerationAspectRatio;
};

export interface VideoSourceResolver {
  resolveOwned(ownerId: string, source: VideoSourceReference): Promise<ResolvedVideoSource | null>;
}

export function isSourceUrlFresh(source: ResolvedVideoSource, now = Date.now(), minimumLifetimeMs = 10 * 60_000) {
  const expiresAt = Date.parse(source.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - now >= minimumLifetimeMs;
}

export function sourceMatchesRequestedRatio(source: ResolvedVideoSource, requested: VideoGenerationAspectRatio) {
  return source.aspectRatio === requested;
}
