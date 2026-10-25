export type DownloadableImage = {
  id: string;
  projectId: string;
  ownerId: string;
  type: string;
  status: string;
  bucket: string | null;
  path: string | null;
  mimeType: string | null;
};

export type ImageDownloadResult =
  | { ok: true; url: string; fileName: string }
  | { ok: false };

export type ImageDownloadRepository = {
  findOwned(userId: string, generationId: string): Promise<DownloadableImage | null>;
  sign(path: string, expiresIn: number, fileName: string): Promise<string | null>;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reauthorize on each click; an expired preview URL is never the download authority. */
export async function authorizeImageDownload(
  userId: string | null,
  generationId: string,
  repository: ImageDownloadRepository,
  storageOrigin: string,
): Promise<ImageDownloadResult> {
  if (!userId || !uuid.test(userId) || !uuid.test(generationId)) return { ok: false };
  try {
    const image = await repository.findOwned(userId, generationId);
    if (!image || image.id !== generationId || image.ownerId !== userId || !uuid.test(image.projectId)
      || image.type !== "image" || image.status !== "succeeded" || image.bucket !== "generated-assets"
      || image.mimeType !== "image/png" || image.path !== `${userId}/${image.projectId}/${generationId}.png`) {
      return { ok: false };
    }
    const fileName = `klay-${generationId}.png`;
    const signed = await repository.sign(image.path, 60, fileName);
    if (!signed) return { ok: false };
    const url = new URL(signed);
    const origin = new URL(storageOrigin);
    if (url.protocol !== "https:" || url.origin !== origin.origin || url.username || url.password
      || decodeURIComponent(url.pathname) !== `/storage/v1/object/sign/generated-assets/${image.path}`
      || !url.searchParams.get("token") || url.searchParams.get("download") !== fileName) return { ok: false };
    return { ok: true, url: url.href, fileName };
  } catch {
    return { ok: false };
  }
}
