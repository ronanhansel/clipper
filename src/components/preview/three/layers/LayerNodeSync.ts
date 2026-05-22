import * as THREE from "three";
import type { CompositionClip, FrameObjectType } from "../../../../core/types";
import { evaluateObjectState } from "../../../../core/propertyRegistry";
import {
  getLayerNodeFactory,
  registerLayerNodeFactory,
  type LayerNode,
  type LayerNodeContext,
} from "./layerNodeRegistry";
import { rectNodeFactory } from "./nodes/rectNode";
import { nullNodeFactory } from "./nodes/nullNode";
import { imageNodeFactory, mediaNodeFactory } from "./nodes/imageNode";
import { textNodeFactory } from "./nodes/textNode";
import { svgNodeFactory } from "./nodes/svgNode";
import { createPerElementCaptureFactory } from "./nodes/perElementCaptureNode";

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
  registerLayerNodeFactory(mediaNodeFactory);
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

  constructor(context: LayerNodeContext) {
    installDefaultLayerNodeFactories();
    this.context = context;
    this.group = new THREE.Group();
    this.group.name = "LayerNodeSync";
  }

  sync(part: CompositionClip | null, localTime: number): void {
    const seen = new Set<string>();
    if (part) {
      let stackIndex = 0;
      for (const object of part.objects) {
        if (object.hidden) continue;
        if (object.type === "camera") continue;
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
        entry.node.update(state);
        applyLayerRenderSemantics(
          entry.node.object3D,
          stackIndex,
          isFlatLayer(state),
        );
        stackIndex += 1;
      }
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
