import { FRAME_HEIGHT, FRAME_WIDTH, type BackgroundLayer, type FrameObject, type FrameObjectType, type Part, type PartFrame } from "./types";

type SourceObject = {
  id: string;
  name?: string;
  kind: FrameObjectType;
  bounds: FrameObject["bounds"];
  content?: string;
  style: FrameObject["style"];
  motion?: FrameObject["motion"];
  layoutId?: string;
};

type SourcePart = {
  id: string;
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
    motion?: BackgroundLayer["motion"];
    elements?: SourceObject[];
  };
  objects: SourceObject[];
};

export async function loadPartsFromSource(parts: Part[], readFile: (relativePath: string) => Promise<string>) {
  const loaded = await Promise.all(parts.map(async (part) => partFromSource(part, await readFile(part.filePath))));
  return loaded;
}

export async function partFromSource(basePart: Part, source: string): Promise<Part> {
  const sourcePart = await evaluatePartSource(source);

  if (sourcePart.id !== basePart.id) {
    throw new Error(`Source part id ${sourcePart.id} does not match manifest part id ${basePart.id}.`);
  }

  return {
    ...basePart,
    duration: sourcePart.duration,
    kind: sourcePart.objects.length > 0 || (basePart.kind === "frame" && sourcePart.background) || Boolean(sourcePart.background?.elements?.length) ? "frame" : "blank",
    frame: sourceFrameToPartFrame(sourcePart.frame),
    background: sourceBackgroundToLayer(sourcePart.background),
    objects: sourcePart.objects.map(sourceObjectToFrameObject),
  };
}

function sourceFrameToPartFrame(frame: SourcePart["frame"]): PartFrame {
  return {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    style: frame.style ?? { background: "#050505" },
  };
}

function sourceBackgroundToLayer(background: SourcePart["background"]): BackgroundLayer {
  return {
    id: background?.id ?? "background",
    name: background?.name ?? "Background",
    style: background?.style ?? { background: "transparent" },
    motion: background?.motion,
    elements: background?.elements?.map(sourceObjectToFrameObject) ?? [],
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
    style: object.style,
    motion: object.motion,
    layoutId: object.layoutId,
  };
}

async function evaluatePartSource(source: string): Promise<SourcePart> {
  const ts = await import("typescript");
  const strippedSource = source.replace(/^\s*import\s+[^;]+;\s*$/gm, "");
  const transpiled = ts.transpileModule(strippedSource, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {} as { part?: unknown };
  const definePart = <T>(part: T) => part;

  Function("exports", "definePart", `${transpiled}\nreturn exports;`)(exports, definePart);

  return assertSourcePart(exports.part);
}

function assertSourcePart(value: unknown): SourcePart {
  if (!value || typeof value !== "object") throw new Error("Part source must export a part object.");
  const part = value as Partial<SourcePart>;

  if (typeof part.id !== "string") throw new Error("Part source is missing string id.");
  if (typeof part.duration !== "number") throw new Error(`Part ${part.id} is missing numeric duration.`);
  if (!part.frame || part.frame.width !== FRAME_WIDTH || part.frame.height !== FRAME_HEIGHT) throw new Error(`Part ${part.id} must use a 1920x1080 frame.`);
  if (!Array.isArray(part.objects)) throw new Error(`Part ${part.id} is missing objects array.`);

  return part as SourcePart;
}

function titleFromId(id: string) {
  return id.split("-").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}
