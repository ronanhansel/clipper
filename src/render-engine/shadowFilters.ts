// SVG filter generation for Penpot-style drop shadows with true spread via feMorphology
// This replaces the CSS hybrid approach (text-shadow/box-shadow/drop-shadow)

export interface ShadowFilterParams {
  id: string;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string; // hex #rrggbb
  alpha: number; // 0..100
}

export function generateShadowFilterSvg(params: ShadowFilterParams): string {
  const { id, x, y, blur, spread, color, alpha } = params;

  // Parse hex color to RGB
  const hex = color.startsWith("#") ? color.slice(1) : color;
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha / 100));

  // SVG filter pipeline (Penpot-style):
  // 1. Extract SourceAlpha
  // 2. Apply feMorphology for spread (dilate if spread > 0, erode if spread < 0)
  // 3. Apply feOffset for x/y
  // 4. Apply feGaussianBlur for blur
  // 5. Apply feColorMatrix for color and alpha
  // 6. Merge shadow first and SourceGraphic second so the object stays above its shadow

  const stdDev = blur / 2; // feGaussianBlur uses stdDeviation
  const morphRadius = Math.abs(spread);
  const morphOp = spread > 0 ? "dilate" : spread < 0 ? "erode" : "none";

  return `<filter id="${id}" x="-100%" y="-100%" width="400%" height="400%" color-interpolation-filters="sRGB">
  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
  ${morphOp !== "none" ? `  <feMorphology in="hardAlpha" operator="${morphOp}" radius="${morphRadius}" result="morphed"/>\n` : ""}
  <feOffset dx="${x}" dy="${y}" in="${morphOp !== "none" ? "morphed" : "hardAlpha"}" result="offsetAlpha"/>
  <feGaussianBlur in="offsetAlpha" stdDeviation="${stdDev}" result="blurred"/>
  <feColorMatrix in="blurred" type="matrix" values="0 0 0 0 ${(r / 255).toFixed(3)} 0 0 0 0 ${(g / 255).toFixed(3)} 0 0 0 0 ${(b / 255).toFixed(3)} 0 0 0 ${a.toFixed(2)} 0" result="colored"/>
  <feMerge>
    <feMergeNode in="colored"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>`;
}

export function generateShadowFiltersContainer(
  filters: ShadowFilterParams[],
): string {
  if (filters.length === 0) return "";
  const filterSvgs = filters.map((f) => generateShadowFilterSvg(f)).join("\n");
  return `<svg style="position: absolute; width: 0; height: 0; overflow: hidden;" aria-hidden="true">
  <defs>
${filterSvgs}
  </defs>
</svg>`;
}
