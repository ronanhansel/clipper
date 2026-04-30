import * as compositionApi from "../../clipper/projects/composition-api";
import { type ChartSpec } from "../../clipper/projects/composition-api";
import { FRAME_HEIGHT, FRAME_WIDTH, type BackgroundLayer, type FrameObject, type FrameObjectType, type FrameTemplate, type Part, type PartFrame } from "./types";

type SourceObject = {
  id: string;
  name?: string;
  kind: FrameObjectType;
  bounds: FrameObject["bounds"];
  content?: string;
  chart?: ChartSpec;
  template?: FrameTemplate;
  richText?: FrameObject["richText"];
  style: FrameObject["style"];
  motion?: FrameObject["motion"];
  transform?: compositionApi.Transform | string;
  layoutId?: string;
  hidden?: boolean;
  locked?: boolean;
  animations?: FrameObject["animations"];
};

type SourceComposition = {
  id?: string;
  name?: string;
  duration: number;
  frame: {
    width: number;
    height: number;
    style?: PartFrame["style"];
  };
  background?: {
    id?: string;
    name?: string;
    style?: BackgroundLayer["style"];
    stretchToElements?: boolean;
    motion?: BackgroundLayer["motion"];
    hidden?: boolean;
    locked?: boolean;
    animations?: BackgroundLayer["animations"];
    elements?: SourceRenderable[];
  };
  render: (context: compositionApi.RenderContext) => SourceRenderable[];
};

type ResolvedSourceComposition = SourceComposition & { objects: SourceObject[] };

type SourceExports = { composition?: unknown };

type SourceRenderable = compositionApi.RenderableObject | compositionApi.Component | compositionApi.Group | null | undefined | false | SourceRenderable[];

export async function loadCompositionsFromSource(compositions: Part[], readFile: (relativePath: string) => Promise<string>) {
  const loaded = await Promise.all(compositions.map(async (composition) => compositionFromSource(composition, await readFile(composition.filePath))));
  return loaded;
}

export async function compositionFromSource(baseComposition: Part, source: string): Promise<Part> {
  const sourceComposition = await evaluateCompositionSource(source, 0, baseComposition.duration);

  return {
    ...baseComposition,
    sourceMissing: undefined,
    name: sourceComposition.name ?? baseComposition.name,
    duration: sourceComposition.duration,
    frame: sourceFrameToCompositionFrame(sourceComposition.frame),
    background: sourceBackgroundToLayer(sourceComposition.background),
    objects: getSourceCompositionObjects(sourceComposition).map(sourceObjectToFrameObject),
  };
}

function sourceFrameToCompositionFrame(frame: SourceComposition["frame"]): PartFrame {
  return {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    style: frame.style ?? { background: "#050505" },
  };
}

function sourceBackgroundToLayer(background: SourceComposition["background"]): BackgroundLayer {
  return {
    id: background?.id ?? "background",
    name: background?.name ?? "Background",
    style: background?.style ?? { background: "transparent" },
    stretchToElements: background?.stretchToElements || undefined,
    motion: background?.motion,
    hidden: background?.hidden,
    locked: background?.locked,
    animations: background?.animations,
    elements: resolveRenderables(background?.elements ?? [], compositionApi.renderContext(0, 0)).map(sourceObjectToFrameObject),
  };
}

function sourceObjectToFrameObject(object: SourceObject): FrameObject {
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

export function compositionToSource(composition: Part) {
  const imports = Array.from(new Set(["Component", "Composition", ...composition.background.elements.map(frameObjectConstructorName), ...composition.objects.map(frameObjectConstructorName)])).sort();
  const background = cleanUndefined({
    id: composition.background.id,
    name: composition.background.name,
    style: composition.background.style,
    stretchToElements: composition.background.stretchToElements,
    motion: composition.background.motion,
    hidden: composition.background.hidden || undefined,
    locked: composition.background.locked || undefined,
    animations: composition.background.animations?.length ? composition.background.animations : undefined,
  });
  const backgroundElements = composition.background.elements.map(frameObjectToConstructorSource);
  const backgroundSource = `{
    ${tsBlock(background, 4).slice(2, -1).trimEnd()},
    elements: [
${backgroundElements.map((object) => indent(object, 6)).join(",\n")}
    ],
  }`;
  const objects = composition.objects.map(frameObjectToConstructorSource);

  return `import { ${imports.join(", ")} } from "@clipper/composition-api";\n\nclass GeneratedCompositionObjects extends Component {\n  render() {\n    return [\n${objects.map((object) => indent(object, 6)).join(",\n")}\n    ];\n  }\n}\n\nexport const composition = new Composition({\n  id: ${JSON.stringify(composition.compositionId ?? composition.id)},\n  name: ${JSON.stringify(composition.name)},\n  duration: ${JSON.stringify(composition.duration)},\n  frame: ${tsBlock(composition.frame, 2)},\n  background: ${indent(backgroundSource, 2).trimStart()},\n  render() {\n    return [new GeneratedCompositionObjects()];\n  },\n});\n`;
}

function frameObjectToSourceObject(object: FrameObject): SourceObject {
  return {
    id: object.id,
    name: object.name,
    kind: object.type,
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

function frameObjectToConstructorSource(object: FrameObject) {
  const input = cleanUndefined({
    id: object.id,
    name: object.name,
    bounds: object.bounds,
    ...(object.type === "text" ? { text: object.content } : { content: object.content }),
    chart: object.chart,
    template: object.template,
    richText: object.richText,
    style: object.style,
    motion: object.motion,
    layoutId: object.layoutId,
    hidden: object.hidden || undefined,
    locked: object.locked || undefined,
    animations: object.animations?.length ? object.animations : undefined,
  });
  return `new ${frameObjectConstructorName(object)}(${tsBlock(input, 0)})`;
}

function frameObjectConstructorName(object: FrameObject) {
  if (object.type === "text") return "Text";
  if (object.type === "image") return "Image";
  if (object.type === "svg") return "Svg";
  if (object.type === "html") return "Html";
  if (object.type === "template") return "Template";
  if (object.type === "chart") return "Chart";
  return "Rect";
}

function tsBlock(value: unknown, padding: number) {
  return indent(tsLiteral(value), padding).trimStart();
}

function tsLiteral(value: unknown, padding = 0): string {
  const currentIndent = " ".repeat(padding);
  const nextIndent = " ".repeat(padding + 2);

  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((entry) => entry === null || typeof entry !== "object")) return `[${value.map((entry) => tsLiteral(entry)).join(", ")}]`;
    return `[` + `\n${value.map((entry) => `${nextIndent}${tsLiteral(entry, padding + 2)}`).join(",\n")}\n${currentIndent}]`;
  }

  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  if (entries.length === 0) return "{}";
  if (entries.length <= 4 && entries.every(([, entry]) => entry === null || typeof entry !== "object" || (Array.isArray(entry) && entry.every((item) => item === null || typeof item !== "object")))) {
    return `{ ${entries.map(([key, entry]) => `${tsKey(key)}: ${tsLiteral(entry)}`).join(", ")} }`;
  }

  return `{\n${entries.map(([key, entry]) => `${nextIndent}${tsKey(key)}: ${tsLiteral(entry, padding + 2)}`).join(",\n")}\n${currentIndent}}`;
}

function tsKey(key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function cleanUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function indent(value: string, spaces: number) {
  const prefix = " ".repeat(spaces);
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

async function evaluateCompositionSource(source: string, time: number, duration: number): Promise<ResolvedSourceComposition> {
  const ts = await import("typescript");
  const strippedSource = source.replace(/^\s*import\s+[^;]+;\s*$/gm, "");
  const transpiled = ts.transpileModule(strippedSource, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {} as SourceExports;
  const apiEntries = Object.entries(compositionApi);

  Function("exports", ...apiEntries.map(([key]) => key), `${transpiled}\nreturn exports;`)(exports, ...apiEntries.map(([, value]) => value));

  return normalizeSourceComposition(assertSourceComposition(exports.composition), time, duration);
}

function assertSourceComposition(value: unknown): SourceComposition {
  if (!value || typeof value !== "object") throw new Error("Composition source must export a composition object.");
  const composition = value as Partial<SourceComposition>;

  if (typeof composition.duration !== "number") throw new Error("Composition source is missing numeric duration.");
  if (!composition.frame || composition.frame.width !== FRAME_WIDTH || composition.frame.height !== FRAME_HEIGHT) throw new Error("Composition source must use a 1920x1080 frame.");
  if (typeof composition.render !== "function") throw new Error("Composition source must define render() and return class-based renderables.");

  return composition as SourceComposition;
}

function normalizeSourceComposition(composition: SourceComposition, time: number, duration: number): ResolvedSourceComposition {
  const context = compositionApi.renderContext(time, duration || composition.duration);
  return {
    ...composition,
    background: composition.background ? {
      ...composition.background,
      elements: resolveRenderables(composition.background.elements ?? [], context),
    } : composition.background,
    objects: resolveRenderables(composition.render(context), context),
  };
}

function getSourceCompositionObjects(composition: ResolvedSourceComposition): SourceObject[] {
  return composition.objects;
}

function resolveRenderables(renderables: SourceRenderable[] | SourceRenderable, context: compositionApi.RenderContext, inherited?: { style?: FrameObject["style"]; transform?: string; motion?: FrameObject["motion"]; animations?: FrameObject["animations"]; hidden?: boolean; locked?: boolean }): SourceObject[] {
  if (!Array.isArray(renderables)) return resolveRenderables([renderables], context, inherited);

  return renderables.flatMap((renderable) => {
    if (!renderable) return [];
    if (Array.isArray(renderable)) return resolveRenderables(renderable, context, inherited);
    if (isComponentLike(renderable)) {
      const nextInherited = isGroupLike(renderable)
        ? mergeInherited(inherited, renderable.style, renderable.transform, renderable.motion, renderable.animations, renderable.hidden, renderable.locked)
        : inherited;
      return resolveRenderables(renderable.render(context), context, nextInherited);
    }
    if (isRenderableObject(renderable)) return [applyInheritedToSourceObject(renderable, inherited)];
    throw new Error("Composition render() must return Component, Group, or renderable class instances. Plain object renderables are no longer supported.");
  });
}

function isComponentLike(value: unknown): value is { render: (context: compositionApi.RenderContext) => SourceRenderable[] } {
  return Boolean(value && typeof value === "object" && typeof (value as { render?: unknown }).render === "function");
}

function isGroupLike(value: unknown): value is compositionApi.Group {
  return value instanceof compositionApi.Group;
}

function isRenderableObject(value: unknown): value is compositionApi.RenderableObject {
  return value instanceof compositionApi.RenderableObject;
}

function mergeInherited(inherited: { style?: FrameObject["style"]; transform?: string; motion?: FrameObject["motion"]; animations?: FrameObject["animations"]; hidden?: boolean; locked?: boolean } | undefined, style: FrameObject["style"] | undefined, transform: compositionApi.Transform | string | undefined, motion: FrameObject["motion"] | undefined, animations?: FrameObject["animations"], hidden?: boolean, locked?: boolean) {
  return {
    style: { ...(inherited?.style ?? {}), ...(style ?? {}) },
    transform: joinTransforms(inherited?.transform, compositionApi.transformToCss(transform)),
    motion: motion ?? inherited?.motion,
    animations: animations ?? inherited?.animations,
    hidden: hidden ?? inherited?.hidden,
    locked: locked ?? inherited?.locked,
  };
}

function applyInheritedToSourceObject(object: SourceObject, inherited: { style?: FrameObject["style"]; transform?: string; motion?: FrameObject["motion"]; animations?: FrameObject["animations"]; hidden?: boolean; locked?: boolean } | undefined): SourceObject {
  const ownTransform = compositionApi.transformToCss(object.transform);
  const styleTransform = typeof object.style?.transform === "string" ? object.style.transform : undefined;
  const transform = joinTransforms(inherited?.transform, styleTransform, ownTransform);
  return {
    ...object,
    style: {
      ...(inherited?.style ?? {}),
      ...(object.style ?? {}),
      ...(transform ? { transform } : {}),
    },
    motion: object.motion ?? inherited?.motion,
    animations: object.animations ?? inherited?.animations,
    hidden: object.hidden ?? inherited?.hidden,
    locked: object.locked ?? inherited?.locked,
  };
}

function joinTransforms(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ") || undefined;
}

function titleFromId(id: string) {
  return id.split("-").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}
