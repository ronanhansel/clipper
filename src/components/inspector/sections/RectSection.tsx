import { FillSection } from "./FillSection";

/**
 * Rect-only inspector content. Currently just a reuse of `FillSection`
 * (the bound's `style.color` is suppressed for rect via the registry config
 * in `inspectorRegistry.ts`).
 */
export function RectSection() {
  return <FillSection />;
}
