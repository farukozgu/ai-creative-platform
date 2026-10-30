import "server-only";
import { readOwnedPreparedVideoSource } from "./source-context";
import type { VideoGenerationDraft } from "./types";
export async function readProductReferences(ownerId: string, draft: VideoGenerationDraft) {
  const result = [];
  for (const ref of draft.productReferences ?? []) {
    // Element images may retain their own prepared ratio when the output frame changes.
    const context = await readOwnedPreparedVideoSource(ownerId, ref.source, ref.aspectRatio ?? draft.aspectRatio);
    if (context.sourceSha256 !== ref.sha256) throw new Error("Reference content changed.");
    result.push({ ...context, purpose: ref.purpose });
  }
  return result;
}
