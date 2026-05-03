type RenderableRecord = Record<string, unknown>;

const heavyContentPattern = /@keyframes|<svg\b|<filter\b|filter\s*:|backdrop-filter|mix-blend-mode|mask(?:-image)?\s*:|clip-path\s*:|box-shadow\s*:|text-shadow\s*:|fe[A-Z][A-Za-z]+|url\(#|<canvas\b|webgl|requestAnimationFrame/i;
const heavyStyleKeyPattern = /filter|backdropFilter|mixBlendMode|mask|clipPath|boxShadow|textShadow/i;
const heavyStyleValuePattern = /filter\(|blur\(|drop-shadow\(|url\(#|mix-blend-mode|mask-image|clip-path|box-shadow|text-shadow|fe[A-Z][A-Za-z]+/i;
const renderableChildKeys = ["compositions", "background", "frame", "objects", "elements", "children", "renderables", "items", "snapshot"];
const fastCanvasObjectTypes = new Set(["rect", "text"]);
const fastCanvasSharedStyleKeys = new Set(["background", "backgroundColor", "color", "fontSize", "fontFamily", "fontWeight", "lineHeight", "opacity", "borderRadius"]);
const safeCssColorPattern = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|transparent|black|white)$/i;

export function scenePrefersTiledCapture(scene: unknown) {
  return inspectRenderable(scene, new Set());
}

export type FastExportCapability = {
  supported: boolean;
  reasons: string[];
};

export function analyzeFastCanvasExportCapability(scene: unknown): FastExportCapability {
  const reasons: string[] = [];
  inspectFastCanvasRenderable(scene, new Set(), reasons, "scene");
  return { supported: reasons.length === 0, reasons };
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

function inspectFastCanvasRenderable(value: unknown, seen: Set<unknown>, reasons: string[], path: string) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectFastCanvasRenderable(item, seen, reasons, `${path}[${index}]`));
    return;
  }

  const record = value as RenderableRecord;
  const type = typeof record.type === "string" ? record.type.toLowerCase() : typeof record.kind === "string" ? record.kind.toLowerCase() : "";
  if (type && !fastCanvasObjectTypes.has(type) && hasObjectShape(record)) {
    reasons.push(`${path}: ${type} objects require DOM/Electron capture`);
  }
  if (record.transform) reasons.push(`${path}: transforms are not implemented in canvas fast export`);
  if (record.template || record.chart) reasons.push(`${path}: template/chart payload requires DOM renderer`);
  if (record.motion) reasons.push(`${path}: object motion tracks are not yet implemented in canvas fast export`);
  if (Array.isArray(record.animations) && record.animations.length > 0) reasons.push(`${path}: layer animations are not yet implemented in canvas fast export`);
  if (inspectStyle(record.style) || inspectStyle(record.frame) || inspectStyle(record.background)) reasons.push(`${path}: CSS filters/shadows/masks require DOM capture`);
  inspectFastCanvasStyle(record.style, `${path}.style`, reasons);
  inspectFastCanvasStyle((record.frame as RenderableRecord | undefined)?.style, `${path}.frame.style`, reasons);
  inspectFastCanvasStyle((record.background as RenderableRecord | undefined)?.style, `${path}.background.style`, reasons);
  if (typeof record.content === "string" && heavyContentPattern.test(record.content)) reasons.push(`${path}: complex content requires DOM capture`);
  if (Array.isArray(record.richText) && record.richText.length > 0) reasons.push(`${path}: rich text segment styling is not implemented in canvas fast export`);
  if (type === "text" && typeof record.content !== "string") reasons.push(`${path}: text objects require plain string content for canvas fast export`);
  if (Array.isArray(record.motionMarkers) && record.motionMarkers.length > 0) reasons.push(`${path}: motion markers are not yet implemented in canvas fast export`);
  if (Array.isArray(record.adjustmentLayers) && record.adjustmentLayers.length > 0) reasons.push(`${path}: adjustment layers are not yet implemented in canvas fast export`);
  if (Array.isArray(record.transitionLayers) && record.transitionLayers.length > 0) reasons.push(`${path}: transition layers are not yet implemented in canvas fast export`);

  for (const key of renderableChildKeys) {
    inspectFastCanvasRenderable(record[key], seen, reasons, `${path}.${key}`);
  }
}

function hasObjectShape(record: RenderableRecord) {
  return Boolean(record.bounds || record.style || record.content || record.type);
}

function inspectFastCanvasStyle(value: unknown, path: string, reasons: string[]) {
  if (!value || typeof value !== "object") return;
  for (const [key, raw] of Object.entries(value as RenderableRecord)) {
    if (!fastCanvasSharedStyleKeys.has(key)) {
      reasons.push(`${path}: style '${key}' is not implemented in canvas fast export`);
      continue;
    }
    if ((key === "background" || key === "backgroundColor" || key === "color") && !isSafeCanvasColor(raw)) {
      reasons.push(`${path}: style '${key}' uses unsupported color/paint '${String(raw)}'`);
    }
    if ((key === "fontSize" || key === "lineHeight" || key === "opacity" || key === "borderRadius") && !isFiniteNumber(raw)) {
      reasons.push(`${path}: style '${key}' must be a finite number for canvas fast export`);
    }
    if (key === "fontWeight" && !(typeof raw === "number" || raw === "normal" || raw === "bold" || /^[1-9]00$/.test(String(raw)))) {
      reasons.push(`${path}: style 'fontWeight' is unsupported in canvas fast export`);
    }
    if (key === "fontFamily" && typeof raw !== "string") reasons.push(`${path}: style 'fontFamily' must be a string for canvas fast export`);
  }
}

function isSafeCanvasColor(value: unknown) {
  return typeof value === "string" && safeCssColorPattern.test(value.trim());
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}
