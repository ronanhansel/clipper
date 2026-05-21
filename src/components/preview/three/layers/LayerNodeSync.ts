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
import { imageNodeFactory } from "./nodes/imageNode";
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
