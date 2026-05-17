import { decoratePostProcessPassFrameBackground } from "./registry";
import type { PostProcessPass } from "../types";

export function selectLiveDomPostProcessPasses(passes: PostProcessPass[]) {
  return passes.filter((pass) => pass.requiresLiveDomSource);
}

export function withPostProcessFrameBackground(
  pass: PostProcessPass,
  background: unknown,
): PostProcessPass {
  return decoratePostProcessPassFrameBackground(pass, background);
}
