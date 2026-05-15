import { easeAnimationProgress } from "./animations";
import { type FillValue, isFillValue, parseCssToFillValue } from "./fillValue";
import type {
  Bounds,
  FrameObject,
  JsonValue,
  Part,
  PropertyTrack,
  PropertyTrackValueType,
} from "./types";

export type PropertyPath =
  | "bounds.x"
  | "bounds.y"
  | "bounds.width"
  | "bounds.height"
  | "style.opacity"
  | "style.color"
  | "style.backgroundColor"
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
  | `props.${string}`;

export type PropertyDefinition = {
  path: PropertyPath;
  valueType: PropertyTrackValueType;
  group?: "position" | "size" | "transform" | "filter" | "style" | "props";
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

export function evaluateObjectState(
  object: FrameObject,
  time: number,
  registry: PropertyRegistry = defaultPropertyRegistry,
): EvaluatedObjectState {
  let evaluated: EvaluatedObjectState = {
    ...object,
    bounds: { ...object.bounds },
    style: { ...object.style },
    transform: readRecord(object, "transform"),
    filter: readRecord(object, "filter"),
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
  const pointId = `${object.id}:${path}:${roundedTime}`;
  const points = [...existingTrack.points];
  const existingIndex = points.findIndex(
    (point) => roundTime(point.time) === roundedTime,
  );
  if (existingIndex >= 0) {
    points[existingIndex] = {
      ...points[existingIndex],
      time: roundedTime,
      value,
    };
  } else {
    points.push({
      id: pointId,
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
                  id: point.id ?? `${object.id}:${path}:${roundedTo}`,
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

function createDynamicPropsDefinition(
  path: string,
): PropertyDefinition | undefined {
  if (!path.startsWith("props.")) return undefined;
  const propName = path.slice("props.".length);
  return createBaseDefinition(
    path as PropertyPath,
    "custom",
    (object) => object.props?.[propName] ?? null,
    (object, value) => ({
      ...object,
      props: { ...(object.props ?? {}), [propName]: value },
    }),
    "props",
  );
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
];

export const defaultPropertyRegistry = createPropertyRegistry(
  defaultPropertyDefinitions,
);
