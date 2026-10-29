// Frozen Director 3.0 compiler for offline before/after comparisons only.
import { parseDirectorOutput, type VideoDirectorInput, type VideoDirectorPlan } from "../../src/lib/video-director/core";
import { VIDEO_DIRECTOR_VERSION, videoDirectorPresets } from "../../src/lib/video-director/presets";
import { directorIdentityEvidence } from "../../src/lib/video-director/identity-evidence";
import { productVideoNegativePrompt, VIDEO_PRESERVATION_VERSION } from "../../src/lib/video-generation/preservation";
import { KLING_MULTI_PROMPT_MAX_CHARS } from "../../src/lib/video-generation/fal-request";
export function compileDirector30(plan: VideoDirectorPlan, input: VideoDirectorInput) {
  if (plan.version !== VIDEO_DIRECTOR_VERSION || plan.presetId !== input.presetId || plan.shotMode !== input.shotMode
    || plan.presetVersion !== videoDirectorPresets[input.presetId].version) throw new Error("invalid_director_plan");
  const validated = parseDirectorOutput(plan, input);
  if (!validated) throw new Error("invalid_director_plan");
  const multi = plan.shotMode === "multi";
  const identity = multi
    ? "Preserve source geometry, color, material/texture, pattern, logo/text and parts. Show known surfaces."
    : "The source image is the sole product identity authority. Preserve visible geometry, proportions, color distribution, material, surface texture, pattern and print, logo and exact visible lettering and construction. Show only source-visible surfaces.";
  const critical = input.draft.criticalRegion ? "Marked logo/label stays exact." : "";
  const evidence = directorIdentityEvidence(input.profile);
  const sentence = (value: string) => value.trim().replace(/[.;]+$/, "") + ".";
  const prompts = validated.shots.map(shot => {
    // Mandatory decisions are reserved first. A model must fit its scene budget;
    // optional complete evidence atoms may then be added. No string slicing.
    const directionFields = ["camera", "composition", "lighting", "motion", "pace"] as const;
    const direction = [`Focus: ${sentence(shot.focus)}`, ...directionFields.map(field => sentence(shot[field]))].join(" ");
    let prompt = [direction, identity, critical].filter(Boolean).join(" ");
    const limit = multi ? KLING_MULTI_PROMPT_MAX_CHARS : 2500;
    if (prompt.length > limit) throw new Error("kling_scene_prompt_too_long");
    // Every submitted scene contains all six creative fields exactly as reviewed.
    for (const item of evidence) {
      if (prompt.includes(item)) continue;
      const atom = `Visible: ${sentence(item)}`;
      if (prompt.length + atom.length + 1 <= limit) prompt += ` ${atom}`;
    }
    return prompt;
  });
  const negativePrompt = productVideoNegativePrompt.replace("object rotation, ", "");
  return { prompt: prompts[0], multiPrompt: multi
    ? prompts.map((prompt, index) => ({ prompt, duration: String(validated.shots[index].durationSeconds) })) : undefined,
    negativePrompt: multi ? negativePrompt.replace("scene cuts, ", "") : negativePrompt,
    cfgScale: 0.5, version: VIDEO_PRESERVATION_VERSION };
}
