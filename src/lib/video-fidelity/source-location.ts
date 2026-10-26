const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VideoFidelitySourceLocation = {
  bucketId: "video-source-images" | "generated-assets";
  objectPath: string;
  uploadedAssetId?: string;
};

/** Parse server-authored preparation metadata without trusting it as ownership proof. */
export function parsePreparedVideoSourceLocation(ownerId: string, metadata: unknown): VideoFidelitySourceLocation | null {
  if (!uuid.test(ownerId) || !metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const details = metadata as Record<string, unknown>;
  const bucketId = details.sourceBucket ?? details.source_bucket;
  const objectPath = details.sourcePath ?? details.source_path;
  if (typeof bucketId !== "string" || typeof objectPath !== "string" || !objectPath.startsWith(`${ownerId}/`)) return null;

  if (bucketId === "video-source-images") {
    const segments = objectPath.split("/");
    return segments.length === 3 && segments[0] === ownerId && uuid.test(segments[1]) && /^source\.(?:jpg|png)$/i.test(segments[2])
      ? { bucketId, objectPath, uploadedAssetId: segments[1] }
      : null;
  }

  if (bucketId === "generated-assets" && !objectPath.includes("..") && !objectPath.includes("\\")) {
    return { bucketId, objectPath };
  }
  return null;
}
