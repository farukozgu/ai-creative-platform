import type { GenerationAspectRatio } from "@/lib/generation/types";
import type { SupportedVertical } from "@/lib/verticals/supported-verticals";

export type CanvasStep = "type" | "name" | "product" | "format" | "direction" | "reference" | "details" | "review" | "generating" | "failed";
export type CanvasImage = Readonly<{ previewUrl: string; name: string }>;
export type CanvasPreset = Readonly<{ title: string; category: SupportedVertical; thumbnail: string }>;
export type CanvasInput = Readonly<{
  step: CanvasStep;
  projectName: string;
  products: readonly CanvasImage[];
  references: readonly CanvasImage[];
  aspectRatio: GenerationAspectRatio;
  creationMode: "preset" | "custom";
  preset: CanvasPreset | null;
  category: SupportedVertical | null;
  presentationMode: string | null;
  direction: string;
}>;

export function deriveCanvasState(input: CanvasInput) {
  return {
    ...input,
    primary: input.products[0] ?? null,
    supporting: input.products.slice(1),
    references: input.references,
    preset: input.creationMode === "preset" ? input.preset : null,
    category: input.creationMode === "preset" ? input.category : null,
    presentationMode: input.creationMode === "preset" && input.preset ? input.presentationMode : null,
    direction: input.direction.trim(),
    hasGeneratedOutput: false as const,
  };
}
