export type VideoSourceCandidate = {
  id: string;
  projectId: string;
  generationType: "image" | "video";
  status: "queued" | "processing" | "succeeded" | "failed";
  bucketId: string | null;
  objectPath: string | null;
  createdAt: string;
  aspectRatio: string | null;
};

export type OwnedVideoSourceProject = {
  id: string;
  title: string | null;
};

export type VideoSourceHandoffRepository = {
  findGeneration: (generationId: string) => Promise<VideoSourceCandidate | null>;
  findOwnedProject: (userId: string, projectId: string) => Promise<OwnedVideoSourceProject | null>;
  createSignedPreview: (bucketId: string, objectPath: string) => Promise<string | null>;
};

export type AuthorizedVideoSource = {
  id: string;
  generationId: string;
  projectId: string;
  name: string | null;
  previewUrl: string;
  createdAt: string;
  aspectRatio: string | null;
};

export type AuthorizedVideoSourceResult =
  | { status: "success"; asset: AuthorizedVideoSource }
  | { status: "unavailable" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isGeneratedImageId(value: string) {
  return uuidPattern.test(value);
}

export function isOwnedGeneratedImagePath(userId: string, projectId: string, objectPath: string) {
  const segments = objectPath.split("/");
  return segments.length === 3 && segments[0] === userId && segments[1] === projectId && segments[2].length > 0;
}

export async function resolveAuthorizedVideoSource(
  userId: string,
  generationId: string,
  repository: VideoSourceHandoffRepository,
): Promise<AuthorizedVideoSourceResult> {
  if (!userId || !isGeneratedImageId(generationId)) return { status: "unavailable" };

  const generation = await repository.findGeneration(generationId);
  if (
    !generation ||
    generation.id !== generationId ||
    generation.generationType !== "image" ||
    generation.status !== "succeeded" ||
    generation.bucketId !== "generated-assets" ||
    !generation.objectPath ||
    !isOwnedGeneratedImagePath(userId, generation.projectId, generation.objectPath)
  ) {
    return { status: "unavailable" };
  }

  const project = await repository.findOwnedProject(userId, generation.projectId);
  if (!project || project.id !== generation.projectId) return { status: "unavailable" };

  const previewUrl = await repository.createSignedPreview(generation.bucketId, generation.objectPath);
  if (!previewUrl) return { status: "unavailable" };

  return {
    status: "success",
    asset: {
      id: generation.id,
      generationId: generation.id,
      projectId: generation.projectId,
      name: project.title,
      previewUrl,
      createdAt: generation.createdAt,
      aspectRatio: generation.aspectRatio,
    },
  };
}

export function getAnimateSourceId(input: {
  id: string;
  generationType: "image" | "video";
  status: "queued" | "processing" | "succeeded" | "failed";
  previewUrl: string | null | undefined;
}) {
  return input.generationType === "image" && input.status === "succeeded" && input.previewUrl && isGeneratedImageId(input.id)
    ? input.id
    : null;
}

export function getVideoStudioSourceHref(generationId: string) {
  return `/dashboard/video?source=${encodeURIComponent(generationId)}` as const;
}
