import { decoratePostProcessPassFrameBackground } from "./registry";
import type { PostProcessPass } from "../types";

export function selectLiveDomPostProcessPass(passes: PostProcessPass[]) {
  const livePasses = passes.filter((pass) => pass.requiresLiveDomSource);
  return {
    pass: livePasses[0] ?? null,
    droppedPassCount: Math.max(0, livePasses.length - 1),
  };
}

export function withPostProcessFrameBackground(
  pass: PostProcessPass,
  background: unknown,
): PostProcessPass {
  return decoratePostProcessPassFrameBackground(pass, background);
}
