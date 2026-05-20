import * as THREE from "three";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import type { LayerNode, LayerNodeFactory } from "../layerNodeRegistry";

class NullNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;

  constructor(id: string) {
    // An empty Group — present in the scene graph for parent/lookup
    // semantics, but contributes no pixels and no depth. Matches DOM
    // behaviour where `null` layers are an authoring crosshair only.
    this.object3D = new THREE.Group();
    this.object3D.name = `NullNode:${id}`;
    this.object3D.visible = false;
  }

  update(_state: EvaluatedObjectState): void {
    // No-op. Null layers don't render through the camera.
  }

  dispose(): void {
    // Nothing owned.
  }
}

export const nullNodeFactory: LayerNodeFactory = {
  kind: "null",
  create(object: FrameObject) {
    return new NullNode(object.id);
  },
};
