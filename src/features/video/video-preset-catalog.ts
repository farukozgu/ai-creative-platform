import type { VideoPresetId } from "@/lib/video-director/presets";

// Public picker only. Backend IDs, receipts and legacy creative behavior stay unchanged.
export const videoStudioPresetIds = [
  "minimal-studio",
  "metallic-light-sweep",
  "macro-detail-reveal",
  "floating-accessory",
  "cinematic-hero",
  "dramatic-backlight",
  "material-detail",
  "window-display",
] as const satisfies readonly VideoPresetId[];
