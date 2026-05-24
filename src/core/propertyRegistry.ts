import { easeAnimationProgress } from "./animations";
import { type FillValue, isFillValue, parseCssToFillValue } from "./fillValue";
import type {
  Bounds,
  FrameObject,
  JsonValue,
  Part,
  PropertyTrack,
  PropertyTrackValueType,
  ShadowEffect,
  StrokeEffect,
} from "./types";

export type PropertyPath =
  | "bounds.x"
  | "bounds.y"
  | "bounds.width"
  | "bounds.height"
  | "style.opacity"
  | "style.color"
  | "style.backgroundColor"
  | "style.fontSize"
  | "style.fontWeight"
  | "style.lineHeight"
  | "style.letterSpacing"
  | "style.fontFamily"
  | `style.fill.${string}`
  | "transform.translateX"
  | "transform.translateY"
  | "transform.translateZ"
  | "transform.scale"
  | "transform.scaleX"
  | "transform.scaleY"
  | "transform.rotate"
  | "transform.rotateX"
  | "transform.rotateY"
  | "transform.rotateZ"
  | "transform.skewX"
  | "transform.skewY"
  | "transform.perspective"
  | "filter.blur"
  | "shadow.x"
  | "shadow.y"
  | "shadow.blur"
  | "shadow.spread"
  | "shadow.color"
  | "shadow.alpha"
  | "stroke.width"
  | "stroke.color"
  | "stroke.alpha"
  | "stroke.start"
  | "stroke.end"
  | "stroke.spacing"
  | `props.${string}`;

export type PropertyDefinition = {
  path: PropertyPath;
  valueType: PropertyTrackValueType;
  group?:
    | "position"
    | "size"
    | "transform"
    | "filter"
    | "shadow"
    | "stroke"
    | "style"
    | "props";
  defaultValue?: JsonValue;
  getBaseValue: (object: FrameObject) => JsonValue;
  setBaseValue: (object: FrameObject, value: JsonValue) => FrameObject;
  interpolate?: (from: JsonValue, to: JsonValue, progress: number) => JsonValue;
  serializeRenderValue?: (value: JsonValue) => string | number | undefined;
};

export type EvaluatedObjectState = FrameObject & {
  bounds: Bounds;
  style: Record<string, string | number>;
  transform: Record<string, JsonValue>;
  filter: Record<string, JsonValue>;
  shadow: Record<string, JsonValue>;
  stroke: Record<string, JsonValue>;
  props: Record<string, JsonValue>;
};

export type EvaluatedCompositionState = Part & {
  objects: EvaluatedObjectState[];
};

export type PropertyRegistry = {
  get: (path: string) => PropertyDefinition | undefined;
  require: (path: string) => PropertyDefinition;
  set: (definition: PropertyDefinition) => void;
  entries: () => PropertyDefinition[];
};

export function createPropertyRegistry(
  definitions?: PropertyDefinition[],
): PropertyRegistry {
  const entries = new Map<string, PropertyDefinition>();
  for (const definition of definitions ?? defaultPropertyDefinitions)
    entries.set(definition.path, definition);
  return {
    get(path) {
      return (
        entries.get(path) ??
        createDynamicFillStopDefinition(path) ??
        createDynamicPropsDefinition(path)
      );
    },
    require(path) {
      const definition = this.get(path);
      if (!definition) throw new Error(`Unknown property path: ${path}`);
      return definition;
    },
    set(definition) {
      entries.set(definition.path, definition);
    },
    entries() {
      return [...entries.values()];
    },
  };
}

export function evaluateProperty(
  baseValue: JsonValue,
  track: PropertyTrack | undefined,
  time: number,
  definition: PropertyDefinition,
): JsonValue {
  if (!track || track.points.length === 0) return baseValue;
  const sorted = [...track.points].sort(
    (left, right) => left.time - right.time,
  );
  if (sorted.length === 1 || time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (time < start.time || time > end.time) continue;
    if (start.hold) return start.value;
    const duration = end.time - start.time;
    if (duration <= 0) return end.value;
    const progress = easeAnimationProgress(
      (time - start.time) / duration,
      start.easingToNext,
    );
    return interpolatePropertyValue(
      start.value,
      end.value,
      progress,
      definition,
    );
  }

  return last.value;
}

export const SHADOW_DEFAULTS: Required<ShadowEffect> = {
  enabled: true,
  x: 0,
  y: 4,
  blur: 4,
  spread: 0,
  color: "#000000",
  alpha: 25,
};

export const STROKE_DEFAULTS: Required<StrokeEffect> = {
  enabled: true,
  width: 1,
  color: "#000000",
  alpha: 100,
  position: "outside",
  start: 0,
  end: 1,
  style: "solid",
  spacing: 1,
};

export function readShadowRecord(
  object: FrameObject,
): Record<string, JsonValue> {
  const shadow = object.shadow ?? {};
  return {
    enabled: shadow.enabled ?? SHADOW_DEFAULTS.enabled,
    x: shadow.x ?? SHADOW_DEFAULTS.x,
    y: shadow.y ?? SHADOW_DEFAULTS.y,
    blur: shadow.blur ?? SHADOW_DEFAULTS.blur,
    spread: shadow.spread ?? SHADOW_DEFAULTS.spread,
    color: shadow.color ?? SHADOW_DEFAULTS.color,
    alpha: shadow.alpha ?? SHADOW_DEFAULTS.alpha,
  };
}

export function readStrokeRecord(
  object: FrameObject,
): Record<string, JsonValue> {
  const stroke = object.stroke ?? {};
  return {
    enabled: stroke.enabled ?? STROKE_DEFAULTS.enabled,
    width: stroke.width ?? STROKE_DEFAULTS.width,
    color: stroke.color ?? STROKE_DEFAULTS.color,
    alpha: stroke.alpha ?? STROKE_DEFAULTS.alpha,
    position: stroke.position ?? STROKE_DEFAULTS.position,
    start: stroke.start ?? STROKE_DEFAULTS.start,
    end: stroke.end ?? STROKE_DEFAULTS.end,
    style: stroke.style ?? STROKE_DEFAULTS.style,
    spacing: stroke.spacing ?? STROKE_DEFAULTS.spacing,
  };
}

export function hasShadowEffect(object: FrameObject): boolean {
  if (object.shadow) return true;
  if (!object.tracks) return false;
  for (const path of Object.keys(object.tracks)) {
    if (path.startsWith("shadow.")) return true;
  }
  return false;
}

export function hasStrokeEffect(object: FrameObject): boolean {
  if (object.stroke) return true;
  if (!object.tracks) return false;
  for (const path of Object.keys(object.tracks)) {
    if (path.startsWith("stroke.")) return true;
  }
  return false;
}

export function evaluateObjectState(
  object: FrameObject,
  time: number,
  registry: PropertyRegistry = defaultPropertyRegistry,
): EvaluatedObjectState {
  const includeShadow = hasShadowEffect(object);
  const includeStroke = hasStrokeEffect(object);
  let evaluated: EvaluatedObjectState = {
    ...object,
    bounds: { ...object.bounds },
    style: { ...object.style },
    transform: readRecord(object, "transform"),
    filter: readRecord(object, "filter"),
    shadow: includeShadow ? readShadowRecord(object) : {},
    stroke: includeStroke ? readStrokeRecord(object) : {},
    props: { ...(object.props ?? {}) },
  };

  for (const [path, track] of Object.entries(object.tracks ?? {})) {
    const definition = registry.get(path);
    if (!definition) continue;
    const baseValue = definition.getBaseValue(evaluated);
    evaluated = definition.setBaseValue(
      evaluated,
      evaluateProperty(baseValue, track, time, definition),
    ) as EvaluatedObjectState;
  }

  return evaluated;
}

export function evaluateCompositionState(
  composition: Part,
  time: number,
  registry: PropertyRegistry = defaultPropertyRegistry,
): EvaluatedCompositionState {
  return {
    ...composition,
    objects: composition.objects.map((object) =>
      evaluateObjectState(object, time, registry),
    ),
  };
}

/**
 * Proximity tolerance (seconds) used by every UI hit-test and every
 * keyframe writer to decide whether two times "land on the same
 * keyframe". 16 ms ≈ one 60 fps frame; well below the user's ability to
 * place two intentional keyframes one frame apart, well above the
 * sub-ms playhead jitter that would otherwise cause stacked-keyframe
 * artefacts on rapid commits.
 *
 * The hit-test (`findPropertyKeyframeIndexAtTime`) and the writer
 * (`upsertPropertyKeyframe`) MUST share this constant. Drift between
 * them produces UX where the diamond indicator says "keyframe at
 * playhead" but a commit creates a new keyframe next to the existing
 * one — the source of the original duplicate-keyframe stacks.
 */
export const propertyKeyframeTimeEpsilonSec = 0.016;

/**
 * Single source of truth for "is there a keyframe at this time?".
 * Returns the index of the nearest point within
 * `propertyKeyframeTimeEpsilonSec`, or -1 when none. Inspector
 * indicators, commit paths, removal, and toggle all route through this
 * so their notion of "same time" is identical.
 */
export function findPropertyKeyframeIndexAtTime(
  points: ReadonlyArray<{ time: number }>,
  time: number,
): number {
  let bestIndex = -1;
  let bestDist = propertyKeyframeTimeEpsilonSec;
  for (let i = 0; i < points.length; i += 1) {
    const dist = Math.abs(points[i].time - time);
    if (dist <= bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function upsertPropertyKeyframe(
  object: FrameObject,
  path: string,
  time: number,
  value: JsonValue,
  registry: PropertyRegistry = defaultPropertyRegistry,
): FrameObject {
  const definition = registry.require(path);
  const tracks = { ...(object.tracks ?? {}) };
  const existingTrack = tracks[path] ?? {
    valueType: definition.valueType,
    points: [],
  };
  const roundedTime = roundTime(time);
  const points = [...existingTrack.points];
  // Match within the same proximity tolerance the inspector hit-tester
  // uses (`findPropertyKeyframeIndexAtTime`). Without this, a commit at
  // a playhead within ±16 ms of an existing keyframe creates a new
  // keyframe right next to the existing one — the diamond indicator
  // says "keyframe at playhead" but the writer says "new keyframe",
  // and rapid commits stack a column of duplicates on the same time.
  // When matched, preserve the existing keyframe's time so it doesn't
  // drift on every commit.
  const existingIndex = findPropertyKeyframeIndexAtTime(points, time);
  if (existingIndex >= 0) {
    points[existingIndex] = { ...points[existingIndex], value };
  } else {
    points.push({
      id: `${object.id}:${path}:${roundedTime}`,
      time: roundedTime,
      value,
      easingToNext: "linear",
    });
  }
  tracks[path] = {
    valueType: existingTrack.valueType,
    points: points.sort((left, right) => left.time - right.time),
  };
  return { ...object, tracks };
}

export function setPropertyBaseValue(
  object: FrameObject,
  path: string,
  value: JsonValue,
  registry: PropertyRegistry = defaultPropertyRegistry,
): FrameObject {
  return registry.require(path).setBaseValue(object, value);
}

export function removePropertyKeyframe(
  object: FrameObject,
  path: string,
  time: number,
  currentTime: number,
  registry: PropertyRegistry = defaultPropertyRegistry,
): FrameObject {
  const track = object.tracks?.[path];
  if (!track) return object;
  const roundedTime = roundTime(time);
  const remainingPoints = track.points.filter(
    (point) => roundTime(point.time) !== roundedTime,
  );
  if (remainingPoints.length > 0) {
    return {
      ...object,
      tracks: {
        ...(object.tracks ?? {}),
        [path]: { ...track, points: remainingPoints },
      },
    };
  }

  const definition = registry.require(path);
  const preservedValue = evaluateProperty(
    definition.getBaseValue(object),
    track,
    currentTime,
    definition,
  );
  const nextObject = definition.setBaseValue(object, preservedValue);
  const nextTracks = { ...(nextObject.tracks ?? object.tracks ?? {}) };
  delete nextTracks[path];
  return {
    ...nextObject,
    tracks: Object.keys(nextTracks).length ? nextTracks : undefined,
  };
}

export function movePropertyKeyframe(
  object: FrameObject,
  path: string,
  fromTime: number,
  toTime: number,
): FrameObject {
  const track = object.tracks?.[path];
  if (!track) return object;
  const roundedFrom = roundTime(fromTime);
  const roundedTo = roundTime(toTime);
  return {
    ...object,
    tracks: {
      ...(object.tracks ?? {}),
      [path]: {
        ...track,
        points: track.points
          .map((point) =>
            roundTime(point.time) === roundedFrom
              ? {
                  ...point,
                  id: `${object.id}:${path}:${roundedTo}`,
                  time: roundedTo,
                }
              : point,
          )
          .sort((left, right) => left.time - right.time),
      },
    },
  };
}

function interpolateColor(
  from: JsonValue,
  to: JsonValue,
  progress: number,
): JsonValue {
  if (typeof from !== "string" || typeof to !== "string") return from;
  const c1 = parseRgba(from);
  const c2 = parseRgba(to);
  if (!c1 || !c2) return from;

  const r = Math.round(c1.r + (c2.r - c1.r) * progress);
  const g = Math.round(c1.g + (c2.g - c1.g) * progress);
  const b = Math.round(c1.b + (c2.b - c1.b) * progress);
  const a = c1.a + (c2.a - c1.a) * progress;

  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function parseRgba(value: string) {
  if (value.startsWith("#")) {
    const raw = value.slice(1);
    const hex =
      raw.length === 3
        ? raw
            .split("")
            .map((channel) => channel + channel)
            .join("")
        : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }
  const match = value.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] ? parseFloat(match[4]) : 1,
  };
}

function interpolatePropertyValue(
  from: JsonValue,
  to: JsonValue,
  progress: number,
  definition: PropertyDefinition,
): JsonValue {
  if (definition.interpolate) return definition.interpolate(from, to, progress);
  if (typeof from === "number" && typeof to === "number")
    return from + (to - from) * progress;
  return from;
}

const numberInterpolation = (
  from: JsonValue,
  to: JsonValue,
  progress: number,
) =>
  typeof from === "number" && typeof to === "number"
    ? from + (to - from) * progress
    : from;

function createBaseDefinition(
  path: PropertyPath,
  valueType: PropertyTrackValueType,
  getBaseValue: (object: FrameObject) => JsonValue,
  setBaseValue: (object: FrameObject, value: JsonValue) => FrameObject,
  group?: PropertyDefinition["group"],
): PropertyDefinition {
  return {
    path,
    valueType,
    group,
    getBaseValue,
    setBaseValue,
    interpolate:
      valueType === "number" || valueType === "length"
        ? numberInterpolation
        : undefined,
  };
}

function createBoundsDefinition(
  path: keyof Bounds,
  group: "position" | "size",
) {
  return createBaseDefinition(
    `bounds.${path}` as PropertyPath,
    "number",
    (object) => object.bounds[path],
    (object, value) => ({
      ...object,
      bounds: {
        ...object.bounds,
        [path]: typeof value === "number" ? value : object.bounds[path],
      },
    }),
    group,
  );
}

function createStyleDefinition(path: "opacity" | "color" | "backgroundColor") {
  const definition = createBaseDefinition(
    `style.${path}` as PropertyPath,
    path === "opacity" ? "number" : "color",
    (object) => object.style[path] ?? (path === "opacity" ? 1 : ""),
    (object, value) => ({
      ...object,
      style: {
        ...object.style,
        [path]:
          typeof value === "string" || typeof value === "number"
            ? value
            : object.style[path],
      },
    }),
    "style",
  );
  definition.interpolate =
    path === "opacity" ? numberInterpolation : interpolateColor;
  return definition;
}

function createTextStyleNumberDefinition(
  field: "fontSize" | "fontWeight" | "lineHeight" | "letterSpacing",
  defaultValue: number,
): PropertyDefinition {
  return {
    path: `style.${field}` as PropertyPath,
    valueType: "number",
    group: "style",
    defaultValue,
    getBaseValue: (object) => {
      const value = object.style[field];
      return typeof value === "number" ? value : defaultValue;
    },
    setBaseValue: (object, value) => ({
      ...object,
      style: {
        ...object.style,
        [field]:
          typeof value === "number"
            ? value
            : (object.style[field] ?? defaultValue),
      },
    }),
    interpolate: numberInterpolation,
  };
}

function createFontFamilyDefinition(): PropertyDefinition {
  return {
    path: "style.fontFamily",
    valueType: "discrete",
    group: "style",
    getBaseValue: (object) => object.style.fontFamily ?? "",
    setBaseValue: (object, value) => ({
      ...object,
      style: {
        ...object.style,
        fontFamily:
          typeof value === "string" ? value : (object.style.fontFamily ?? ""),
      },
    }),
  };
}

function createTransformDefinition(path: string, defaultValue: JsonValue) {
  return createBaseDefinition(
    `transform.${path}` as PropertyPath,
    "number",
    (object) => readRecord(object, "transform")[path] ?? defaultValue,
    (object, value) => ({
      ...object,
      transform: { ...readRecord(object, "transform"), [path]: value },
    }),
    "transform",
  );
}

function createFilterDefinition(path: string, defaultValue: JsonValue) {
  return createBaseDefinition(
    `filter.${path}` as PropertyPath,
    "number",
    (object) => readRecord(object, "filter")[path] ?? defaultValue,
    (object, value) => ({
      ...object,
      filter: { ...readRecord(object, "filter"), [path]: value },
    }),
    "filter",
  );
}

type ShadowField = "x" | "y" | "blur" | "spread" | "color" | "alpha";

function createShadowDefinition(
  field: ShadowField,
  valueType: PropertyTrackValueType,
): PropertyDefinition {
  const defaultValue = SHADOW_DEFAULTS[field] as JsonValue;
  const definition = createBaseDefinition(
    `shadow.${field}` as PropertyPath,
    valueType,
    (object) => {
      const shadow = object.shadow;
      if (!shadow) return defaultValue;
      const value = (shadow as Record<string, JsonValue>)[field];
      return value ?? defaultValue;
    },
    (object, value) => ({
      ...object,
      shadow: {
        ...(object.shadow ?? {}),
        [field]: value,
      } as ShadowEffect,
    }),
    "shadow",
  );
  if (valueType === "color") definition.interpolate = interpolateColor;
  return definition;
}

type StrokeField = "width" | "color" | "alpha" | "start" | "end" | "spacing";

function createStrokeDefinition(
  field: StrokeField,
  valueType: PropertyTrackValueType,
): PropertyDefinition {
  const defaultValue = STROKE_DEFAULTS[field] as JsonValue;
  const definition = createBaseDefinition(
    `stroke.${field}` as PropertyPath,
    valueType,
    (object) => {
      const stroke = object.stroke;
      if (!stroke) return defaultValue;
      const value = (stroke as Record<string, JsonValue>)[field];
      return value ?? defaultValue;
    },
    (object, value) => ({
      ...object,
      stroke: {
        ...(object.stroke ?? {}),
        [field]: value,
      } as StrokeEffect,
    }),
    "stroke",
  );
  if (valueType === "color") definition.interpolate = interpolateColor;
  return definition;
}

function createDynamicPropsDefinition(
  path: string,
): PropertyDefinition | undefined {
  if (!path.startsWith("props.")) return undefined;
  const segments = path.slice("props.".length).split(".");
  const readNested = (object: FrameObject): JsonValue => {
    let current: unknown = object.props ?? {};
    for (const segment of segments) {
      if (!current || typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[segment];
    }
    return (current ?? null) as JsonValue;
  };
  const writeNested = (object: FrameObject, value: JsonValue): FrameObject => {
    const root: Record<string, unknown> = { ...(object.props ?? {}) };
    let cursor: Record<string, unknown> = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      const existing = cursor[segment];
      const next =
        existing && typeof existing === "object" && !Array.isArray(existing)
          ? { ...(existing as Record<string, unknown>) }
          : {};
      cursor[segment] = next;
      cursor = next;
    }
    cursor[segments[segments.length - 1]] = value as unknown;
    return { ...object, props: root as FrameObject["props"] };
  };
  const valueType =
    path === "props.live" || path === "props.autoFocus.rackFocus"
      ? "boolean"
      : path === "props.autoFocus.targetId" || path === "props.autoFocus.ease"
        ? "discrete"
        : "number";
  // Treat numeric `props.*` leaves as number tracks so interpolation works.
  // Boolean props hold their previous value until the next keyframe.
  return {
    path: path as PropertyPath,
    valueType,
    group: "props",
    getBaseValue: readNested,
    setBaseValue: writeNested,
    interpolate: (from, to, progress) =>
      typeof from === "number" && typeof to === "number"
        ? from + (to - from) * progress
        : progress >= 1
          ? to
          : from,
  };
}

// --- Fill property definitions ---

export function getFillValue(object: FrameObject): FillValue {
  const raw = object.style.backgroundColor;
  if (isFillValue(raw)) return raw as unknown as FillValue;
  return parseCssToFillValue(typeof raw === "string" ? raw : "");
}

function setFillField(
  object: FrameObject,
  updater: (fill: FillValue) => FillValue,
): FrameObject {
  const fill = getFillValue(object);
  const next = updater(fill);
  return {
    ...object,
    style: {
      ...object.style,
      backgroundColor: next as unknown as string,
    },
  };
}

const FILL_NUMBER_FIELDS: Array<{
  key: keyof FillValue;
  default: number;
}> = [
  { key: "alpha", default: 100 },
  { key: "linearAngle", default: 135 },
  { key: "radialCenterX", default: 50 },
  { key: "radialCenterY", default: 50 },
  { key: "radialRadiusX", default: 50 },
  { key: "radialRadiusY", default: 50 },
  { key: "conicFromAngle", default: 0 },
  { key: "conicCenterX", default: 50 },
  { key: "conicCenterY", default: 50 },
  { key: "diamondCenterX", default: 50 },
  { key: "diamondCenterY", default: 50 },
  { key: "diamondRadiusX", default: 50 },
  { key: "diamondRadiusY", default: 50 },
  { key: "diamondRotation", default: 0 },
];

const FILL_DISCRETE_FIELDS: Array<{
  key: keyof FillValue;
  default: string | boolean;
}> = [
  { key: "mode", default: "solid" },
  { key: "gradientType", default: "linear" },
  { key: "repeating", default: false },
  { key: "colorSpace", default: "srgb" },
  { key: "radialShape", default: "circle" },
];

function createFillNumberDefinition(
  fieldKey: keyof FillValue,
  defaultValue: number,
): PropertyDefinition {
  const path = `style.fill.${fieldKey}` as PropertyPath;
  return {
    path,
    valueType: "number",
    group: "style",
    defaultValue,
    getBaseValue: (object) => {
      const fill = getFillValue(object);
      return (fill[fieldKey] as number) ?? defaultValue;
    },
    setBaseValue: (object, value) =>
      setFillField(object, (fill) => ({
        ...fill,
        [fieldKey]: typeof value === "number" ? value : fill[fieldKey],
      })),
    interpolate: numberInterpolation,
  };
}

function createFillDiscreteDefinition(
  fieldKey: keyof FillValue,
  defaultValue: JsonValue,
): PropertyDefinition {
  const path = `style.fill.${fieldKey}` as PropertyPath;
  return {
    path,
    valueType: "discrete",
    group: "style",
    defaultValue,
    getBaseValue: (object) => {
      const fill = getFillValue(object);
      return (fill[fieldKey] as JsonValue) ?? defaultValue;
    },
    setBaseValue: (object, value) =>
      setFillField(object, (fill) => ({
        ...fill,
        [fieldKey]: value as never,
      })),
  };
}

function createFillColorDefinition(): PropertyDefinition {
  const path = "style.fill.color" as PropertyPath;
  return {
    path,
    valueType: "color",
    group: "style",
    defaultValue: "#FFFFFF",
    getBaseValue: (object) => getFillValue(object).color,
    setBaseValue: (object, value) =>
      setFillField(object, (fill) => ({
        ...fill,
        color: typeof value === "string" ? value : fill.color,
      })),
    interpolate: interpolateColor,
  };
}

function createDynamicFillStopDefinition(
  path: string,
): PropertyDefinition | undefined {
  const match = path.match(
    /^style\.fill\.stops\[([^\]]+)\]\.(color|position|opacity)$/,
  );
  if (!match) return undefined;
  const stopId = match[1];
  const field = match[2] as "color" | "position" | "opacity";

  if (field === "color") {
    return {
      path: path as PropertyPath,
      valueType: "color",
      group: "style",
      defaultValue: "#FFFFFF",
      getBaseValue: (object) => {
        const fill = getFillValue(object);
        const stop = fill.stops.find((s) => s.id === stopId);
        return stop?.color ?? "#FFFFFF";
      },
      setBaseValue: (object, value) =>
        setFillField(object, (fill) => ({
          ...fill,
          stops: fill.stops.map((s) =>
            s.id === stopId
              ? { ...s, color: typeof value === "string" ? value : s.color }
              : s,
          ),
        })),
      interpolate: interpolateColor,
    };
  }

  const defaultVal = field === "position" ? 0 : 100;
  return {
    path: path as PropertyPath,
    valueType: "number",
    group: "style",
    defaultValue: defaultVal,
    getBaseValue: (object) => {
      const fill = getFillValue(object);
      const stop = fill.stops.find((s) => s.id === stopId);
      return stop?.[field] ?? defaultVal;
    },
    setBaseValue: (object, value) =>
      setFillField(object, (fill) => ({
        ...fill,
        stops: fill.stops.map((s) =>
          s.id === stopId
            ? { ...s, [field]: typeof value === "number" ? value : s[field] }
            : s,
        ),
      })),
    interpolate: numberInterpolation,
  };
}

export const fillPropertyDefinitions: PropertyDefinition[] = [
  createFillColorDefinition(),
  ...FILL_NUMBER_FIELDS.map((f) =>
    createFillNumberDefinition(f.key, f.default),
  ),
  ...FILL_DISCRETE_FIELDS.map((f) =>
    createFillDiscreteDefinition(f.key, f.default as JsonValue),
  ),
];

function readRecord(object: FrameObject, key: "transform" | "filter") {
  const value = (object as unknown as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function roundTime(time: number) {
  return Math.round(time * 1000) / 1000;
}

export const defaultPropertyDefinitions: PropertyDefinition[] = [
  createBoundsDefinition("x", "position"),
  createBoundsDefinition("y", "position"),
  createBoundsDefinition("width", "size"),
  createBoundsDefinition("height", "size"),
  createStyleDefinition("opacity"),
  createStyleDefinition("color"),
  createStyleDefinition("backgroundColor"),
  createTextStyleNumberDefinition("fontSize", 48),
  createTextStyleNumberDefinition("fontWeight", 400),
  createTextStyleNumberDefinition("lineHeight", 1.1),
  createTextStyleNumberDefinition("letterSpacing", 0),
  createFontFamilyDefinition(),
  ...fillPropertyDefinitions,
  createTransformDefinition("translateX", 0),
  createTransformDefinition("translateY", 0),
  createTransformDefinition("translateZ", 0),
  createTransformDefinition("scale", 1),
  createTransformDefinition("scaleX", 1),
  createTransformDefinition("scaleY", 1),
  createTransformDefinition("rotate", 0),
  createTransformDefinition("rotateX", 0),
  createTransformDefinition("rotateY", 0),
  createTransformDefinition("rotateZ", 0),
  createTransformDefinition("skewX", 0),
  createTransformDefinition("skewY", 0),
  createTransformDefinition("perspective", 0),
  createFilterDefinition("blur", 0),
  createShadowDefinition("x", "number"),
  createShadowDefinition("y", "number"),
  createShadowDefinition("blur", "number"),
  createShadowDefinition("spread", "number"),
  createShadowDefinition("color", "color"),
  createShadowDefinition("alpha", "number"),
  createStrokeDefinition("width", "number"),
  createStrokeDefinition("color", "color"),
  createStrokeDefinition("alpha", "number"),
  createStrokeDefinition("start", "number"),
  createStrokeDefinition("end", "number"),
  createStrokeDefinition("spacing", "number"),
];

export const defaultPropertyRegistry = createPropertyRegistry(
  defaultPropertyDefinitions,
);
