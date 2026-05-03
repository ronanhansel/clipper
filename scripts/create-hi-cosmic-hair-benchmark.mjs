import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const projectRoot = process.cwd();
const outPath = process.argv[2] ?? "/var/folders/gy/d7p0zrqx7l3f7dwplj0g_b040000gn/T/opencode/clipper-hi-cosmic-hair-benchmark.project.json";
const hiRoot = path.join(projectRoot, "clipper/projects/hi");
const editableRoot = path.join(hiRoot, "file-manager");
const timelinePath = path.join(editableRoot, "timelines/New Timeline.timeline.json");
const compositionPath = path.join(editableRoot, "compositions/cosmic-hair.composition.ts");
const compositionId = "compositions/cosmic-hair.composition.ts";
const frameWidth = 1920;
const frameHeight = 1080;

async function main() {
  const timeline = JSON.parse(await fs.readFile(timelinePath, "utf8"));
  const source = await fs.readFile(compositionPath, "utf8");
  const loadedComposition = await compositionFromSource({
    id: compositionId,
    filePath: compositionId,
    duration: 1,
    frame: { width: frameWidth, height: frameHeight, style: { background: "#050505" } },
    background: { id: "background", name: "Background", style: { background: "transparent" }, elements: [] },
    objects: [],
    snapshot: [],
    motionMarkers: [],
  }, source, readCompositionDependency);

  const scene = {
    id: timeline.id,
    name: "New Timeline",
    adjustmentLayers: timeline.adjustmentLayers ?? [],
    motionMarkers: timeline.motionMarkers ?? [],
    transitionLayers: timeline.transitionLayers ?? [],
    compositions: timeline.clips.map((clip) => ({
      ...loadedComposition,
      id: clip.id,
      compositionId: clip.compositionId,
      start: clip.start,
      layerId: clip.layerId,
      duration: clip.duration ?? loadedComposition.duration,
      motionMarkers: clip.motionMarkers ?? [],
    })),
  };

  const manifest = {
    id: "hi-cosmic-hair-benchmark",
    name: "hi cosmic hair benchmark",
    resolution: { width: frameWidth, height: frameHeight },
    assetsPath: "clipper/projects/hi/assets",
    assets: [],
    scenes: [scene],
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(outPath);
}

async function readCompositionDependency(relativePath) {
  return fs.readFile(path.join(editableRoot, relativePath), "utf8");
}

async function compositionFromSource(baseComposition, compositionSource, readFile) {
  const sourceComposition = await evaluateCompositionSource(compositionSource, baseComposition.filePath, readFile);
  return {
    ...baseComposition,
    duration: sourceComposition.duration,
    frame: { width: frameWidth, height: frameHeight, style: sourceComposition.frame.style ?? { background: "#050505" } },
    background: sourceBackgroundToLayer(sourceComposition.background),
    objects: resolveRenderables(sourceComposition.render(renderContext(0, sourceComposition.duration)), undefined).map(sourceObjectToFrameObject),
  };
}

async function evaluateCompositionSource(compositionSource, sourcePath, readFile) {
  const sourceWithCss = await inlineCssImports(compositionSource, sourcePath, readFile);
  const strippedSource = sourceWithCss.replace(/^\s*import\s+[^;]+;\s*$/gm, "");
  const transpiled = ts.transpileModule(strippedSource, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  Function("exports", ...Object.keys(compositionApi), `${transpiled}\nreturn exports;`)(exports, ...Object.values(compositionApi));
  if (!exports.composition || typeof exports.composition !== "object") throw new Error("Composition source must export a composition object.");
  return exports.composition;
}

async function inlineCssImports(compositionSource, sourcePath, readFile) {
  const cssImportPattern = /^\s*import\s+(\w+)\s+from\s+["'](.+\.css)["'];?\s*$/gm;
  const replacements = [];
  for (const match of compositionSource.matchAll(cssImportPattern)) {
    const identifier = match[1];
    const cssPath = resolveRelativeSourcePath(sourcePath, match[2]);
    const cssSource = await readFile(cssPath);
    replacements.push({ start: match.index, end: match.index + match[0].length, value: `const ${identifier} = ${JSON.stringify(cssSource)};` });
  }
  return replacements.reduceRight((current, replacement) => `${current.slice(0, replacement.start)}${replacement.value}${current.slice(replacement.end)}`, compositionSource);
}

function sourceBackgroundToLayer(background) {
  return {
    id: background?.id ?? "background",
    name: background?.name ?? "Background",
    style: background?.style ?? { background: "transparent" },
    stretchToElements: background?.stretchToElements || undefined,
    motion: background?.motion,
    hidden: background?.hidden,
    locked: background?.locked,
    animations: background?.animations,
    elements: resolveRenderables(background?.elements ?? [], undefined).map(sourceObjectToFrameObject),
  };
}

function sourceObjectToFrameObject(object) {
  return {
    id: object.id,
    name: object.name ?? titleFromId(object.id),
    type: object.kind,
    selector: `[data-object-id='${object.id}']`,
    bounds: object.bounds,
    content: object.content,
    chart: object.chart,
    template: object.template,
    richText: object.richText,
    style: object.style,
    motion: object.motion,
    layoutId: object.layoutId,
    hidden: object.hidden,
    locked: object.locked,
    animations: object.animations,
  };
}

function resolveRenderables(renderables, inherited) {
  if (!Array.isArray(renderables)) return resolveRenderables([renderables], inherited);
  return renderables.flatMap((renderable) => {
    if (!renderable) return [];
    if (Array.isArray(renderable)) return resolveRenderables(renderable, inherited);
    if (isComponentLike(renderable)) {
      const nextInherited = renderable instanceof Group ? mergeInherited(inherited, renderable.style, renderable.transform, renderable.motion, renderable.animations, renderable.hidden, renderable.locked) : inherited;
      return resolveRenderables(renderable.render(renderContext(0, 0)), nextInherited);
    }
    if (renderable instanceof RenderableObject) return [applyInheritedToSourceObject(renderable, inherited)];
    throw new Error("Composition render() must return Component, Group, or renderable class instances.");
  });
}

function isComponentLike(value) {
  return Boolean(value && typeof value === "object" && typeof value.render === "function");
}

function mergeInherited(inherited, style, transform, motion, animations, hidden, locked) {
  return {
    style: { ...(inherited?.style ?? {}), ...(style ?? {}) },
    transform: joinTransforms(inherited?.transform, transformToCss(transform)),
    motion: motion ?? inherited?.motion,
    animations: animations ?? inherited?.animations,
    hidden: hidden ?? inherited?.hidden,
    locked: locked ?? inherited?.locked,
  };
}

function applyInheritedToSourceObject(object, inherited) {
  const ownTransform = transformToCss(object.transform);
  const styleTransform = typeof object.style?.transform === "string" ? object.style.transform : undefined;
  const transform = joinTransforms(inherited?.transform, styleTransform, ownTransform);
  return { ...object, style: { ...(inherited?.style ?? {}), ...(object.style ?? {}), ...(transform ? { transform } : {}) }, motion: object.motion ?? inherited?.motion, animations: object.animations ?? inherited?.animations, hidden: object.hidden ?? inherited?.hidden, locked: object.locked ?? inherited?.locked };
}

function resolveRelativeSourcePath(sourcePath, importPath) {
  if (!importPath.startsWith(".")) return importPath;
  const parts = `${sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : ""}/${importPath}`.split("/");
  const resolved = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

function joinTransforms(...values) {
  return values.filter(Boolean).join(" ") || undefined;
}

function titleFromId(id) {
  return id.split("-").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}

function renderContext(time, duration) {
  return { time, duration };
}

function transformToCss(transform) {
  if (typeof transform === "string") return transform;
  if (!transform) return undefined;
  const parts = [];
  if (transform.x !== undefined || transform.y !== undefined || transform.z !== undefined) parts.push(`translate3d(${transform.x ?? 0}px, ${transform.y ?? 0}px, ${transform.z ?? 0}px)`);
  if (transform.rotate !== undefined) parts.push(`rotate(${transform.rotate}deg)`);
  if (transform.scale !== undefined) parts.push(`scale(${transform.scale})`);
  if (transform.scaleX !== undefined) parts.push(`scaleX(${transform.scaleX})`);
  if (transform.scaleY !== undefined) parts.push(`scaleY(${transform.scaleY})`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function css(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

function html(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

class RenderableObject {
  constructor(props) {
    this.id = props.id;
    this.name = props.name;
    this.kind = "rect";
    this.bounds = props.bounds;
    this.content = props.text ?? props.content;
    this.chart = props.chart;
    this.template = props.template;
    this.richText = props.richText;
    this.style = props.style ?? {};
    this.motion = props.motion;
    this.transform = props.transform;
    this.layoutId = props.layoutId;
    this.hidden = props.hidden;
    this.locked = props.locked;
    this.animations = props.animations;
  }
}

class Rect extends RenderableObject { constructor(props) { super(props); this.kind = "rect"; } }
class Text extends RenderableObject { constructor(props) { super(props); this.kind = "text"; } }
class Image extends RenderableObject { constructor(props) { super(props); this.kind = "image"; } }
class Svg extends RenderableObject { constructor(props) { super(props); this.kind = "svg"; } }
class Html extends RenderableObject { constructor(props) { super(props); this.kind = "html"; } }
class WebLayer extends Html { constructor(props) { super({ ...props, content: `${props.css ? `<style>${props.css}</style>` : ""}${props.html}` }); } }
class Template extends RenderableObject { constructor(props) { super(props); this.kind = "template"; } }
class Chart extends RenderableObject { constructor(props) { super(props); this.kind = "chart"; } }
class Component { constructor(props) { Object.assign(this, props); } render() { return []; } }
class Group extends Component { constructor(props) { super(props); this.children = props?.children ?? []; } render() { return this.children; } }
class Composition { constructor(props) { Object.assign(this, props); } }

const compositionApi = { Component, Composition, Rect, Text, Image, Svg, Html, WebLayer, Template, Chart, Group, css, html, transformToCss };

await main();
