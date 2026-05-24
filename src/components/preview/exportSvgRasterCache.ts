import type { Bounds } from "../../core/types";

export type SvgRasterState = "idle" | "pending" | "ready" | "failed";

export type SvgRasterRequest = {
  svg: string;
  bounds: Bounds;
  frameScale: number;
  style?: object;
  markupKind?: "svg";
  resultSource?: SvgRasterResult["source"];
  sourceBounds?: Bounds;
  sourceOffset?: { x: number; y: number };
};

export type SvgRasterResult = {
  key: string;
  url: string;
  width: number;
  height: number;
  source: "canvas-png";
};

const minSvgLengthForRaster = 8_000;
const minRasterPixels = 512 * 512;
const maxCacheEntries = 96;
const cache = new Map<string, Promise<SvgRasterResult>>();

export function shouldPreRasterizeSvgForExport(
  request: SvgRasterRequest,
): boolean {
  const width = Math.ceil(request.bounds.width * request.frameScale);
  const height = Math.ceil(request.bounds.height * request.frameScale);
  const trimmed = request.svg.trim();
  if (!trimmed.startsWith("<svg")) return false;
  return (
    request.svg.length >= minSvgLengthForRaster ||
    width * height >= minRasterPixels
  );
}

export function getSvgRasterCacheKey(request: SvgRasterRequest): string {
  const width = Math.ceil(request.bounds.width * request.frameScale);
  const height = Math.ceil(request.bounds.height * request.frameScale);
  return JSON.stringify({
    svg: request.svg,
    width,
    height,
    frameScale: request.frameScale,
    markupKind: request.markupKind ?? "svg",
    sourceBounds: request.sourceBounds,
    sourceOffset: request.sourceOffset,
    style: getInheritedSvgStyle(request.style),
  });
}

export function rasterizeSvgForExport(
  request: SvgRasterRequest,
): Promise<SvgRasterResult> {
  const key = getSvgRasterCacheKey(request);
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = rasterizeSvg(request, key).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  trimCache();
  return promise;
}

async function rasterizeSvg(
  request: SvgRasterRequest,
  key: string,
): Promise<SvgRasterResult> {
  const width = Math.max(
    1,
    Math.ceil(request.bounds.width * request.frameScale),
  );
  const height = Math.max(
    1,
    Math.ceil(request.bounds.height * request.frameScale),
  );
  const svg = serializeSvgForRaster(
    request.svg,
    width,
    height,
    request.style,
    request.markupKind,
    request.sourceBounds,
    request.sourceOffset,
    request.frameScale,
  );
  const svgUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("2D canvas is unavailable for export SVG rasterization.");
    context.drawImage(image, 0, 0, width, height);
    return {
      key,
      url: canvas.toDataURL("image/png"),
      width,
      height,
      source: "canvas-png",
    };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error("Browser failed to decode SVG for export rasterization."),
      );
    image.src = url;
  });
}

export function serializeSvgForRaster(
  svg: string,
  width: number,
  height: number,
  style: object | undefined,
  markupKind: "svg" = "svg",
  sourceBounds?: Bounds,
  sourceOffset?: { x: number; y: number },
  frameScale = 1,
): string {
  const trimmed = svg.trim();
  if (!trimmed.startsWith("<svg")) return trimmed;
  if (sourceBounds && sourceOffset)
    return serializeCroppedSvgForRaster(
      trimmed,
      width,
      height,
      style,
      sourceBounds,
      sourceOffset,
      frameScale,
    );
  const normalized = ensureSvgNamespace(trimmed);
  return normalized.replace(/<svg\b([^>]*)>/i, (match, attrs: string) => {
    const withoutSize = attrs.replace(
      /\s(width|height)=("[^"]*"|'[^']*'|[^\s>]*)/gi,
      "",
    );
    const rootStyle = mergeStyleAttribute(
      getAttributeValue(attrs, "style"),
      getInheritedSvgStyle(style),
    );
    const withoutStyle = withoutSize.replace(
      /\sstyle=("[^"]*"|'[^']*'|[^\s>]*)/i,
      "",
    );
    return `<svg${withoutStyle} width="${width}" height="${height}"${rootStyle ? ` style="${escapeAttribute(rootStyle)}"` : ""}>`;
  });
}

function serializeCroppedSvgForRaster(
  svg: string,
  width: number,
  height: number,
  style: object | undefined,
  sourceBounds: Bounds,
  sourceOffset: { x: number; y: number },
  frameScale: number,
): string {
  const inheritedStyle = mergeStyleAttribute(
    undefined,
    getInheritedSvgStyle(style),
  );
  const sourceWidth = Math.ceil(sourceBounds.width * frameScale);
  const sourceHeight = Math.ceil(sourceBounds.height * frameScale);
  const offsetX = Math.ceil(sourceOffset.x * frameScale);
  const offsetY = Math.ceil(sourceOffset.y * frameScale);
  const transform = `translate(${-offsetX} ${-offsetY})`;
  const rootStyle = inheritedStyle
    ? ` style="${escapeAttribute(inheritedStyle)}"`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${rootStyle}><g transform="${transform}">${normalizeCroppedSvgRoot(svg, sourceWidth, sourceHeight)}</g></svg>`;
}

function normalizeCroppedSvgRoot(svg: string, width: number, height: number) {
  return svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const withoutSize = attrs.replace(
      /\s(width|height)=(["'][^"']*["']|[^\s>]*)/gi,
      "",
    );
    return `<svg${withoutSize} width="${width}" height="${height}">`;
  });
}

function parseStyleText(style: string) {
  return Object.fromEntries(
    style
      .split(";")
      .map((entry) => {
        const separator = entry.indexOf(":");
        if (separator < 0) return null;
        const key = entry.slice(0, separator).trim();
        const value = entry.slice(separator + 1).trim();
        return key && value ? [key, value] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
}

function injectStylesIntoSvg(svg: string, styles: string) {
  const normalized = ensureSvgNamespace(svg);
  if (!styles.trim()) return normalized;
  return normalized.replace(
    /<svg\b([^>]*)>/i,
    (match) =>
      `${match}<defs><style><![CDATA[${escapeCdata(styles)}]]></style></defs>`,
  );
}

function ensureSvgNamespace(svg: string) {
  return svg.replace(/<svg\b([^>]*)>/i, (match, attrs: string) =>
    /\sxmlns=/.test(attrs)
      ? match
      : `<svg${attrs} xmlns="http://www.w3.org/2000/svg">`,
  );
}

function escapeCdata(value: string) {
  return value.replace(/]]>/g, "]]]]><![CDATA[>");
}

function getInheritedSvgStyle(style: object | undefined) {
  if (!style) return undefined;
  const styleRecord = style as Record<string, unknown>;
  const relevant: Record<string, unknown> = {};
  for (const key of [
    "color",
    "fill",
    "stroke",
    "font",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "textAnchor",
    "direction",
    "visibility",
    "opacity",
    "filter",
    "mixBlendMode",
    "background",
    "backgroundColor",
  ]) {
    if (styleRecord[key] !== undefined) relevant[key] = styleRecord[key];
  }
  for (const key of Object.keys(styleRecord)) {
    if (key.startsWith("--") && styleRecord[key] !== undefined)
      relevant[key] = styleRecord[key];
  }
  return relevant;
}

function mergeStyleAttribute(
  existingStyle: string | undefined,
  inheritedStyle: Record<string, unknown> | undefined,
) {
  const inherited = inheritedStyle
    ? Object.entries(inheritedStyle)
        .map(([key, value]) => `${toKebabCase(key)}:${String(value)}`)
        .join(";")
    : "";
  return [existingStyle, inherited].filter(Boolean).join(";");
}

function getAttributeValue(attrs: string, name: string) {
  const match = attrs.match(
    new RegExp(`\\s${name}=("([^"]*)"|'([^']*)'|([^\\s>]*))`, "i"),
  );
  return match?.[2] ?? match?.[3] ?? match?.[4];
}

function toKebabCase(value: string) {
  return value.startsWith("--")
    ? value
    : value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function trimCache() {
  while (cache.size > maxCacheEntries) {
    const oldest = cache.keys().next().value;
    if (!oldest) return;
    cache.delete(oldest);
  }
}
