import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type BackgroundLayer,
  type Bounds,
  type CompositionRenderMode,
  type FrameObject,
  type FrameObjectType,
  type FrameTemplate,
  type JsonValue,
  type Part,
  type PartFrame,
  type PropertyKeyframePoint,
  type PropertyTrack,
  type PropertyTrackValueType,
  type RichTextSegment,
  type ShadowEffect,
} from "./types";

export type JsonCompositionTrackValueType = PropertyTrackValueType;
export type JsonCompositionKeyframe = PropertyKeyframePoint;
export type JsonCompositionPropertyTrack = PropertyTrack;

export type JsonCompositionObjectSource = {
  kind: "file";
  path: string;
};

export type JsonCompositionObject = {
  id: string;
  type: FrameObjectType | "custom-renderer";
  name?: string;
  bounds: Bounds;
  style?: Record<string, string | number>;
  content?: string;
  template?: FrameTemplate;
  richText?: RichTextSegment[];
  transform?: Record<string, JsonValue> | string;
  filter?: Record<string, JsonValue>;
  shadow?: ShadowEffect;
  props?: Record<string, JsonValue>;
  source?: JsonCompositionObjectSource;
  tracks?: Record<string, JsonCompositionPropertyTrack>;
  hidden?: boolean;
  locked?: boolean;
  layoutId?: string;
  parentId?: string;
};

export type JsonComposition = {
  id: string;
  duration: number;
  renderMode?: CompositionRenderMode;
  frame: {
    width: number;
    height: number;
    style?: Record<string, string | number>;
  };
  background?: {
    id?: string;
    name?: string;
    style?: Record<string, string | number>;
    stretchToElements?: boolean;
    hidden?: boolean;
    locked?: boolean;
    elements?: JsonCompositionObject[];
  };
  objects: JsonCompositionObject[];
};

export type CompositionJsonParseError = {
  path: string;
  message: string;
};

export type CompositionJsonParseResult =
  | { ok: true; composition: JsonComposition }
  | { ok: false; errors: CompositionJsonParseError[] };

export function parseCompositionJsonSource(
  source: string,
): CompositionJsonParseResult {
  try {
    return parseCompositionJson(JSON.parse(source));
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: "$",
          message:
            error instanceof Error ? error.message : "Invalid JSON source.",
        },
      ],
    };
  }
}

export function parseCompositionJson(
  value: unknown,
): CompositionJsonParseResult {
  const errors: CompositionJsonParseError[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [{ path: "$", message: "Composition must be an object." }],
    };
  }

  const id = readString(value, "id", "$", errors);
  const duration = readFiniteNumber(value, "duration", "$", errors);
  const frame = readFrame(value.frame, "$.frame", errors);
  const objects = readObjects(value.objects, "$.objects", errors);
  const background =
    value.background === undefined
      ? undefined
      : readBackground(value.background, "$.background", errors);
  const renderMode =
    value.renderMode === undefined
      ? undefined
      : readRenderMode(value.renderMode, "$.renderMode", errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    composition: {
      id,
      duration,
      renderMode,
      frame,
      background,
      objects,
    },
  };
}

export function jsonCompositionToPart(
  composition: JsonComposition,
  baseComposition?: Partial<Part>,
): Part {
  return {
    id: baseComposition?.id ?? composition.id,
    filePath: baseComposition?.filePath ?? `${composition.id}.composition.json`,
    duration: composition.duration,
    renderMode: composition.renderMode,
    frame: jsonFrameToPartFrame(composition.frame),
    background: jsonBackgroundToLayer(composition.background),
    objects: composition.objects.map(jsonObjectToFrameObject),
    snapshot: baseComposition?.snapshot ?? [],
    motionMarkers: baseComposition?.motionMarkers ?? [],
    source: baseComposition?.source,
    prerender: baseComposition?.prerender,
    sourceMissing: baseComposition?.sourceMissing,
    compositionError: baseComposition?.compositionError,
    start: baseComposition?.start,
    trimStart: baseComposition?.trimStart,
    layerId: baseComposition?.layerId,
    compositionId: baseComposition?.compositionId,
  };
}

export function partToJsonComposition(part: Part): JsonComposition {
  return {
    id: part.id,
    duration: part.duration,
    renderMode: part.renderMode,
    frame: {
      width: part.frame.width,
      height: part.frame.height,
      style: part.frame.style,
    },
    background: {
      id: part.background.id,
      name: part.background.name,
      style: part.background.style,
      stretchToElements: part.background.stretchToElements,
      hidden: part.background.hidden,
      locked: part.background.locked,
      elements: part.background.elements.map(frameObjectToJsonObject),
    },
    objects: part.objects.map(frameObjectToJsonObject),
  };
}

export function compositionToJsonSource(part: Part): string {
  return `${JSON.stringify(partToJsonComposition(part), null, 2)}\n`;
}

function readFrame(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): JsonComposition["frame"] {
  if (!isRecord(value)) {
    errors.push({ path, message: "Frame must be an object." });
    return { width: FRAME_WIDTH, height: FRAME_HEIGHT };
  }
  return {
    width: readFiniteNumber(value, "width", path, errors),
    height: readFiniteNumber(value, "height", path, errors),
    style: readStringNumberRecord(value.style, `${path}.style`, errors, true),
  };
}

function readBackground(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): NonNullable<JsonComposition["background"]> {
  if (!isRecord(value)) {
    errors.push({ path, message: "Background must be an object." });
    return {};
  }
  return {
    id: readOptionalString(value, "id", path, errors),
    name: readOptionalString(value, "name", path, errors),
    style: readStringNumberRecord(value.style, `${path}.style`, errors, true),
    stretchToElements: readOptionalBoolean(
      value,
      "stretchToElements",
      path,
      errors,
    ),
    hidden: readOptionalBoolean(value, "hidden", path, errors),
    locked: readOptionalBoolean(value, "locked", path, errors),
    elements:
      value.elements === undefined
        ? undefined
        : readObjects(value.elements, `${path}.elements`, errors),
  };
}

function readObjects(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): JsonCompositionObject[] {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "Objects must be an array." });
    return [];
  }
  return value.map((entry, index) =>
    readObject(entry, `${path}[${index}]`, errors),
  );
}

function readObject(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): JsonCompositionObject {
  if (!isRecord(value)) {
    errors.push({ path, message: "Object entry must be an object." });
    return {
      id: "",
      type: "rect",
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    };
  }
  return {
    id: readString(value, "id", path, errors),
    type: readObjectType(value.type, `${path}.type`, errors),
    name: readOptionalString(value, "name", path, errors),
    bounds: readBounds(value.bounds, `${path}.bounds`, errors),
    style: readStringNumberRecord(value.style, `${path}.style`, errors, true),
    content: readOptionalString(value, "content", path, errors),
    template: readTemplate(value.template, `${path}.template`, errors),
    richText: readRichText(value.richText, `${path}.richText`, errors),
    transform: readJsonObjectOrString(
      value.transform,
      `${path}.transform`,
      errors,
    ),
    filter: readJsonRecord(value.filter, `${path}.filter`, errors),
    shadow: readShadow(value.shadow, `${path}.shadow`, errors),
    props: readJsonRecord(value.props, `${path}.props`, errors),
    source: readObjectSource(value.source, `${path}.source`, errors),
    tracks: readTracks(value.tracks, `${path}.tracks`, errors),
    hidden: readOptionalBoolean(value, "hidden", path, errors),
    locked: readOptionalBoolean(value, "locked", path, errors),
    layoutId: readOptionalString(value, "layoutId", path, errors),
    parentId: readOptionalString(value, "parentId", path, errors),
  };
}

function readBounds(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): Bounds {
  if (!isRecord(value)) {
    errors.push({ path, message: "Bounds must be an object." });
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: readFiniteNumber(value, "x", path, errors),
    y: readFiniteNumber(value, "y", path, errors),
    width: readFiniteNumber(value, "width", path, errors),
    height: readFiniteNumber(value, "height", path, errors),
  };
}

function readTracks(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push({ path, message: "Tracks must be an object." });
    return undefined;
  }
  const tracks: Record<string, JsonCompositionPropertyTrack> = {};
  for (const [propertyPath, trackValue] of Object.entries(value)) {
    const trackPath = `${path}.${propertyPath}`;
    if (!isRecord(trackValue)) {
      errors.push({ path: trackPath, message: "Track must be an object." });
      continue;
    }
    const valueType = readTrackValueType(
      trackValue.valueType,
      `${trackPath}.valueType`,
      errors,
    );
    const points = readTrackPoints(
      trackValue.points,
      `${trackPath}.points`,
      errors,
    );
    tracks[propertyPath] = { valueType, points };
  }
  return tracks;
}

function readTrackPoints(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "Track points must be an array." });
    return [];
  }
  return value.map((entry, index) => {
    const pointPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      errors.push({
        path: pointPath,
        message: "Track point must be an object.",
      });
      return { time: 0, value: null };
    }
    return {
      id: readOptionalString(entry, "id", pointPath, errors),
      time: readFiniteNumber(entry, "time", pointPath, errors),
      value: isJsonValue(entry.value)
        ? entry.value
        : recordInvalidJson(entry.value, `${pointPath}.value`, errors),
      easingToNext: readEasing(
        entry.easingToNext,
        `${pointPath}.easingToNext`,
        errors,
      ),
      hold: readOptionalBoolean(entry, "hold", pointPath, errors),
    };
  });
}

function readObjectSource(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push({ path, message: "Object source must be an object." });
    return undefined;
  }
  const kind = readString(value, "kind", path, errors);
  if (kind !== "file")
    errors.push({ path: `${path}.kind`, message: "Source kind must be file." });
  return {
    kind: "file" as const,
    path: readString(value, "path", path, errors),
  };
}

function readTemplate(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push({ path, message: "Template must be an object." });
    return undefined;
  }
  const kind = readString(value, "kind", path, errors);
  if (kind !== "html")
    errors.push({
      path: `${path}.kind`,
      message: "Template kind must be html.",
    });
  return {
    kind: "html" as const,
    source: readString(value, "source", path, errors),
    static: readOptionalBoolean(value, "static", path, errors),
  };
}

function readRichText(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    errors.push({ path, message: "Rich text must be an array." });
    return undefined;
  }
  return value.map((entry, index) => {
    const segmentPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      errors.push({
        path: segmentPath,
        message: "Rich text segment must be an object.",
      });
      return { text: "", bold: false, italic: false, underline: false };
    }
    return {
      text: readString(entry, "text", segmentPath, errors),
      bold: readBoolean(entry, "bold", segmentPath, errors),
      italic: readBoolean(entry, "italic", segmentPath, errors),
      underline: readBoolean(entry, "underline", segmentPath, errors),
    };
  });
}

function readObjectType(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): JsonCompositionObject["type"] {
  if (
    value === "rect" ||
    value === "text" ||
    value === "image" ||
    value === "svg" ||
    value === "html" ||
    value === "template" ||
    value === "null" ||
    value === "custom-renderer"
  ) {
    return value;
  }
  errors.push({ path, message: "Unsupported object type." });
  return "rect";
}

function readRenderMode(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (value === "dom" || value === "webgl") return value;
  errors.push({ path, message: "Render mode must be dom or webgl." });
  return undefined;
}

function readTrackValueType(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): PropertyTrackValueType {
  if (
    value === "number" ||
    value === "length" ||
    value === "color" ||
    value === "boolean" ||
    value === "string" ||
    value === "discrete" ||
    value === "custom"
  ) {
    return value;
  }
  errors.push({ path, message: "Unsupported track value type." });
  return "custom";
}

function readEasing(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  )
    return value as unknown as readonly [number, number, number, number];
  errors.push({ path, message: "Easing must be a string or four numbers." });
  return undefined;
}

function readJsonObjectOrString(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return readJsonRecord(value, path, errors);
}

function readJsonRecord(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
) {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isJsonValue(value)) {
    errors.push({ path, message: "Value must be a JSON object." });
    return undefined;
  }
  return value;
}

function readShadow(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): ShadowEffect | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push({ path, message: "Shadow must be an object." });
    return undefined;
  }
  const shadow: ShadowEffect = {};
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== "boolean") {
      errors.push({
        path: `${path}.enabled`,
        message: "Shadow enabled must be a boolean.",
      });
    } else {
      shadow.enabled = value.enabled;
    }
  }
  for (const field of ["x", "y", "blur", "spread", "alpha"] as const) {
    const raw = value[field];
    if (raw === undefined) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      errors.push({
        path: `${path}.${field}`,
        message: `Shadow ${field} must be a finite number.`,
      });
      continue;
    }
    shadow[field] = raw;
  }
  if (value.color !== undefined) {
    if (typeof value.color !== "string") {
      errors.push({
        path: `${path}.color`,
        message: "Shadow color must be a string.",
      });
    } else {
      shadow.color = value.color;
    }
  }
  return Object.keys(shadow).length === 0 ? undefined : shadow;
}

function readStringNumberRecord(
  value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
  optional = false,
) {
  if (value === undefined && optional) return undefined;
  if (!isRecord(value)) {
    errors.push({ path, message: "Value must be an object." });
    return undefined;
  }
  const output: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" || typeof entry === "number")
      output[key] = entry;
    else
      errors.push({
        path: `${path}.${key}`,
        message: "Value must be string or number.",
      });
  }
  return output;
}

function readString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: CompositionJsonParseError[],
) {
  const entry = value[key];
  if (typeof entry === "string") return entry;
  errors.push({ path: `${path}.${key}`, message: "Value must be a string." });
  return "";
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: CompositionJsonParseError[],
) {
  const entry = value[key];
  if (entry === undefined) return undefined;
  if (typeof entry === "string") return entry;
  errors.push({ path: `${path}.${key}`, message: "Value must be a string." });
  return undefined;
}

function readFiniteNumber(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: CompositionJsonParseError[],
) {
  const entry = value[key];
  if (typeof entry === "number" && Number.isFinite(entry)) return entry;
  errors.push({
    path: `${path}.${key}`,
    message: "Value must be a finite number.",
  });
  return 0;
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: CompositionJsonParseError[],
) {
  const entry = value[key];
  if (typeof entry === "boolean") return entry;
  errors.push({ path: `${path}.${key}`, message: "Value must be a boolean." });
  return false;
}

function readOptionalBoolean(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: CompositionJsonParseError[],
) {
  const entry = value[key];
  if (entry === undefined) return undefined;
  if (typeof entry === "boolean") return entry;
  errors.push({ path: `${path}.${key}`, message: "Value must be a boolean." });
  return undefined;
}

function jsonFrameToPartFrame(frame: JsonComposition["frame"]): PartFrame {
  return {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    style: frame.style ?? { backgroundColor: "#050505" },
  };
}

function jsonBackgroundToLayer(
  background: JsonComposition["background"],
): BackgroundLayer {
  return {
    id: background?.id ?? "background",
    name: background?.name ?? "Background",
    style: background?.style ?? { backgroundColor: "transparent" },
    stretchToElements: background?.stretchToElements || undefined,
    hidden: background?.hidden,
    locked: background?.locked,
    elements: (background?.elements ?? []).map(jsonObjectToFrameObject),
  };
}

function jsonObjectToFrameObject(object: JsonCompositionObject): FrameObject {
  return {
    id: object.id,
    name: object.name ?? titleFromId(object.id),
    type: object.type,
    selector: `[data-object-id='${object.id}']`,
    bounds: object.bounds,
    content: object.content,
    template: object.template,
    richText: object.richText,
    style: object.style ?? {},
    transform: object.transform,
    filter: object.filter,
    shadow: object.shadow,
    layoutId: object.layoutId,
    parentId: object.parentId,
    hidden: object.hidden,
    locked: object.locked,
    tracks: object.tracks,
    props: object.props,
    source: object.source,
  };
}

function frameObjectToJsonObject(object: FrameObject): JsonCompositionObject {
  return {
    id: object.id,
    type: object.type,
    name: object.name,
    bounds: object.bounds,
    style: object.style,
    content: object.content,
    template: object.template,
    richText: object.richText,
    transform: object.transform,
    filter: object.filter,
    shadow: object.shadow,
    layoutId: object.layoutId,
    parentId: object.parentId,
    hidden: object.hidden,
    locked: object.locked,
    tracks: object.tracks,
    props: object.props,
    source: object.source,
  };
}

function titleFromId(id: string) {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function recordInvalidJson(
  _value: unknown,
  path: string,
  errors: CompositionJsonParseError[],
): null {
  errors.push({ path, message: "Value must be valid JSON." });
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
