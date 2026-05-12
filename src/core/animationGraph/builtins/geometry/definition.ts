import { evaluateField } from "../../fields";
import type {
  AnimationGraphDiagnostic,
  AnimationGraphNodeDefinition,
  AnimationStream,
  AttributeContext,
  CompileContext,
  Field,
  FieldEvaluationContext,
  GeneratedGeometry,
  GeometryPath,
  GeometryPoint,
  GeometryShape,
  GeometryShapeGroup,
  StructureStream,
} from "../../types";
import {
  animationInputPort,
  animationOutputPort,
  cloneAnimationStream,
  defaultAnimationController,
  isAnimationStream,
  readNumber,
  readString,
} from "../helpers";

type Bounds = { x: number; y: number; width: number; height: number };
type GeometryConfig = Record<string, unknown>;
type GeometryStream = AnimationStream & {
  structure: Extract<StructureStream, { kind: "geometry" }>;
};

const geometryKinds = ["geometry"] as const;

const geometryBaseNodeDefinitions: AnimationGraphNodeDefinition[] = [
  primitive("geometry:rectangle", "Rectangle", rectangle),
  primitive("geometry:circle", "Circle", circle),
  primitive("geometry:ellipse", "Ellipse", ellipse),
  primitive("geometry:polygon", "Polygon", polygon),
  primitive("geometry:line", "Line", line),
  primitive("geometry:path", "Path", path),
  primitive("geometry:star", "Star", star),
  primitive("geometry:grid", "Grid", grid as never),
  transform("geometry:translate", "Translate", (point, config, item) => ({
    ...point,
    x: point.x + fieldNumber(config, "x", item, 0),
    y: point.y + fieldNumber(config, "y", item, 0),
  })),
  transform("geometry:rotate", "Rotate", (point, config, item) => {
    const angle = (fieldNumber(config, "angle", item, 0) * Math.PI) / 180;
    const pivot = readPivot(config);
    const x = point.x - pivot.x;
    const y = point.y - pivot.y;
    return {
      ...point,
      x: pivot.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: pivot.y + x * Math.sin(angle) + y * Math.cos(angle),
    };
  }),
  transform("geometry:scale", "Scale", (point, config, item) => {
    const sx = fieldNumber(config, "x", item, readNumber(config, "scale", 1));
    const sy = fieldNumber(config, "y", item, sx);
    const pivot = readPivot(config);
    return {
      ...point,
      x: pivot.x + (point.x - pivot.x) * sx,
      y: pivot.y + (point.y - pivot.y) * sy,
    };
  }),
  transform("geometry:align", "Align", (point, config, item, stream) => ({
    ...point,
    x: point.x + fieldNumber(config, "x", item, stream.structure.bounds.x),
    y: point.y + fieldNumber(config, "y", item, stream.structure.bounds.y),
  })),
  transform("geometry:distribute", "Distribute", (point, config, item) => ({
    ...point,
    x: point.x + (item.index ?? 0) * readNumber(config, "x", 0),
    y: point.y + (item.index ?? 0) * readNumber(config, "y", 0),
  })),
  transform("geometry:randomize", "Randomize", (point, config, item) => {
    const amount = readNumber(config, "amount", 10);
    const r = seeded(
      `${readString(config, "seed", "geometry")}:${item.index ?? 0}`,
    );
    return {
      ...point,
      x: point.x + (r - 0.5) * amount,
      y: point.y + (seeded(`y:${r}`) - 0.5) * amount,
    };
  }),
  pathOp("geometry:trimPath", "Trim Path", (path, config) =>
    trimPath(
      path,
      readNumber(config, "start", 0),
      readNumber(config, "end", 1),
    ),
  ),
  pathOp("geometry:offsetPath", "Offset Path", (path, config) => ({
    ...path,
    points: path.points.map((point) => ({
      ...point,
      x: point.x + (point.normal?.x ?? 0) * readNumber(config, "amount", 0),
      y: point.y + (point.normal?.y ?? 0) * readNumber(config, "amount", 0),
    })),
  })),
  pathOp("geometry:reversePath", "Reverse Path", (path) => ({
    ...path,
    points: [...path.points].reverse(),
  })),
  pathOp("geometry:subdividePath", "Subdivide Path", (path, config) =>
    resamplePath(
      path,
      Math.max(
        2,
        path.points.length *
          Math.max(1, Math.round(readNumber(config, "steps", 2))),
      ),
    ),
  ),
  pathOp("geometry:resamplePath", "Resample Path", (path, config) =>
    resamplePath(
      path,
      Math.max(2, Math.round(readNumber(config, "count", 32))),
    ),
  ),
  pathOp("geometry:dashPath", "Dash Path", (path, config) =>
    trimPath(
      path,
      0,
      Math.max(0, Math.min(1, readNumber(config, "duty", 0.5))),
    ),
  ),
  pathOp("geometry:strokeWidth", "Stroke Width", (path, config) => ({
    ...path,
    strokeWidth: readNumber(config, "width", 1),
  })),
  transform("geometry:deformPoints", "Point Deform", (point, config, item) => ({
    ...point,
    x: point.x + fieldNumber(config, "x", item, 0),
    y: point.y + fieldNumber(config, "y", item, 0),
  })),
];

function primitive(
  kind: string,
  label: string,
  create: (
    config: GeometryConfig,
    source: AnimationStream,
    context: CompileContext,
  ) => GeneratedGeometry,
): AnimationGraphNodeDefinition {
  return {
    kind,
    label,
    category: "control",
    menuPath: `Geometry:Primitives:${label}`,
    controls: [
      {
        id: "geometry",
        fields: [
          { key: "width", label: "width", type: "number", defaultValue: 100 },
          { key: "height", label: "height", type: "number", defaultValue: 100 },
          { key: "points", label: "points", type: "number", defaultValue: 5 },
          {
            key: "color",
            label: "color",
            type: "color",
            defaultValue: "#ffffff",
          },
          { key: "opacity", label: "opacity", type: "number", defaultValue: 1 },
        ],
      },
    ],
    getPorts: () => [
      animationInputPort("in", "In"),
      animationOutputPort("out", "Out", geometryKinds),
    ],
    createDefaultConfig: () => ({}),
    normalizeConfig: (config) =>
      typeof config === "object" && config ? config : {},
    execute: ({ node, inputs }, context) => {
      const diagnostics: AnimationGraphDiagnostic[] = [];
      const output = (inputs.get("in") ?? [])
        .filter(isAnimationStream)
        .flatMap((input, index) => {
          const geometry = create(
            node.config as GeometryConfig,
            input,
            context,
          );
          return cloneAnimationStream(
            input,
            `${node.id}:out:${index}`,
            geometryStructure(input.structure.objectId, geometry, "shape"),
          );
        });
      if (!output.length)
        diagnostics.push({
          severity: "error",
          message: `Geometry primitive "${kind}" requires Source input.`,
          nodeId: node.id,
          portId: "in",
        });
      return {
        outputs: new Map([["out", output]]),
        diagnostics,
      };
    },
  };
}

function transform(
  kind: string,
  label: string,
  mapPoint: (
    point: GeometryPoint,
    config: GeometryConfig,
    item: AttributeContext,
    stream: AnimationStream & {
      structure: Extract<StructureStream, { kind: "geometry" }>;
    },
  ) => GeometryPoint,
): AnimationGraphNodeDefinition {
  return pipe(
    kind,
    label,
    (input, config, context) =>
      mapGeometry(input, (point, index, count, stream) =>
        mapPoint(
          point,
          config,
          pointItem(point, index, count, stream, context),
          stream,
        ),
      ),
    `Geometry:Transform:${label}`,
  );
}

function pathOp(
  kind: string,
  label: string,
  mapPath: (path: GeometryPath, config: GeometryConfig) => GeometryPath,
): AnimationGraphNodeDefinition {
  return pipe(
    kind,
    label,
    (input, config) =>
      mapGeometry(
        input,
        (_point) => _point,
        (path) => mapPath(path, config),
      ),
    `Geometry:Path:${label}`,
  );
}

function pipe(
  kind: string,
  label: string,
  mutate: (
    stream: AnimationStream & {
      structure: Extract<StructureStream, { kind: "geometry" }>;
    },
    config: GeometryConfig,
    context: CompileContext,
  ) => GeneratedGeometry,
  menuPath?: string,
): AnimationGraphNodeDefinition {
  return {
    kind,
    label,
    category: "control",
    menuPath,
    getPorts: () => [
      animationInputPort("in", "In", geometryKinds),
      animationOutputPort("out", "Out", geometryKinds),
    ],
    createDefaultConfig: () => ({}),
    normalizeConfig: (config) =>
      typeof config === "object" && config ? config : {},
    execute: ({ node, inputs }, context) => {
      const diagnostics: AnimationGraphDiagnostic[] = [];
      const output = (inputs.get("in") ?? [])
        .filter(isAnimationStream)
        .flatMap((input, index) => {
          if (!isGeometryStream(input)) {
            diagnostics.push({
              severity: "error",
              message: `Geometry node "${kind}" requires geometry input.`,
              nodeId: node.id,
              portId: "in",
            });
            return [];
          }
          return cloneGeometryStream(
            input,
            `${node.id}:out:${index}`,
            mutate(input as never, node.config as GeometryConfig, context),
          );
        });
      return { outputs: new Map([["out", output]]), diagnostics };
    },
  };
}

const pointsOnPathDefinition = pipe(
  "geometry:pointsOnPath",
  "Points On Path",
  (input, config) => {
    const count = Math.max(2, Math.round(readNumber(config, "count", 16)));
    const paths = allPaths(input.structure.geometry).map((item) =>
      resamplePath(item, count),
    );
    return group(paths.map((path) => ({ type: "shape", paths: [path] })));
  },
  "Geometry:Points:Points On Path",
);

const instanceDefinition: AnimationGraphNodeDefinition = {
  kind: "geometry:instanceOnPoints",
  label: "Instance On Points",
  category: "control",
  menuPath: "Geometry:Points:Instance On Points",
  getPorts: () => [
    animationInputPort("shape", "Shape", geometryKinds),
    animationInputPort("points", "Points", geometryKinds),
    animationOutputPort("out", "Out", geometryKinds),
  ],
  createDefaultConfig: () => ({ orientToTangent: true }),
  normalizeConfig: (config) =>
    typeof config === "object" && config ? config : {},
  execute: ({ node, inputs }, context) => {
    const source = (inputs.get("shape") ?? [])
      .filter(isAnimationStream)
      .find(isGeometryStream);
    const points = (inputs.get("points") ?? [])
      .filter(isAnimationStream)
      .find(isGeometryStream);
    if (!source || !points) return { outputs: new Map([["out", []]]) };
    const shape = firstShape(source.structure.geometry);
    const pointList = allPaths(points.structure.geometry).flatMap(
      (item) => item.points,
    );
    const geometry: GeometryShapeGroup = {
      type: "shapeGroup",
      shapes: [],
      instances: pointList.map((point, index) => ({
        shape,
        position: { x: point.x, y: point.y },
        rotation:
          (node.config as GeometryConfig).orientToTangent === false
            ? 0
            : Math.atan2(point.tangent?.y ?? 0, point.tangent?.x ?? 1),
        scale: fieldNumber(
          node.config as GeometryConfig,
          "scale",
          {
            ...pointItem(
              point,
              index,
              pointList.length,
              points as never,
              context,
            ),
            custom: point.attributes,
          },
          1,
          context,
        ),
        color: String(
          fieldValue(
            node.config as GeometryConfig,
            "color",
            pointItem(point, index, pointList.length, points as never, context),
            shape.color ?? "#ffffff",
            context,
          ),
        ),
      })),
    };
    return {
      outputs: new Map([
        ["out", [cloneGeometryStream(points, `${node.id}:out:0`, geometry)]],
      ]),
    };
  },
};

const collectDefinition: AnimationGraphNodeDefinition = {
  kind: "geometry:collect",
  label: "Collect Geometry",
  category: "control",
  menuPath: "Geometry:Collection:Collect Geometry",
  getPorts: () => [
    animationInputPort("in", "In", geometryKinds, undefined, "multi"),
    animationOutputPort("out", "Out", geometryKinds),
  ],
  createDefaultConfig: () => ({}),
  normalizeConfig: () => ({}),
  execute: ({ node, inputs }) => {
    const diagnostics: AnimationGraphDiagnostic[] = [];
    const streams = (inputs.get("in") ?? []).filter(isAnimationStream);
    const shapes = streams.filter(isAnimationStream).flatMap((input) => {
      if (input.structure.kind !== "geometry") {
        diagnostics.push({
          severity: "error",
          message: `Geometry collect cannot merge "${input.structure.kind}" stream.`,
          nodeId: node.id,
          portId: "in",
        });
        return [];
      }
      return input.structure.geometry.type === "shapeGroup"
        ? input.structure.geometry.shapes
        : [firstShape(input.structure.geometry)];
    });
    const instances = streams.flatMap((input) =>
      input.structure.kind === "geometry" &&
      input.structure.geometry.type === "shapeGroup"
        ? (input.structure.geometry.instances ?? [])
        : [],
    );
    return {
      outputs: new Map([
        [
          "out",
          [
            stream(
              node.id,
              firstGeometryObjectId(streams, node.id),
              group(shapes, instances),
              "shape",
            ),
          ],
        ],
      ]),
      diagnostics,
    };
  },
};

export const geometryNodeDefinitions: AnimationGraphNodeDefinition[] = [
  ...geometryBaseNodeDefinitions,
  pointsOnPathDefinition,
  instanceDefinition,
  collectDefinition,
  {
    ...collectDefinition,
    kind: "geometry:merge",
    label: "Merge Geometry",
    menuPath: "Geometry:Collection:Merge Geometry",
  },
  {
    ...collectDefinition,
    kind: "geometry:group",
    label: "Group Geometry",
    menuPath: "Geometry:Collection:Group Geometry",
  },
];

function rectangle(config: GeometryConfig): GeometryShape {
  const w = readNumber(config, "width", 100),
    h = readNumber(config, "height", 100);
  return shape(
    [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 },
    ],
    true,
    config,
  );
}
function circle(config: GeometryConfig) {
  return ellipse({
    ...config,
    width: readNumber(config, "radius", 50) * 2,
    height: readNumber(config, "radius", 50) * 2,
  });
}
function ellipse(config: GeometryConfig): GeometryShape {
  return polygon({
    ...config,
    points: readNumber(config, "points", 32),
    radiusX: readNumber(config, "width", 100) / 2,
    radiusY: readNumber(config, "height", 100) / 2,
  });
}
function polygon(config: GeometryConfig): GeometryShape {
  const count = Math.max(3, Math.round(readNumber(config, "points", 5)));
  const rx = readNumber(config, "radiusX", readNumber(config, "radius", 50));
  const ry = readNumber(config, "radiusY", rx);
  return shape(
    Array.from({ length: count }, (_, index) => ({
      x: Math.cos((index / count) * Math.PI * 2 - Math.PI / 2) * rx,
      y: Math.sin((index / count) * Math.PI * 2 - Math.PI / 2) * ry,
    })),
    true,
    config,
  );
}
function line(config: GeometryConfig): GeometryPath {
  return pathWithNormals(
    [
      { x: readNumber(config, "x1", 0), y: readNumber(config, "y1", 0) },
      { x: readNumber(config, "x2", 100), y: readNumber(config, "y2", 0) },
    ],
    false,
  );
}
function path(config: GeometryConfig): GeometryPath {
  return pathWithNormals(
    Array.isArray(config.points)
      ? (config.points as GeometryPoint[])
      : line(config).points,
    false,
  );
}
function star(config: GeometryConfig): GeometryShape {
  const count = Math.max(2, Math.round(readNumber(config, "points", 5))) * 2;
  return shape(
    Array.from({ length: count }, (_, index) => {
      const radius =
        index % 2
          ? readNumber(config, "innerRadius", 25)
          : readNumber(config, "outerRadius", 50);
      return {
        x: Math.cos((index / count) * Math.PI * 2 - Math.PI / 2) * radius,
        y: Math.sin((index / count) * Math.PI * 2 - Math.PI / 2) * radius,
      };
    }),
    true,
    config,
  );
}
function grid(config: GeometryConfig): GeometryShapeGroup {
  const columns = Math.max(1, Math.round(readNumber(config, "columns", 3))),
    rows = Math.max(1, Math.round(readNumber(config, "rows", 3)));
  const spacingX = readNumber(config, "spacingX", 40),
    spacingY = readNumber(config, "spacingY", 40);
  return group(
    Array.from({ length: columns * rows }, (_, index) =>
      shape(
        [
          {
            x: (index % columns) * spacingX,
            y: Math.floor(index / columns) * spacingY,
          },
        ],
        false,
        config,
      ),
    ),
  );
}
function shape(
  points: GeometryPoint[],
  closed: boolean,
  config: GeometryConfig,
): GeometryShape {
  return {
    type: "shape",
    paths: [pathWithNormals(points, closed)],
    color: readString(config, "color", "#ffffff"),
    opacity: readNumber(config, "opacity", 1),
  };
}
function group(
  shapes: GeometryShape[],
  instances?: GeometryShapeGroup["instances"],
): GeometryShapeGroup {
  return {
    type: "shapeGroup",
    shapes,
    ...(instances?.length ? { instances } : {}),
  };
}
function stream(
  nodeId: string,
  objectId: string,
  geometry: GeneratedGeometry,
  domain: "shape",
): AnimationStream {
  return {
    id: `${nodeId}:out:geometry`,
    structure: geometryStructure(objectId, geometry, domain),
    controller: { ...defaultAnimationController },
    effects: [],
  };
}
function cloneGeometryStream(
  input: GeometryStream,
  id: string,
  geometry: GeneratedGeometry,
) {
  return cloneAnimationStream(
    input,
    id,
    geometryStructure(
      input.structure.objectId,
      geometry,
      geometryDomain(input.structure.domain),
    ),
  );
}
function isGeometryStream(stream: AnimationStream): stream is GeometryStream {
  return stream.structure.kind === "geometry";
}
function firstGeometryObjectId(
  streams: readonly AnimationStream[],
  fallback: string,
) {
  const geometry = streams.find(isGeometryStream);
  return geometry?.structure.objectId ?? fallback;
}
function geometryDomain(domain: string) {
  return domain === "pathPoint" ||
    domain === "pathSegment" ||
    domain === "contour" ||
    domain === "instance"
    ? domain
    : "shape";
}
function geometryStructure(
  objectId: string,
  geometry: GeneratedGeometry,
  domain: "shape" | "pathPoint" | "pathSegment" | "contour" | "instance",
): Extract<StructureStream, { kind: "geometry" }> {
  const paths = allPaths(geometry);
  const bounds = boundsOf(paths.flatMap((item) => item.points));
  return {
    kind: "geometry",
    objectId,
    structureType: geometry.type,
    domain,
    geometry,
    bounds,
    pointCount: paths.reduce((sum, item) => sum + item.points.length, 0),
    segmentCount: paths.reduce(
      (sum, item) =>
        sum + Math.max(0, item.points.length - (item.closed ? 0 : 1)),
      0,
    ),
  };
}
function allPaths(geometry: GeneratedGeometry): GeometryPath[] {
  if (geometry.type === "path") return [geometry];
  if (geometry.type === "shape") return geometry.paths;
  if (geometry.type === "shapeGroup")
    return [
      ...geometry.shapes.flatMap((item) => item.paths),
      ...(geometry.instances ?? []).flatMap((instance) =>
        instancePaths(instance),
      ),
    ];
  return [{ type: "path", points: geometry.vertices }];
}
function instancePaths(
  instance: NonNullable<GeometryShapeGroup["instances"]>[number],
) {
  const paths =
    instance.shape.type === "path" ? [instance.shape] : instance.shape.paths;
  const scale = instance.scale ?? 1;
  const rotation = instance.rotation ?? 0;
  const cos = Math.cos(rotation),
    sin = Math.sin(rotation);
  return paths.map((path) =>
    pathWithNormals(
      path.points.map((point) => ({
        ...point,
        x: instance.position.x + (point.x * cos - point.y * sin) * scale,
        y: instance.position.y + (point.x * sin + point.y * cos) * scale,
      })),
      path.closed,
    ),
  );
}
function firstShape(geometry: GeneratedGeometry): GeometryShape {
  return geometry.type === "shape"
    ? geometry
    : geometry.type === "shapeGroup"
      ? (geometry.shapes[0] ?? shape([], false, {}))
      : {
          type: "shape",
          paths:
            geometry.type === "path"
              ? [geometry]
              : [{ type: "path", points: geometry.vertices }],
        };
}
function mapGeometry(
  input: AnimationStream & {
    structure: Extract<StructureStream, { kind: "geometry" }>;
  },
  mapPoint: (
    point: GeometryPoint,
    index: number,
    count: number,
    stream: AnimationStream & {
      structure: Extract<StructureStream, { kind: "geometry" }>;
    },
  ) => GeometryPoint,
  mapPath: (path: GeometryPath) => GeometryPath = (path) => path,
): GeneratedGeometry {
  const mapPaths = (paths: GeometryPath[]) =>
    paths.map((path) =>
      mapPath({
        ...path,
        points: path.points.map((point, index) =>
          mapPoint(point, index, path.points.length, input),
        ),
      }),
    );
  const geometry = input.structure.geometry;
  if (geometry.type === "path") return mapPaths([geometry])[0];
  if (geometry.type === "shape")
    return { ...geometry, paths: mapPaths(geometry.paths) };
  if (geometry.type === "shapeGroup")
    return {
      ...geometry,
      shapes: geometry.shapes.map((item) => ({
        ...item,
        paths: mapPaths(item.paths),
      })),
    };
  return {
    ...geometry,
    vertices: geometry.vertices.map((point, index) =>
      mapPoint(point, index, geometry.vertices.length, input),
    ),
  };
}
function pathWithNormals(
  points: GeometryPoint[],
  closed = false,
): GeometryPath {
  const next = points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)] ?? point;
    const after = points[Math.min(points.length - 1, index + 1)] ?? point;
    const dx = after.x - prev.x,
      dy = after.y - prev.y,
      length = Math.hypot(dx, dy) || 1;
    return {
      ...point,
      tangent: { x: dx / length, y: dy / length },
      normal: { x: -dy / length, y: dx / length },
    };
  });
  return { type: "path", points: next, closed };
}
function trimPath(
  path: GeometryPath,
  start: number,
  end: number,
): GeometryPath {
  const source = resamplePath(path, Math.max(2, path.points.length * 16));
  const points = source.points.slice(
    Math.floor(clamp(start) * source.points.length),
    Math.max(2, Math.ceil(clamp(end) * source.points.length)),
  );
  return pathWithNormals(points, false);
}
function resamplePath(path: GeometryPath, count: number): GeometryPath {
  if (path.points.length < 2) return path;
  return pathWithNormals(
    Array.from({ length: count }, (_, index) => {
      const t = index / Math.max(1, count - 1);
      const scaled = t * (path.points.length - 1);
      const a = path.points[Math.floor(scaled)]!,
        b = path.points[Math.min(path.points.length - 1, Math.ceil(scaled))]!;
      const f = scaled - Math.floor(scaled);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }),
    path.closed,
  );
}
function boundsOf(points: GeometryPoint[]): Bounds {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}
function pointItem(
  point: GeometryPoint,
  index: number,
  count: number,
  stream: AnimationStream & {
    structure: Extract<StructureStream, { kind: "geometry" }>;
  },
  context?: CompileContext,
): AttributeContext {
  return {
    objectId: stream.structure.objectId,
    index,
    count,
    time: context?.time ?? stream.controller.start + stream.controller.delay,
    position: { x: point.x, y: point.y },
    tangent: point.tangent,
    normal: point.normal,
    bounds: stream.structure.bounds,
    custom: { ...point.attributes, frame: context?.frame },
  };
}
function fieldValue(
  config: GeometryConfig,
  key: string,
  item: AttributeContext,
  fallback: unknown,
  context?: CompileContext,
) {
  const value = config[key];
  if (typeof value === "object" && value && "kind" in value)
    return (
      evaluateField(value as Field, fieldContext("pathPoint", item, context))
        .values[0] ?? fallback
    );
  return value ?? fallback;
}
function fieldNumber(
  config: GeometryConfig,
  key: string,
  item: AttributeContext,
  fallback: number,
  context?: CompileContext,
) {
  const value = fieldValue(config, key, item, fallback, context);
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function fieldContext(
  domain: FieldEvaluationContext["domain"],
  item: AttributeContext,
  context?: CompileContext,
): FieldEvaluationContext {
  return { domain, items: [item], time: context?.time, frame: context?.frame };
}
function readPivot(config: GeometryConfig) {
  return {
    x: readNumber(config, "pivotX", 0),
    y: readNumber(config, "pivotY", 0),
  };
}
function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
function seeded(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}
