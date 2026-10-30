import type { VideoDirectorShot } from "./core";

const clean = (value: string) => value.trim().replace(/[.;]+$/, "");
const lower = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
const sentence = (value: string) => `${clean(value)}.`;

// Exact, meaning-preserving alternatives only: never infer a new camera trajectory.
function cameraAction(value: string) {
  const camera = clean(value);
  if (/^Slow dolly-in\b/.test(camera)) return camera.replace(/^Slow dolly-in/, "Dolly in slowly");
  if (camera === "Short lateral camera glide") return "Glide laterally over a short distance";
  if (/^Locked (?:close|medium|symmetrical|balanced)/i.test(camera)) return `Use ${lower(camera)}`;
  if (/^(?:Use|Keep|Frame|Track|Dolly|Pan|Glide|Move|Tilt|Pull|Push)\b/i.test(camera)) return camera;
  return `Use ${/framing|overview|perspective/i.test(camera) ? "" : "a "}${lower(camera)}`;
}

function compositionDirection(value: string) {
  const composition = clean(value);
  return /^(?:Frame|Return|Establish|Keep|Place|Center|Compose)\b/i.test(composition)
    ? composition : `Compose the ${lower(composition)}`;
}

function lightDirection(value: string) {
  const light = clean(value);
  return /\b(?:traces|shapes|preserves|defines|travels|reveals|resolves|retain|maintain|keep|protect)\b/i.test(light)
    ? light : `Light the scene with ${lower(light)}`;
}

/** Known legacy pose filler carries no creative action. Actual subject motion survives. */
function subjectAction(value: string) {
  return /^(?:(?:Hold|Settle into) (?:the )?(?:recognizable )?source-facing pose(?: in the light)?|(?:The )?product (?:stays|remains) (?:stationary|still)|Keep (?:the )?product (?:completely )?(?:still|stationary))$/i.test(clean(value))
    ? "" : sentence(value);
}

function compact(value: string) {
  return value.replace(/source-visible/gi, "visible").replace(/source-resolvable/gi, "resolvable")
    .replace(/\balready present in the source\b/gi, "in the source")
    .replace(/\bwithin the existing visible product view\b/gi, "within the visible view")
    .replace(/\baccording to the selected camera direction\b/gi, "as directed");
}

/** Mandatory action, chosen evidence, light, rhythm and fidelity reserve space first.
 * No unrelated profile atoms fill the remaining budget; no substring truncation.
 */
export function compileKlingShot(shot: VideoDirectorShot, limit: number, marked: boolean, preserveMarks = false, fallbackPreservation?: string) {
  const render = (short: boolean) => {
    const wording = (value: string) => short ? compact(value) : value;
    const focus = lower(wording(shot.focus)).replace(/^source-visible /, "visible ");
    const subject = /^(?:a|an|the)\b/.test(focus) ? focus : `the ${focus}`;
    const action = /^Locked close framing$/i.test(clean(shot.camera))
      ? `Frame ${subject} in a locked close view.`
      : `${wording(cameraAction(shot.camera))}, framing ${subject}.`;
    const fidelity = fallbackPreservation ?? (preserveMarks
      ? "Exact form/color/material/pattern/parts/text/logos/art & layout/ratios; no guesses. Known faces only."
      : marked
      ? "Keep source geometry, color, material, texture, pattern, parts and markings exact, especially the marked logo/label; show only known surfaces."
      : "Keep source geometry, color, material, texture, pattern, parts and markings exact; show only known surfaces.");
    return [action, sentence(wording(compositionDirection(shot.composition))), sentence(wording(lightDirection(shot.lighting))),
      wording(subjectAction(shot.motion)), `Allow ${/^(?:a|an|the)\b/i.test(shot.pace) ? "" : "a "}${lower(wording(clean(shot.pace)))}.`, fidelity].filter(Boolean).join(" ");
  };
  for (const short of [false, true]) {
    const prompt = render(short);
    if (prompt.length <= limit) return prompt;
  }
  throw new Error("kling_scene_prompt_too_long");
}
