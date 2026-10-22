"use client";

import { useState, type ReactNode } from "react";
import { GenerationGallery, type GenerationGalleryItem } from "@/components/projects/generation-gallery";
import { ImageEditPanel } from "@/components/projects/image-edit-panel";
import type { CreateImageEditResult } from "@/app/[locale]/dashboard/projects/[projectId]/generation-actions";
import type { FavoriteGenerationResult } from "@/lib/generations/favorite-generation";

type Props = {
  items: GenerationGalleryItem[];
  runActions: { id: string; node: ReactNode }[];
  controls: ReactNode;
  editAction: (baseGenerationId: string, instruction: string, submissionId: string) => Promise<CreateImageEditResult>;
  favoriteAction: (generationId: string, nextValue: boolean) => Promise<FavoriteGenerationResult>;
  editMessages: React.ComponentProps<typeof ImageEditPanel>["messages"];
  hasOutput: boolean;
  messages: React.ComponentProps<typeof GenerationGallery>["messages"];
  initialSelectedGenerationId?: string | null;
};

export function ProjectGenerationWorkspace({ items, runActions, controls, editAction, favoriteAction, editMessages, hasOutput, messages, initialSelectedGenerationId }: Props) {
  const defaultSelected = items.find((item) => item.previewUrl && item.status === "succeeded")?.id ?? null;
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(() => items.some((item) => item.id === initialSelectedGenerationId && item.previewUrl && item.status === "succeeded") ? initialSelectedGenerationId ?? defaultSelected : defaultSelected);
  function selectEditedGeneration(generationId: string) {
    setSelectedGenerationId(generationId);
  }
  return <GenerationGallery items={items} runActions={runActions} messages={messages} favoriteAction={favoriteAction} onSelectionChange={setSelectedGenerationId} initialSelectedGenerationId={selectedGenerationId} controls={<>
    {controls}
    <ImageEditPanel hasOutput={hasOutput} selectedGenerationId={selectedGenerationId} onEditSucceeded={selectEditedGeneration} action={editAction} messages={editMessages} />
  </>} />;
}
