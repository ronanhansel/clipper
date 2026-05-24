import * as THREE from "three";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
  type FrameObject,
  type FrameObjectType,
  type LightObjectKind,
} from "../../../../core/types";
import { evaluateObjectState } from "../../../../core/propertyRegistry";
import {
  getLayerNodeFactory,
  registerLayerNodeFactory,
  type LayerNode,
  type LayerNodeContext,
} from "./layerNodeRegistry";
import { rectNodeFactory } from "./nodes/rectNode";
import { nullNodeFactory } from "./nodes/nullNode";
import { imageNodeFactory } from "./nodes/imageNode";
import { textNodeFactory } from "./nodes/textNode";
import { svgNodeFactory } from "./nodes/svgNode";
import { createPerElementCaptureFactory } from "./nodes/perElementCaptureNode";
import { resolveLightTargetFromTransform } from "../lightObjectTransform";
import {
  applyLayerLightingUniforms,
  createLayerLightingUniforms,
  EMPTY_LAYER_LIGHTING,
  type LayerLightingState,
  type LayerShadowState,
} from "./layerLighting";

/**
 * Register the default per-type Three node factories. Idempotent —
 * calling more than once replaces existing entries with the same kind.
 *
 * Native: rect, null, image, text, svg.
 * Per-element DOM capture: html, template, code, pattern2d,
 * custom-renderer (and any unknown future type via the default slot).
 * Each per-element capture node owns its own private canvas + texture
 * so overlapping 3D layers no longer share a 2D-flattened composite.
 */
let installed = false;
export function installDefaultLayerNodeFactories(): void {
  if (installed) return;
  installed = true;
  registerLayerNodeFactory(rectNodeFactory);
  registerLayerNodeFactory(nullNodeFactory);
  registerLayerNodeFactory(imageNodeFactory);
  registerLayerNodeFactory({
    kind: "media",
    create: imageNodeFactory.create,
  });
  registerLayerNodeFactory(textNodeFactory);
  registerLayerNodeFactory(svgNodeFactory);
  for (const kind of CAPTURE_FALLBACK_KINDS) {
    registerLayerNodeFactory(createPerElementCaptureFactory(kind));
  }
  registerLayerNodeFactory(createPerElementCaptureFactory("default"));
}

const CAPTURE_FALLBACK_KINDS: FrameObjectType[] = [
  "html",
  "template",
  "custom-renderer",
  "pattern2d",
  "code",
];

type Entry = {
  id: string;
  type: FrameObjectType;
  node: LayerNode;
};

const FLAT_LAYER_RENDER_ORDER_BASE = 100;

type MaterialDepthDefaults = {
  depthTest: boolean;
  depthWrite: boolean;
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
};

function isFlatLayer(state: ReturnType<typeof evaluateObjectState>): boolean {
  const transform = state.transform ?? {};
  return (
    readTransformNumber(transform.translateZ) === 0 &&
    readTransformNumber(transform.rotateX) === 0 &&
    readTransformNumber(transform.rotateY) === 0
  );
}

function readTransformNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function applyLayerRenderSemantics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root: any,
  stackIndex: number,
  flat: boolean,
): void {
  const renderOrder = FLAT_LAYER_RENDER_ORDER_BASE + stackIndex;
  root.renderOrder = renderOrder;
  if ("depthOffset" in root) {
    root.depthOffset = flat ? -stackIndex : 0;
  }
  if (typeof root.traverse === "function") {
    root.traverse((child: { renderOrder: number; material?: unknown }) => {
      child.renderOrder = renderOrder;
      if ("depthOffset" in child) {
        child.depthOffset = flat ? -stackIndex : 0;
      }
      applyMaterialDepthMode(child.material, stackIndex, flat);
    });
    return;
  }
  applyMaterialDepthMode(root.material, stackIndex, flat);
}

function applyMaterialDepthMode(
  material: unknown,
  stackIndex: number,
  flat: boolean,
): void {
  if (Array.isArray(material)) {
    for (const item of material)
      applySingleMaterialDepthMode(item, stackIndex, flat);
    return;
  }
  applySingleMaterialDepthMode(material, stackIndex, flat);
}

function applySingleMaterialDepthMode(
  material: unknown,
  stackIndex: number,
  flat: boolean,
): void {
  if (!isDepthMaterial(material)) return;
  const userData = (material.userData ??= {});
  const defaults =
    (userData.layerDepthDefaults as MaterialDepthDefaults | undefined) ??
    ({
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
      polygonOffset: material.polygonOffset,
      polygonOffsetFactor: material.polygonOffsetFactor,
      polygonOffsetUnits: material.polygonOffsetUnits,
    } satisfies MaterialDepthDefaults);
  userData.layerDepthDefaults = defaults;

  const nextDepthTest = defaults.depthTest;
  const nextDepthWrite = defaults.depthWrite;
  const nextPolygonOffset = flat ? true : defaults.polygonOffset;
  const nextPolygonOffsetFactor = flat ? 0 : defaults.polygonOffsetFactor;
  const nextPolygonOffsetUnits = flat
    ? -stackIndex
    : defaults.polygonOffsetUnits;
  if (
    material.depthTest === nextDepthTest &&
    material.depthWrite === nextDepthWrite &&
    material.polygonOffset === nextPolygonOffset &&
    material.polygonOffsetFactor === nextPolygonOffsetFactor &&
    material.polygonOffsetUnits === nextPolygonOffsetUnits
  ) {
    return;
  }
  material.depthTest = nextDepthTest;
  material.depthWrite = nextDepthWrite;
  material.polygonOffset = nextPolygonOffset;
  material.polygonOffsetFactor = nextPolygonOffsetFactor;
  material.polygonOffsetUnits = nextPolygonOffsetUnits;
  material.needsUpdate = true;
}

function isDepthMaterial(material: unknown): material is {
  depthTest: boolean;
  depthWrite: boolean;
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
  needsUpdate: boolean;
  userData?: Record<string, unknown>;
} {
  return (
    typeof material === "object" &&
    material !== null &&
    "depthTest" in material &&
    "depthWrite" in material &&
    "polygonOffset" in material &&
    "polygonOffsetFactor" in material &&
    "polygonOffsetUnits" in material
  );
}

/**
 * Reconciles the composition's evaluated objects against a Three.js
 * scene `Group` of native per-type nodes.
 */
export class LayerNodeSync {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly group: any;

  private readonly entries = new Map<string, Entry>();
  private readonly context: LayerNodeContext;
  private lighting: LayerLightingState = EMPTY_LAYER_LIGHTING;

  constructor(context: Omit<LayerNodeContext, "getLighting">) {
    installDefaultLayerNodeFactories();
    this.context = {
      ...context,
      getLighting: () => this.lighting,
    };
    this.group = new THREE.Group();
    this.group.name = "LayerNodeSync";
  }

  sync(
    part: CompositionClip | null,
    localTime: number,
    options: { isPlaying?: boolean } = {},
  ): void {
    const seen = new Set<string>();
    if (part) {
      this.lighting = buildLayerLightingState(part, localTime);
      let stackIndex = 0;
      for (const object of part.objects) {
        if (object.hidden) continue;
        if (object.type === "camera" || object.type === "light") continue;
        seen.add(object.id);

        let entry = this.entries.get(object.id);
        if (entry && entry.type !== object.type) {
          // Type changed mid-session (e.g. user converted a rect to a
          // text). Tear down and rebuild — node implementations differ
          // in geometry/material shape and can't morph in place.
          this.group.remove(entry.node.object3D);
          entry.node.dispose();
          this.entries.delete(object.id);
          entry = undefined;
        }
        if (!entry) {
          const factory = getLayerNodeFactory(object.type);
          if (!factory) continue;
          const node = factory.create(object, this.context);
          entry = { id: object.id, type: object.type, node };
          this.entries.set(object.id, entry);
          this.group.add(node.object3D);
        }

        const state = evaluateObjectState(object, localTime);
        entry.node.update(state, {
          localTime,
          isPlaying: options.isPlaying === true,
        });
        tagLayerObject(entry.node.object3D, object);
        applyLayerRenderSemantics(
          entry.node.object3D,
          stackIndex,
          isFlatLayer(state),
        );
        stackIndex += 1;
      }
    } else {
      this.lighting = EMPTY_LAYER_LIGHTING;
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.group.remove(entry.node.object3D);
      entry.node.dispose();
      this.entries.delete(id);
    }
  }

  describeForTests(): { id: string; type: FrameObjectType }[] {
    return Array.from(this.entries.values()).map((entry) => ({
      id: entry.id,
      type: entry.type,
    }));
  }

  applyShadow(shadow: LayerShadowState): void {
    this.lighting = {
      ...this.lighting,
      shadow,
    };
    for (const entry of this.entries.values()) {
      applyLightingToObject(entry.node.object3D, this.lighting);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.group.remove(entry.node.object3D);
      entry.node.dispose();
    }
    this.entries.clear();
  }

  dispose(): void {
    this.clear();
  }
}

function tagLayerObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root: any,
  object: FrameObject,
): void {
  root.userData.frameObjectId = object.id;
  root.userData.frameObjectType = object.type;
  if (typeof root.traverse !== "function") return;
  root.traverse(
    (child: { userData?: Record<string, unknown> }) =>
      (child.userData = {
        ...(child.userData ?? {}),
        frameObjectId: object.id,
        frameObjectType: object.type,
      }),
  );
}

function buildLayerLightingState(
  part: CompositionClip,
  localTime: number,
): LayerLightingState {
  const lights = part.objects
    .filter((object) => object.type === "light" && !object.hidden)
    .map((object) => lightStateFromObject(object, localTime))
    .filter((light) => light.intensity > 0);
  return {
    active: lights.length > 0,
    lights,
    shadow: EMPTY_LAYER_LIGHTING.shadow,
  };
}

function applyLightingToObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root: any,
  lighting: LayerLightingState,
): void {
  if (typeof root.traverse === "function") {
    root.traverse((child: { material?: unknown }) => {
      applyLightingToMaterial(child.material, lighting);
    });
    return;
  }
  applyLightingToMaterial(root.material, lighting);
}

function applyLightingToMaterial(
  material: unknown,
  lighting: LayerLightingState,
): void {
  if (Array.isArray(material)) {
    for (const item of material) applyLightingToMaterial(item, lighting);
    return;
  }
  const uniforms = getLayerLightingUniforms(material);
  if (!uniforms) return;
  applyLayerLightingUniforms(
    material as Parameters<typeof applyLayerLightingUniforms>[0],
    lighting,
  );
}

function getLayerLightingUniforms(
  material: unknown,
): ReturnType<typeof createLayerLightingUniforms> | null {
  if (
    typeof material === "object" &&
    material !== null &&
    typeof (material as { uniforms?: unknown }).uniforms === "object"
  ) {
    const uniforms = (material as { uniforms?: Record<string, unknown> })
      .uniforms;
    if (isLayerLightingUniforms(uniforms))
      return uniforms as ReturnType<typeof createLayerLightingUniforms>;
  }
  if (
    typeof material === "object" &&
    material !== null &&
    typeof (material as { userData?: unknown }).userData === "object"
  ) {
    const uniforms = (
      material as { userData?: { layerLightingUniforms?: unknown } }
    ).userData?.layerLightingUniforms;
    if (isLayerLightingUniforms(uniforms as Record<string, unknown>))
      return uniforms as ReturnType<typeof createLayerLightingUniforms>;
  }
  return null;
}

function isLayerLightingUniforms(
  uniforms: Record<string, unknown> | undefined,
) {
  return (
    uniforms?.u_lightingActive !== undefined &&
    uniforms?.u_shadowActive !== undefined
  );
}

function lightStateFromObject(object: FrameObject, localTime: number) {
  const evaluated = evaluateObjectState(object, localTime);
  const transform =
    evaluated.transform && typeof evaluated.transform === "object"
      ? evaluated.transform
      : {};
  const props = object.props ?? {};
  const kind = readLightKind(props.kind);
  const position = {
    x: evaluated.bounds.x - FRAME_WIDTH / 2 + evaluated.bounds.width / 2,
    y: -(evaluated.bounds.y - FRAME_HEIGHT / 2 + evaluated.bounds.height / 2),
    z:
      typeof transform.translateZ === "number" &&
      Number.isFinite(transform.translateZ)
        ? transform.translateZ
        : 0,
  };
  const fallbackTarget =
    props.target &&
    typeof props.target === "object" &&
    !Array.isArray(props.target)
      ? {
          x: readTargetNumber(props.target.x, 0),
          y: readTargetNumber(props.target.y, 0),
          z: readTargetNumber(props.target.z, 0),
        }
      : { x: 0, y: 0, z: 0 };
  return {
    kind,
    color: typeof props.color === "string" ? props.color : "#fff4d6",
    intensity:
      typeof props.intensity === "number" && Number.isFinite(props.intensity)
        ? props.intensity
        : 1,
    position,
    target: resolveLightTargetFromTransform(
      position,
      transform,
      fallbackTarget,
    ),
    range: readTargetNumber(props.range, 1200),
    angle: readTargetNumber(props.angle, 45),
    softness: readTargetNumber(props.softness, 0.25),
  };
}

function readLightKind(value: unknown): LightObjectKind {
  if (
    value === "ambient" ||
    value === "directional" ||
    value === "point" ||
    value === "spot"
  ) {
    return value;
  }
  return "directional";
}

function readTargetNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
