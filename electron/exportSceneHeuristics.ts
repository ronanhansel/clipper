type RenderableRecord = Record<string, unknown>;

const heavyContentPattern = /@keyframes|<svg\b|<filter\b|filter\s*:|backdrop-filter|mix-blend-mode|mask(?:-image)?\s*:|clip-path\s*:|box-shadow\s*:|text-shadow\s*:|fe[A-Z][A-Za-z]+|url\(#|<canvas\b|webgl|requestAnimationFrame/i;
const heavyStyleKeyPattern = /filter|backdropFilter|mixBlendMode|mask|clipPath|boxShadow|textShadow/i;
const heavyStyleValuePattern = /filter\(|blur\(|drop-shadow\(|url\(#|mix-blend-mode|mask-image|clip-path|box-shadow|text-shadow|fe[A-Z][A-Za-z]+/i;
const renderableChildKeys = ["compositions", "background", "frame", "objects", "elements", "children", "renderables", "items", "snapshot"];

export function scenePrefersTiledCapture(scene: unknown) {
  return inspectRenderable(scene, new Set());
}

function inspectRenderable(value: unknown, seen: Set<unknown>): boolean {
  if (!value) return false;
  if (typeof value === "string") return heavyContentPattern.test(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) return value.some((item) => inspectRenderable(item, seen));

  const record = value as RenderableRecord;
  const type = typeof record.type === "string" ? record.type.toLowerCase() : typeof record.kind === "string" ? record.kind.toLowerCase() : "";
  if (type === "svg" || type === "chart" || type === "weblayer") return true;
  if ((type === "html" || type === "template") && hasRenderablePayload(record)) return true;
  if (record.chart && typeof record.chart === "object") return true;
  if (inspectStyle(record.style) || inspectStyle(record.frame) || inspectStyle(record.background)) return true;
  if (inspectContentFields(record)) return true;

  for (const key of renderableChildKeys) {
    if (inspectRenderable(record[key], seen)) return true;
  }

  return false;
}

function hasRenderablePayload(record: RenderableRecord) {
  return Boolean(record.content || record.html || record.css || record.template || record.source || record.children || record.elements);
}

function inspectContentFields(record: RenderableRecord) {
  for (const key of ["content", "html", "css", "template", "source", "innerHTML", "markup"]) {
    if (inspectRenderable(record[key], new Set())) return true;
  }
  return false;
}

function inspectStyle(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const style = value as RenderableRecord;
  if (inspectStyle(style.style)) return true;
  for (const [key, raw] of Object.entries(style)) {
    if (heavyStyleKeyPattern.test(key)) return true;
    if (typeof raw === "string" && heavyStyleValuePattern.test(raw)) return true;
  }
  return false;
}
