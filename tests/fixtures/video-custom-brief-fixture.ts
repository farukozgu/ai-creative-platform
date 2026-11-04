import { customCreativeIntent } from "../../src/lib/video-director/custom-brief";
import { directorPlanDescriptions, type VideoDirectorInput, type VideoDirectorShot } from "../../src/lib/video-director/core";
import { directorProductContext } from "../../src/lib/video-director/product-context";
import { directorFixtureInput, directorProducts } from "./video-director-fixtures";

export const customFourShotBrief = [
  "Shot 1: Model walks toward camera on a rainy NYC street.",
  "Shot 2: Diagonal fashion pose then walking.",
  "Shot 3: Camera descends to a steaming street grate, natural foot contact, then darkness.",
  "Shot 4: Model-free dark studio product reveal with a product 360.",
].join("\n");

export function customFourShotFixture() {
  const base = directorFixtureInput(directorProducts[0]);
  const input: VideoDirectorInput = { ...base, presetId: "custom", draft: { ...base.draft,
    creativeMode: "custom", prompt: customFourShotBrief } };
  // Authored offline acceptance response; no provider call or generated result.
  const shots: VideoDirectorShot[] = [
    { durationSeconds: 3, purpose: "hero-reveal", camera: "Track backward at eye level",
      composition: "Model walking toward camera on rainy NYC street", motion: "Model walks toward camera" },
    { durationSeconds: 3, purpose: "hero-reveal", camera: "Locked medium fashion framing",
      composition: "Diagonal fashion pose on the rainy street", motion: "Model poses diagonally then walks" },
    { durationSeconds: 1, purpose: "lighting-reveal", camera: "Descend toward the street grate",
      composition: "Steaming street grate fills frame", motion: "Natural foot contact occludes into darkness" },
    { durationSeconds: 3, purpose: "final-hero", camera: "Pan right within the source-facing view",
      composition: "Model-free dark studio; full product reveal", motion: "Light travels over the source-facing product" },
  ].map(shot => ({ ...shot, evidenceRefs: [], lighting: "Soft side light", pace: "Measured reveal", focus: "Source-visible product form" })) as VideoDirectorShot[];
  return { input, response: { ...directorPlanDescriptions(input, shots.length),
    intentContract: customCreativeIntent(input.draft.prompt, directorProductContext(input.profile).evidence, input.shotMode, input.draft.cameraMovement), shots } };
}
