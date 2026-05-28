import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  CSS3DRenderer,
  CSS3DObject,
} from "three/examples/jsm/renderers/CSS3DRenderer.js";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type LightObjectKind,
} from "../../../core/types";
import { applyCompositionCameraToThree } from "./compositionCameraThree";
import { getCameraObjectPropsSignature } from "./cameraObjectSignature";
import {
  CameraPathOverlay,
  type CameraPathData,
  type CameraPathHandle,
} from "./cameraPathOverlay";
import { FrustumOutline } from "./FrustumOutline";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const DEFAULT_ORBIT_DISTANCE = 2400;

export interface ThreeAuthorSceneOptions {
  width: number;
  height: number;
}

export type ThreeAuthorPickableObject = {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  transform: Record<string, unknown>;
};

export type ThreeAuthorCameraObject = {
  id: string;
  props: CameraObjectProps;
  active: boolean;
  selected: boolean;
};

export type ThreeAuthorLightObject = {
  id: string;
  kind: LightObjectKind;
  color: string;
  intensity: number;
  range: number;
  angle: number;
  softness: number;
  debug: boolean;
  showRange: boolean;
  selected: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  transform: Record<string, unknown>;
  target: { x: number; y: number; z: number };
};

export type ThreeAuthorObjectTransformUpdate = {
  bounds?: { x: number; y: number };
  translateZ?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
};

export type ThreeOrbitState = {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
};

/**
 * Remove named handles from a `TransformControls` gizmo so the user
 * only sees the three axis bounds. Targets both the visible gizmo and
 * the invisible picker mesh — leaving picker handles in place would
 * keep their hover regions live even after the visuals are gone.
 *
 * `TransformControls.updateMatrixWorld` rewrites `handle.visible` every
 * frame, so toggling visibility doesn't stick. Detaching the children
 * and disposing their geometry is the only durable fix.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pruneGizmoHandles(controls: any, mode: string, names: string[]) {
  const banned = new Set(names);
  const targets = [
    controls._gizmo?.gizmo?.[mode],
    controls._gizmo?.picker?.[mode],
  ];
  for (const group of targets) {
    if (!group) continue;
    const removed = group.children.filter((child: { name: string }) =>
      banned.has(child.name),
    );
    for (const child of removed) {
      group.remove(child);
      (child as { geometry?: { dispose?: () => void } }).geometry?.dispose?.();
    }
  }
}

function createCameraBodyGroup(color: number, opacity: number) {
  const cameraBodyGroup = new THREE.Group();
  cameraBodyGroup.userData.clipperCameraBody = true;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(60, 45, 80),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
    }),
  );
  body.userData.clipperCameraBody = true;
  cameraBodyGroup.add(body);
  const lens = new THREE.Mesh(
    new THREE.ConeGeometry(22, 45, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, opacity + 0.05),
    }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, -55);
  lens.userData.clipperCameraBody = true;
  cameraBodyGroup.add(lens);
  return cameraBodyGroup;
}

function createLightVisualGroup(color: number, opacity: number) {
  const group = new THREE.Group();
  group.userData.clipperLightVisual = true;
  const bodyGroup = new THREE.Group();
  bodyGroup.name = "lightBody";
  group.add(bodyGroup);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(26, 24, 12),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
    }),
  );
  core.userData.clipperLightVisual = true;
  core.userData.clipperLightPickable = true;
  bodyGroup.add(core);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(38, 2, 8, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, opacity + 0.1),
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.userData.clipperLightVisual = true;
  ring.userData.clipperLightPickable = true;
  bodyGroup.add(ring);

  const directionLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, opacity + 0.12),
    }),
  );
  directionLine.name = "lightDirectionLine";
  directionLine.userData.clipperLightVisual = true;
  group.add(directionLine);

  const arrowHead = new THREE.Mesh(
    new THREE.ConeGeometry(14, 38, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, opacity + 0.16),
    }),
  );
  arrowHead.name = "lightDirectionArrow";
  arrowHead.userData.clipperLightVisual = true;
  group.add(arrowHead);

  const beamCone = new THREE.Mesh(
    new THREE.ConeGeometry(110, 260, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(0.22, opacity * 0.22),
      wireframe: true,
      depthWrite: false,
    }),
  );
  beamCone.name = "lightBeamCone";
  beamCone.userData.clipperLightVisual = true;
  group.add(beamCone);

  const pointRange = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(0.2, opacity * 0.2),
      wireframe: true,
      depthWrite: false,
    }),
  );
  pointRange.name = "lightPointRange";
  pointRange.userData.clipperLightVisual = true;
  group.add(pointRange);

  const ambientField = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(0.16, opacity * 0.16),
      wireframe: true,
      depthWrite: false,
    }),
  );
  ambientField.name = "lightAmbientField";
  ambientField.userData.clipperLightVisual = true;
  group.add(ambientField);

  const rayMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: Math.min(0.72, opacity),
  });
  for (const points of [
    [new THREE.Vector3(-70, 0, 0), new THREE.Vector3(70, 0, 0)],
    [new THREE.Vector3(0, -70, 0), new THREE.Vector3(0, 70, 0)],
    [new THREE.Vector3(0, 0, -70), new THREE.Vector3(0, 0, 70)],
  ]) {
    const ray = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      rayMaterial,
    );
    ray.name = "lightPointRay";
    ray.userData.clipperLightVisual = true;
    group.add(ray);
  }
  return group;
}

function applyCameraObjectTransform(target: any, camera: CameraObjectProps) {
  target.position.set(camera.position.x, -camera.position.y, camera.position.z);
  target.rotation.order = "XYZ";
  target.rotation.x = -camera.rotation.x * DEG_TO_RAD;
  target.rotation.y = camera.rotation.y * DEG_TO_RAD;
  target.rotation.z = -camera.rotation.z * DEG_TO_RAD;
}

export function getThreeAuthorActiveCameraSignature(
  camera: CameraObjectProps | null,
) {
  return getCameraObjectPropsSignature(camera);
}

function findCameraVisualGroup(root: any, objectId: string) {
  return (
    root.children.find(
      (child: any) => child.userData?.clipperCameraObjectId === objectId,
    ) ?? null
  );
}

/**
 * Raycast the picker mesh of a `TransformControls` instance and return
 * the closest hit distance, or `null` if no hit. Used by the
 * capture-phase mutex to pick the closer of two overlapping gizmos so
 * only one drag starts per pointerdown.
 *
 * The picker mesh `_gizmo.picker[mode]` carries the invisible hover /
 * pick volumes for the current mode. Its world matrix is updated by
 * `TransformControls.updateMatrixWorld`, which runs every frame, so
 * raycasting it gives the same result the control's own
 * `pointerHover` would compute.
 */
function pickGizmoDistance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controls: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raycaster: any,
): number | null {
  if (!controls.enabled) return null;
  const picker = controls._gizmo?.picker?.[controls.mode];
  if (!picker) return null;
  const hits = raycaster.intersectObject(picker, true);
  if (!hits.length) return null;
  // Filter to handles whose name is on the showX/showY/showZ axes.
  // Pruned handles have been removed from the picker so they won't hit.
  return hits[0].distance;
}

/**
 * `ThreeAuthorScene` is the AE-style 3D author viewport.
 *
 * Two stacked renderers share one camera + scene-graph:
 *   - `WebGLRenderer` draws the grid, the through-camera frustum
 *     (`THREE.CameraHelper`), and the TransformControls gizmo. Transparent
 *     background so the layer beneath shows through.
 *   - `CSS3DRenderer` renders the live composition DOM as a flat
 *     `CSS3DObject` plane at z=0, sized FRAME_WIDTH × FRAME_HEIGHT in
 *     world units. Because they share one OrbitControls camera, orbiting
 *     and zooming move both layers in lockstep.
 *
 * The composition root element is supplied externally via
 * `setCompositionElement` so the React owner can mount its own
 * `DomBackend` and hand the host element in. That keeps every
 * FrameObject type (text, path, code, …) renderable for free — the
 * adapter set in `./adapters` is now reserved for genuinely 3D content.
 *
 * Compose mode and Direct/PIP both use this class. The PIP variant
 * passes `viewMode: "through"` so the WebGLRenderer renders from the
 * composition's own camera and OrbitControls is disabled.
 */
export class ThreeAuthorScene {
  readonly hostRoot: HTMLDivElement;
  readonly css3dRoot: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly bgCanvas: HTMLCanvasElement;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bgRenderer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cssRenderer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private orbitCamera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private throughCamera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cameraHelper: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cameraGizmoTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private objectGizmoTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private objectPickGroup: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cameraVisualGroup: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lightVisualGroup: any;
  private objectPickMeshesById = new Map<
    string,
    {
      height: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mesh: any;
      signature: string;
      width: number;
    }
  >();
  private cameraVisualMeshesById = new Map<
    string,
    {
      color: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      group: any;
      opacity: number;
      signature: string;
    }
  >();
  private lightVisualMeshesById = new Map<
    string,
    {
      color: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      group: any;
      opacity: number;
      signature: string;
    }
  >();
  private gizmoMode: "camera" | "object" = "camera";
  private selectedObjectGizmoId: string | null = null;
  private selectedCameraObjectId: string | null = null;
  private selectedObjectGizmoBounds: {
    width: number;
    height: number;
  } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cameraBodyGroup: any | null = null;
  private cameraPathOverlay: CameraPathOverlay | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private orbit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private translateTransform: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rotateTransform: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private compositionPlane: any | null = null;
  private compositionElement: HTMLElement | null = null;

  private viewMode: "orbit" | "through" = "orbit";
  private handToolActive = false;
  private width: number;
  private height: number;
  private dragCallback:
    | ((objectId: string, p: CameraObjectProps) => void)
    | null = null;
  private dragStateCallback: ((active: boolean) => void) | null = null;
  private selectCallback: ((picked: string | null) => void) | null = null;
  private viewStateCallback: ((state: ThreeOrbitState) => void) | null = null;
  private orbitViewStateDirty = false;
  private objectDragCallback:
    | ((
        objectId: string,
        nextTransform: ThreeAuthorObjectTransformUpdate,
      ) => void)
    | null = null;
  private cameraPathSelectCallback: ((index: number | null) => void) | null =
    null;
  private cameraPathHandleDragCallback:
    | ((handle: CameraPathHandle, nextCp: number) => void)
    | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private raycaster: any = new THREE.Raycaster();
  private activeProps: CameraObjectProps = { ...DEFAULT_CAMERA_OBJECT_PROPS };
  private activeCameraSignature = getThreeAuthorActiveCameraSignature(null);
  private selectedCameraProps: CameraObjectProps = {
    ...DEFAULT_CAMERA_OBJECT_PROPS,
  };
  private activeCameraObjectId: string | null = null;
  private cameraObjectPropsById = new Map<string, CameraObjectProps>();
  private isAttached = false;
  private rafHandle = 0;

  constructor(opts: ThreeAuthorSceneOptions) {
    this.width = Math.max(1, Math.floor(opts.width));
    this.height = Math.max(1, Math.floor(opts.height));

    this.scene = new THREE.Scene();

    // Orbit camera framing the FRAME_WIDTH × FRAME_HEIGHT plane at z=0.
    // The orbit camera uses the host pane aspect so the rendering doesn't
    // get stretched. Distance picked so the FRAME plane fills ~55% of
    // the view height at fov=45° — comfortable framing with room for the
    // through-camera frustum overlay.
    this.orbitCamera = new THREE.PerspectiveCamera(
      45,
      this.width / this.height,
      10,
      40000,
    );
    this.orbitCamera.position.set(0, 0, DEFAULT_ORBIT_DISTANCE);

    // Through camera mirrors the comp's authored CameraObjectProps. Its
    // aspect is locked to FRAME_WIDTH / FRAME_HEIGHT so the wireframe
    // frustum (and any rendered output through this camera) matches the
    // composition's 16:9 frame, not the host pane shape.
    this.throughCamera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA_OBJECT_PROPS.fov,
      FRAME_WIDTH / FRAME_HEIGHT,
      DEFAULT_CAMERA_OBJECT_PROPS.near,
      DEFAULT_CAMERA_OBJECT_PROPS.far,
    );
    this.scene.add(this.throughCamera);

    // Wireframe frustum mirroring throughCamera. Custom outline that
    // draws only the near + far rectangles and the 4 edges connecting
    // their corners — no cone lines from origin (which would cross
    // through any layer that sits inside the frustum), no cross + on
    // each plane, no up triangle.
    this.cameraHelper = new FrustumOutline(this.throughCamera);
    this.cameraHelper.visible = false;
    this.scene.add(this.cameraHelper);

    // Invisible gizmo target at the camera's transform.
    this.cameraGizmoTarget = new THREE.Object3D();
    this.scene.add(this.cameraGizmoTarget);

    // Invisible gizmo target for non-camera objects. Positioned at the
    // selected object's 3D transform so translate/rotate gizmos attach here.
    this.objectGizmoTarget = new THREE.Object3D();
    this.scene.add(this.objectGizmoTarget);

    // Group to hold invisible, raycastable pick planes for 3D elements
    this.objectPickGroup = new THREE.Group();
    this.objectPickGroup.name = "ObjectPickGroup";
    this.scene.add(this.objectPickGroup);

    this.cameraVisualGroup = new THREE.Group();
    this.cameraVisualGroup.name = "CameraVisualGroup";
    this.scene.add(this.cameraVisualGroup);

    this.lightVisualGroup = new THREE.Group();
    this.lightVisualGroup.name = "LightVisualGroup";
    this.scene.add(this.lightVisualGroup);

    // Visible camera body so the user can click to select the camera in 3D.
    // The mesh is a child of cameraGizmoTarget — it inherits the camera's
    // position/rotation so it always sits exactly where the through-camera
    // is. Lens cone points down -Z (the camera's forward in three).
    const cameraBodyGroup = createCameraBodyGroup(0x9aa3b6, 0.85);
    // Body is hidden in through-camera mode (we don't want it occluding the
    // PIP / Direct view) and when there is no camera at all.
    cameraBodyGroup.visible = false;
    this.cameraBodyGroup = cameraBodyGroup;
    this.cameraGizmoTarget.add(cameraBodyGroup);

    // WebGL renderer split into two passes:
    //   - bgRenderer: paints layer 1 only (the grid). Its canvas sits
    //     BELOW the CSS3D layer in DOM order so the grid never bleeds
    //     over composition content.
    //   - renderer (foreground): paints layer 0 (default) — frustum
    //     helper, camera body, gizmos, camera path. Its canvas sits
    //     ABOVE the CSS3D layer so overlays remain visible and
    //     interactive.
    // Both renderers share the same scene and camera; only the camera
    // layer mask differs per pass.
    this.bgRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    this.bgRenderer.setPixelRatio(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    this.bgRenderer.setSize(this.width, this.height, false);
    this.bgRenderer.setClearColor(0x000000, 0);
    this.bgCanvas = this.bgRenderer.domElement as HTMLCanvasElement;
    this.bgCanvas.style.position = "absolute";
    this.bgCanvas.style.inset = "0";
    this.bgCanvas.style.width = "100%";
    this.bgCanvas.style.height = "100%";
    this.bgCanvas.style.pointerEvents = "none";

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement as HTMLCanvasElement;
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "auto";

    // CSS3D renderer hosts the live composition DOM as a flat plane.
    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.setSize(this.width, this.height);
    this.css3dRoot = this.cssRenderer.domElement as HTMLDivElement;
    this.css3dRoot.style.position = "absolute";
    this.css3dRoot.style.inset = "0";
    this.css3dRoot.style.width = "100%";
    this.css3dRoot.style.height = "100%";
    // CSS3DRenderer uses transforms; pointer events go to whichever layer
    // sits on top (the WebGL canvas in orbit mode, with OrbitControls
    // intercepting pan/orbit).
    this.css3dRoot.style.pointerEvents = "none";

    // Stack from back to front:
    //   bgCanvas (grid) → CSS3D layer (composition) → canvas (overlays + gizmos)
    this.hostRoot = document.createElement("div");
    this.hostRoot.style.position = "absolute";
    this.hostRoot.style.inset = "0";
    this.hostRoot.style.overflow = "hidden";
    this.hostRoot.style.background = "#0e1117";
    this.hostRoot.appendChild(this.bgCanvas);
    this.hostRoot.appendChild(this.css3dRoot);
    this.hostRoot.appendChild(this.canvas);

    // Orbit controls — must instantiate AFTER canvas exists.
    this.orbit = new OrbitControls(this.orbitCamera, this.canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.minDistance = 200;
    this.orbit.maxDistance = 12000;
    this.orbit.zoomSpeed = 0.7;
    this.orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    this.syncOrbitPanSpeed();
    this.orbit.addEventListener("change", () => {
      this.syncOrbitPanSpeed();
      this.orbitViewStateDirty = true;
      this.requestRender();
    });

    // Two transform controls so the user gets translate arrows AND rotate
    // rings at the same time. Only one can drag at once; the listeners
    // are shared so the commit / drag-state callbacks fire identically.
    this.translateTransform = new TransformControls(
      this.orbitCamera,
      this.canvas,
    );
    this.translateTransform.setMode("translate");
    this.translateTransform.setSize(0.9);
    this.translateTransform.setSpace("world");
    this.rotateTransform = new TransformControls(this.orbitCamera, this.canvas);
    this.rotateTransform.setMode("rotate");
    // Half the translate gizmo's size — the rotation arcs sit at radius
    // 0.225 in gizmo-local units while the translate arrows extend to
    // 0.45. Visually and spatially: outer half of each axis line is
    // translate-only, inner half is rotate-only. Combined with the
    // capture-phase mutex below, this makes accidental
    // simultaneous-mode drags impossible.
    this.rotateTransform.setSize(0.45);
    this.rotateTransform.setSpace("world");
    // Strip extras so each gizmo shows only the three axis bounds:
    //   - translate: keep X / Y / Z arrows; drop the center octahedron
    //     and the three planar squares (XY / YZ / XZ).
    //   - rotate: keep X / Y / Z axis arcs; drop the screen-aligned
    //     gray inner circle (XYZE) and the outer yellow ring (E).
    // The handles live as named children of `_gizmo.gizmo[mode]` and
    // `_gizmo.picker[mode]`. `updateMatrixWorld` rewrites `visible`
    // every frame, so removal is the only durable fix.
    pruneGizmoHandles(this.translateTransform, "translate", [
      "XYZ",
      "XY",
      "YZ",
      "XZ",
    ]);
    pruneGizmoHandles(this.rotateTransform, "rotate", ["XYZE", "E"]);
    const wireTransform = (controls: typeof this.translateTransform) => {
      controls.addEventListener(
        "dragging-changed",
        (event: { value: boolean }) => {
          this.orbit.enabled = !event.value;
          if (this.dragStateCallback) this.dragStateCallback(event.value);
          this.requestRender();
        },
      );
      controls.addEventListener("objectChange", () => {
        this.commitGizmoTransformToProps();
        this.requestRender();
      });
    };
    wireTransform(this.translateTransform);
    wireTransform(this.rotateTransform);

    // Mutex: a single pointerdown can hit pickers on both
    // TransformControls instances simultaneously (each registers its
    // own listener, neither knows about the other). Raycast both
    // pickers in the capture phase and disable the losing gizmo before
    // its own pointerdown listener fires — `TransformControls`
    // early-returns on `pointerDown` when `enabled` is false. Re-enable
    // both gizmos on pointerup / pointercancel.
    const restoreGizmos = () => {
      this.translateTransform.enabled = !this.handToolActive;
      this.rotateTransform.enabled = !this.handToolActive;
    };
    this.canvas.addEventListener(
      "pointerdown",
      (event: PointerEvent) => {
        if (this.viewMode !== "orbit") return;
        if (this.handToolActive) return;
        if (event.button !== 0) return;
        if (!this.isAttached) return;
        const rect = this.canvas.getBoundingClientRect();
        const ndc = {
          x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
        };
        this.raycaster.setFromCamera(ndc, this.orbitCamera);
        const translateHit = pickGizmoDistance(
          this.translateTransform,
          this.raycaster,
        );
        const rotateHit = pickGizmoDistance(
          this.rotateTransform,
          this.raycaster,
        );
        if (translateHit == null && rotateHit == null) return;
        // Closer pick wins; equal-or-only-one cases fall through. The
        // loser is disabled for this gesture so its pointerdown listener
        // bails out, then re-enabled on pointerup.
        if (
          translateHit != null &&
          (rotateHit == null || translateHit <= rotateHit)
        ) {
          this.rotateTransform.enabled = false;
        } else {
          this.translateTransform.enabled = false;
        }
      },
      { capture: true },
    );
    this.canvas.addEventListener("pointerup", restoreGizmos);
    this.canvas.addEventListener("pointercancel", restoreGizmos);
    // Pick the camera body or a camera-path keyframe/handle on click. A
    // tiny pointermove threshold distinguishes click from orbit drag.
    let downPoint: { x: number; y: number } | null = null;
    let downHitCamera: string | null = null;
    let downHitObject = false;
    let downHitPath: "marker" | "handle" | null = null;
    this.canvas.addEventListener("pointerdown", (event: PointerEvent) => {
      if (this.viewMode !== "orbit") return;
      if (this.handToolActive) return;
      if (this.translateTransform.dragging) return;
      if (this.rotateTransform.dragging) return;
      if (this.translateTransform.axis) return;
      if (this.rotateTransform.axis) return;
      // Path overlay picks first — keyframe markers and bezier handles
      // sit visually on top of the camera body, so they should win when
      // they overlap. The overlay returns the kind of pick it made (or
      // null) and itself begins handle drags.
      const pathPick = this.cameraPathOverlay?.pickAtPointer(event) ?? null;
      const rect = this.canvas.getBoundingClientRect();
      const ndc = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
      this.raycaster.setFromCamera(ndc, this.orbitCamera);
      const hits =
        pathPick == null
          ? this.raycaster.intersectObject(this.cameraVisualGroup, true)
          : [];
      const pickedCameraId =
        typeof hits[0]?.object?.userData?.clipperCameraObjectId === "string"
          ? hits[0].object.userData.clipperCameraObjectId
          : null;
      const lightHits =
        pathPick == null && hits.length === 0
          ? this.raycaster.intersectObject(this.lightVisualGroup, true)
          : [];
      const pickedLightHit = lightHits.find(
        (hit: any) =>
          hit.object?.userData?.clipperLightPickable === true &&
          typeof hit.object.userData.clipperLightObjectId === "string",
      );
      const pickedLightId =
        pickedLightHit?.object.userData.clipperLightObjectId ?? null;
      const objectHits =
        pathPick == null && hits.length === 0 && pickedLightId == null
          ? this.raycaster.intersectObject(this.objectPickGroup, true)
          : [];
      const pickedObjectId =
        typeof objectHits[0]?.object?.userData?.clipperObjectId === "string"
          ? objectHits[0].object.userData.clipperObjectId
          : null;
      downPoint = { x: event.clientX, y: event.clientY };
      downHitCamera = pickedCameraId;
      downHitObject = pickedObjectId != null || pickedLightId != null;
      downHitPath = pathPick;
      if (pickedCameraId) {
        // Prevent OrbitControls from starting an orbit on the camera body.
        event.stopPropagation();
        this.selectCallback?.(pickedCameraId);
      } else if (pathPick) {
        // Suppress OrbitControls on path picks too — clicking a marker
        // or starting a handle drag must not also orbit the scene.
        event.stopPropagation();
      } else if (pickedObjectId) {
        event.stopPropagation();
        this.selectCallback?.(pickedObjectId);
      } else if (pickedLightId) {
        event.stopPropagation();
        this.selectCallback?.(pickedLightId);
      }
    });
    this.canvas.addEventListener("pointerup", (event: PointerEvent) => {
      if (!downPoint) return;
      const moved = Math.hypot(
        event.clientX - downPoint.x,
        event.clientY - downPoint.y,
      );
      const wasClick = moved < 4;
      const hitCamera = downHitCamera != null;
      const hitObject = downHitObject;
      const hitPath = downHitPath;
      downPoint = null;
      downHitCamera = null;
      downHitObject = false;
      downHitPath = null;
      if (
        wasClick &&
        !hitCamera &&
        !hitObject &&
        !hitPath &&
        this.viewMode === "orbit"
      ) {
        // Click on empty space deselects camera AND clears any path
        // keyframe selection.
        this.selectCallback?.(null);
        this.cameraPathSelectCallback?.(null);
      }
    });
    this.scene.add(this.translateTransform.getHelper());
    this.scene.add(this.rotateTransform.getHelper());

    // Light haze + grid for orientation. Grid lies flat on the z=0 plane
    // (after the rotation) so it matches the composition plane. The grid
    // is placed on layer 1 so the background renderer paints it behind
    // the CSS3D composition while the overlay renderer skips it.
    const grid = new THREE.GridHelper(4000, 20, 0x33384a, 0x222632);
    grid.rotation.x = Math.PI / 2;
    grid.layers.set(1);
    this.scene.add(grid);

    // Camera-path overlay (dashed polyline + keyframe markers + bezier
    // handles). Listens to canvas pointer events for marker / handle
    // picking. The overlay's `pickAtPointer` is invoked from this
    // class's pointerdown handler so camera-body picks take priority
    // when both targets stack at the same screen position.
    this.cameraPathOverlay = new CameraPathOverlay({
      camera: this.orbitCamera,
      canvas: this.canvas,
      requestRender: () => this.requestRender(),
      callbacks: {
        onSelectKeyframe: (index) => {
          this.cameraPathSelectCallback?.(index);
        },
        onHandleDragStateChange: (active) => {
          this.orbit.enabled = !active && this.viewMode === "orbit";
          if (this.dragStateCallback) this.dragStateCallback(active);
          this.requestRender();
        },
        onHandleDrag: (handle, nextCp) => {
          this.cameraPathHandleDragCallback?.(handle, nextCp);
        },
      },
    });
    this.scene.add(this.cameraPathOverlay.group);

    this.requestRender();
  }

  setViewMode(mode: "orbit" | "through") {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.orbit.enabled = mode === "orbit";
    this.cameraHelper.visible = mode === "orbit";
    this.cameraVisualGroup.visible = mode === "orbit";
    if (this.cameraBodyGroup) this.cameraBodyGroup.visible = false;
    if (mode === "through" && this.isAttached) {
      this.translateTransform.detach();
      this.rotateTransform.detach();
      this.isAttached = false;
    }
    this.requestRender();
  }

  setHandToolActive(active: boolean) {
    if (this.handToolActive === active) return;
    this.handToolActive = active;
    this.orbit.mouseButtons.LEFT = active
      ? THREE.MOUSE.PAN
      : THREE.MOUSE.ROTATE;
    this.translateTransform.enabled = !active;
    this.rotateTransform.enabled = !active;
    this.canvas.style.cursor = active ? "grab" : "";
    this.requestRender();
  }

  getOrbitState(): ThreeOrbitState {
    return {
      cameraX: this.orbitCamera.position.x,
      cameraY: this.orbitCamera.position.y,
      cameraZ: this.orbitCamera.position.z,
      targetX: this.orbit.target.x,
      targetY: this.orbit.target.y,
      targetZ: this.orbit.target.z,
    };
  }

  setOrbitState(state: ThreeOrbitState) {
    this.orbitCamera.position.set(state.cameraX, state.cameraY, state.cameraZ);
    this.orbit.target.set(state.targetX, state.targetY, state.targetZ);
    this.syncOrbitPanSpeed();
    this.orbit.update();
    this.orbitViewStateDirty = false;
    this.requestRender();
  }

  private syncOrbitPanSpeed() {
    const distance = this.orbitCamera.position.distanceTo(this.orbit.target);
    this.orbit.panSpeed = DEFAULT_ORBIT_DISTANCE / Math.max(1, distance);
  }

  onViewStateChange(callback: (state: ThreeOrbitState) => void) {
    this.viewStateCallback = callback;
  }

  setViewport(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.bgRenderer.setSize(w, h, false);
    this.cssRenderer.setSize(w, h);
    this.orbitCamera.aspect = w / h;
    this.orbitCamera.updateProjectionMatrix();
    // Through camera aspect is locked to FRAME aspect; do not change it
    // on viewport resize.
    this.orbit.update();
    this.render();
  }

  /**
   * Mount a live DOM element as the CSS3D composition plane. The element
   * is positioned at z=0 and sized FRAME_WIDTH × FRAME_HEIGHT in world
   * units. Coordinate mapping converts Clipper's y-down frame space to
   * Three's y-up world by flipping the plane on its X axis (rotateX(π))
   * so frame-y increases downward in world space when viewed from +z.
   */
  setCompositionElement(element: HTMLElement | null) {
    if (this.compositionElement === element) return;
    this.compositionElement = element;
    if (this.compositionPlane) {
      this.scene.remove(this.compositionPlane);
      this.compositionPlane = null;
    }
    if (element) {
      element.style.width = `${FRAME_WIDTH}px`;
      element.style.height = `${FRAME_HEIGHT}px`;
      element.style.transformOrigin = "center center";
      // CSS3DRenderer rewrites this element's `transform` every frame
      // but never sets `transform-style`. The default `flat` collapses
      // every descendant's translateZ / rotate{X,Y,Z}, so per-layer 3D
      // motion would die at the CSS3DObject boundary. Mark the plane
      // preserve-3d so children pop out as authored.
      element.style.transformStyle = "preserve-3d";
      const obj = new CSS3DObject(element);
      // Composition origin is top-left; CSS3DObject pivots around the
      // element's center. We translate by the half-extents flipped in y
      // so (0,0,0) corresponds to the composition's top-left in
      // Clipper's frame coords. We do NOT rotate the plane: in
      // CSS3DRenderer, +y points down (matching DOM), and we mirror that
      // convention in `applyCompositionCameraToThree` (negating y on the
      // camera). This way the WebGL layer (y-up) and the CSS layer
      // (y-down) align when the through-camera looks at z<0.
      obj.position.set(0, 0, 0);
      this.compositionPlane = obj;
      this.scene.add(obj);
    }
    this.requestRender();
  }

  setActiveCamera(camera: CameraObjectProps | null, objectId?: string | null) {
    const nextObjectId = objectId ?? null;
    const signature = getThreeAuthorActiveCameraSignature(camera);
    if (
      signature === this.activeCameraSignature &&
      nextObjectId === this.activeCameraObjectId
    ) {
      return;
    }
    this.activeCameraSignature = signature;
    const visibleHelper = camera != null && this.viewMode === "orbit";
    this.cameraHelper.visible = visibleHelper;
    if (this.cameraBodyGroup) this.cameraBodyGroup.visible = false;
    this.activeCameraObjectId = nextObjectId;
    if (camera) {
      this.activeProps = { ...camera };
      applyCompositionCameraToThree(
        this.throughCamera,
        camera,
        FRAME_WIDTH / FRAME_HEIGHT,
      );
      if (this.selectedCameraObjectId === this.activeCameraObjectId) {
        this.selectedCameraProps = { ...camera };
        applyCameraObjectTransform(this.cameraGizmoTarget, camera);
      }
      this.cameraHelper.update();
    } else if (this.isAttached) {
      this.translateTransform.detach();
      this.rotateTransform.detach();
      this.isAttached = false;
    }
    this.requestRender();
  }

  private getCameraObjectSignature(camera: CameraObjectProps) {
    return [
      camera.position.x,
      camera.position.y,
      camera.position.z,
      camera.rotation.x,
      camera.rotation.y,
      camera.rotation.z,
    ].join(":");
  }

  private updateCameraVisualMaterial(
    group: any,
    color: number,
    opacity: number,
  ) {
    group.traverse?.((node: any) => {
      const materials = Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : [];
      for (const material of materials) {
        material.color?.setHex?.(color);
        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.needsUpdate = true;
      }
    });
  }

  private updateLightVisualMaterial(
    group: any,
    color: number,
    opacity: number,
  ) {
    group.traverse?.((node: any) => {
      const materials = Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : [];
      const visualOpacity =
        node.name === "lightBeamCone"
          ? Math.min(0.22, opacity * 0.22)
          : node.name === "lightPointRange"
            ? Math.min(0.2, opacity * 0.2)
            : node.name === "lightAmbientField"
              ? Math.min(0.16, opacity * 0.16)
              : node.name === "lightPointRay"
                ? Math.min(0.72, opacity)
                : node.name === "lightDirectionLine"
                  ? Math.min(1, opacity + 0.12)
                  : node.name === "lightDirectionArrow"
                    ? Math.min(1, opacity + 0.16)
                    : opacity;
      for (const material of materials) {
        material.color?.setHex?.(color);
        material.opacity = visualOpacity;
        material.transparent = visualOpacity < 1;
        material.needsUpdate = true;
      }
    });
  }

  private disposeObject3d(object: any) {
    object.traverse?.((node: any) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) {
        for (const material of node.material) material.dispose?.();
      } else {
        node.material?.dispose?.();
      }
    });
  }

  setCameraObjects(cameras: ThreeAuthorCameraObject[]) {
    this.cameraVisualGroup.visible = this.viewMode === "orbit";
    let changed = false;
    const nextIds = new Set<string>();
    this.cameraObjectPropsById = new Map();
    for (const camera of cameras) {
      nextIds.add(camera.id);
      this.cameraObjectPropsById.set(camera.id, camera.props);
      const color = camera.selected
        ? 0xffffff
        : camera.active
          ? 0x6ee7f9
          : 0x9aa3b6;
      const opacity = camera.selected || camera.active ? 0.95 : 0.65;
      const signature = this.getCameraObjectSignature(camera.props);
      let entry = this.cameraVisualMeshesById.get(camera.id);
      if (!entry) {
        const group = createCameraBodyGroup(color, opacity);
        group.userData.clipperCameraObjectId = camera.id;
        group.traverse((node: any) => {
          node.userData.clipperCameraObjectId = camera.id;
        });
        this.cameraVisualGroup.add(group);
        entry = { color, group, opacity, signature: "" };
        this.cameraVisualMeshesById.set(camera.id, entry);
        changed = true;
      }
      if (entry.color !== color || entry.opacity !== opacity) {
        this.updateCameraVisualMaterial(entry.group, color, opacity);
        entry.color = color;
        entry.opacity = opacity;
        changed = true;
      }
      if (entry.signature !== signature) {
        applyCameraObjectTransform(entry.group, camera.props);
        entry.signature = signature;
        changed = true;
      }
    }
    for (const [id, entry] of this.cameraVisualMeshesById) {
      if (nextIds.has(id)) continue;
      this.cameraVisualGroup.remove(entry.group);
      this.disposeObject3d(entry.group);
      this.cameraVisualMeshesById.delete(id);
      changed = true;
    }
    if (this.selectedCameraObjectId) {
      const selected = this.cameraObjectPropsById.get(
        this.selectedCameraObjectId,
      );
      if (selected) {
        this.selectedCameraProps = { ...selected };
        applyCameraObjectTransform(this.cameraGizmoTarget, selected);
      }
    }
    if (changed) this.requestRender();
  }

  private applyLightObjectTransform(
    target: any,
    light: ThreeAuthorLightObject,
  ) {
    const w = light.bounds.width ?? 0;
    const h = light.bounds.height ?? 0;
    const positionX = light.bounds.x - FRAME_WIDTH / 2 + w / 2;
    const positionY = -(light.bounds.y - FRAME_HEIGHT / 2 + h / 2);
    const positionZ =
      typeof light.transform.translateZ === "number"
        ? light.transform.translateZ
        : 0;
    target.position.set(positionX, positionY, positionZ);
    const bodyScale =
      (light.kind === "ambient" ? 0.8 : 1) +
      Math.max(0, light.intensity) * 0.08;
    const body = target.getObjectByName("lightBody");
    if (body) body.scale.setScalar(bodyScale);
    this.updateLightDirectionVisual(
      target,
      light,
      new THREE.Vector3(positionX, positionY, positionZ),
    );
  }

  private updateLightDirectionVisual(
    target: any,
    light: ThreeAuthorLightObject,
    position: InstanceType<typeof THREE.Vector3>,
  ) {
    const directionLine = target.getObjectByName("lightDirectionLine") as
      | InstanceType<typeof THREE.Line>
      | undefined;
    const arrowHead = target.getObjectByName("lightDirectionArrow");
    const beamCone = target.getObjectByName("lightBeamCone");
    const pointRange = target.getObjectByName("lightPointRange");
    const ambientField = target.getObjectByName("lightAmbientField");
    const pointRays = target.children.filter(
      (child: any) => child.name === "lightPointRay",
    );

    const directed = light.kind === "directional" || light.kind === "spot";
    if (directionLine) directionLine.visible = directed;
    if (arrowHead) arrowHead.visible = directed;
    if (beamCone) beamCone.visible = light.kind === "spot" && light.showRange;
    if (pointRange) {
      pointRange.visible = light.kind === "point" && light.showRange;
      pointRange.scale.setScalar(Math.max(1, light.range));
    }
    if (ambientField) ambientField.visible = false;
    for (const ray of pointRays)
      ray.visible = light.kind === "point" && light.debug;
    if (!directed) return;

    const targetPoint = new THREE.Vector3(
      light.target.x,
      light.target.y,
      light.target.z,
    );
    const delta = targetPoint.sub(position);
    if (delta.lengthSq() < 1) delta.set(0, 0, -360);
    const length =
      light.kind === "spot"
        ? Math.max(160, Math.min(light.range, delta.length()))
        : Math.max(160, delta.length());
    const direction = delta.normalize();
    const end = direction.clone().multiplyScalar(length);

    if (directionLine) {
      const geometry = directionLine.geometry as InstanceType<
        typeof THREE.BufferGeometry
      >;
      geometry.setFromPoints([new THREE.Vector3(0, 0, 0), end]);
      geometry.computeBoundingSphere();
    }

    if (arrowHead) {
      arrowHead.position.copy(direction.clone().multiplyScalar(length));
      arrowHead.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      );
    }

    if (beamCone) {
      const coneLength = Math.max(160, light.range);
      const coneRadius =
        Math.tan((Math.min(175, Math.max(1, light.angle)) * DEG_TO_RAD) / 2) *
        coneLength;
      beamCone.geometry.dispose();
      beamCone.geometry = new THREE.ConeGeometry(
        coneRadius,
        coneLength,
        40,
        1,
        true,
      );
      beamCone.position.copy(direction.clone().multiplyScalar(coneLength / 2));
      beamCone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        direction,
      );
    }
  }

  private getLightObjectSignature(light: ThreeAuthorLightObject) {
    return [
      light.kind,
      light.bounds.x,
      light.bounds.y,
      light.bounds.width,
      light.bounds.height,
      typeof light.transform.translateZ === "number"
        ? light.transform.translateZ
        : 0,
      light.intensity,
      light.range,
      light.angle,
      light.softness,
      light.debug ? 1 : 0,
      light.showRange ? 1 : 0,
      light.target.x,
      light.target.y,
      light.target.z,
    ].join(":");
  }

  setLightObjects(lights: ThreeAuthorLightObject[]) {
    this.lightVisualGroup.visible = this.viewMode === "orbit";
    let changed = false;
    const nextIds = new Set<string>();
    for (const light of lights) {
      nextIds.add(light.id);
      const color = new THREE.Color(light.color).getHex();
      const opacity = light.selected ? 1 : 0.68;
      const signature = this.getLightObjectSignature(light);
      let entry = this.lightVisualMeshesById.get(light.id);
      if (!entry) {
        const group = createLightVisualGroup(color, opacity);
        group.traverse((node: any) => {
          if (node.userData.clipperLightPickable === true) {
            node.userData.clipperLightObjectId = light.id;
          }
        });
        this.lightVisualGroup.add(group);
        entry = { color, group, opacity, signature: "" };
        this.lightVisualMeshesById.set(light.id, entry);
        changed = true;
      }
      if (entry.color !== color || entry.opacity !== opacity) {
        this.updateLightVisualMaterial(entry.group, color, opacity);
        entry.color = color;
        entry.opacity = opacity;
        changed = true;
      }
      if (entry.signature !== signature) {
        this.applyLightObjectTransform(entry.group, light);
        entry.signature = signature;
        changed = true;
      }
    }
    for (const [id, entry] of this.lightVisualMeshesById) {
      if (nextIds.has(id)) continue;
      this.lightVisualGroup.remove(entry.group);
      this.disposeObject3d(entry.group);
      this.lightVisualMeshesById.delete(id);
      changed = true;
    }
    if (changed) this.requestRender();
  }

  setSelectedCameraObjectId(id: string | null) {
    if (this.viewMode !== "orbit") return;
    if (id == null) {
      this.selectedCameraObjectId = null;
      if (this.isAttached && this.gizmoMode === "camera") {
        this.translateTransform.detach();
        this.rotateTransform.detach();
        this.isAttached = false;
        this.gizmoMode = "camera";
        this.selectedObjectGizmoId = null;
        this.selectedObjectGizmoBounds = null;
        this.requestRender();
      }
      return;
    }
    const shouldAttach = !this.isAttached || this.gizmoMode !== "camera";
    if (shouldAttach) {
      this.translateTransform.detach();
      this.rotateTransform.detach();
    }
    this.gizmoMode = "camera";
    this.selectedObjectGizmoId = null;
    this.selectedCameraObjectId = id;
    const selected = this.cameraObjectPropsById.get(id) ?? this.activeProps;
    this.selectedCameraProps = { ...selected };
    applyCameraObjectTransform(this.cameraGizmoTarget, selected);
    if (shouldAttach) {
      this.translateTransform.attach(this.cameraGizmoTarget);
      this.rotateTransform.attach(this.cameraGizmoTarget);
      this.isAttached = true;
      this.requestRender();
    }
  }

  /**
   * Select a non-camera object in the 3D scene for gizmo editing.
   * The gizmo attaches to `objectGizmoTarget` positioned at the object's
   * evaluated 3D transform. Drags update translateZ/rotateX/Y/Z.
   */
  private applyObjectTransform(
    mesh: any,
    bounds: { x: number; y: number; width: number; height: number },
    transform: Record<string, unknown>,
  ) {
    const w = bounds.width ?? 0;
    const h = bounds.height ?? 0;
    const centerX = bounds.x - FRAME_WIDTH / 2 + w / 2;
    const centerY = -(bounds.y - FRAME_HEIGHT / 2 + h / 2);
    const tz =
      typeof transform.translateZ === "number" ? transform.translateZ : 0;
    const rx = typeof transform.rotateX === "number" ? transform.rotateX : 0;
    const ry = typeof transform.rotateY === "number" ? transform.rotateY : 0;
    const rz = typeof transform.rotateZ === "number" ? transform.rotateZ : 0;

    mesh.position.set(centerX, centerY, tz);
    mesh.rotation.order = "XYZ";
    mesh.rotation.x = -rx * DEG_TO_RAD;
    mesh.rotation.y = ry * DEG_TO_RAD;
    mesh.rotation.z = -rz * DEG_TO_RAD;
  }

  private getPickableObjectSignature(obj: ThreeAuthorPickableObject) {
    const transform = obj.transform;
    return [
      obj.bounds.x,
      obj.bounds.y,
      obj.bounds.width,
      obj.bounds.height,
      typeof transform.translateZ === "number" ? transform.translateZ : 0,
      typeof transform.rotateX === "number" ? transform.rotateX : 0,
      typeof transform.rotateY === "number" ? transform.rotateY : 0,
      typeof transform.rotateZ === "number" ? transform.rotateZ : 0,
    ].join(":");
  }

  private disposeMesh(mesh: any) {
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) material.dispose?.();
    } else {
      mesh.material?.dispose?.();
    }
  }

  setPickableObjects(objects: ThreeAuthorPickableObject[]) {
    let changed = false;
    const nextIds = new Set<string>();
    for (const obj of objects) {
      nextIds.add(obj.id);
      const width = Math.max(1, obj.bounds.width);
      const height = Math.max(1, obj.bounds.height);
      const signature = this.getPickableObjectSignature(obj);
      let entry = this.objectPickMeshesById.get(obj.id);
      if (!entry) {
        const geom = new THREE.PlaneGeometry(width, height);
        const mat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData.clipperObjectId = obj.id;
        this.objectPickGroup.add(mesh);
        entry = { height, mesh, signature: "", width };
        this.objectPickMeshesById.set(obj.id, entry);
        changed = true;
      } else if (entry.width !== width || entry.height !== height) {
        entry.mesh.geometry?.dispose?.();
        entry.mesh.geometry = new THREE.PlaneGeometry(width, height);
        entry.width = width;
        entry.height = height;
        changed = true;
      }
      if (entry.signature !== signature) {
        this.applyObjectTransform(entry.mesh, obj.bounds, obj.transform);
        entry.signature = signature;
        changed = true;
      }
    }
    for (const [id, entry] of this.objectPickMeshesById) {
      if (nextIds.has(id)) continue;
      this.objectPickGroup.remove(entry.mesh);
      this.disposeMesh(entry.mesh);
      this.objectPickMeshesById.delete(id);
      changed = true;
    }
    if (changed) this.requestRender();
  }

  setSelectedObject(
    objectId: string | null,
    bounds: { x: number; y: number; width: number; height: number } | null,
    transform: Record<string, unknown> | null,
  ) {
    if (this.viewMode !== "orbit") return;

    if (objectId == null || bounds == null || transform == null) {
      this.selectedObjectGizmoBounds = null;
      if (this.isAttached && this.gizmoMode === "object") {
        this.translateTransform.detach();
        this.rotateTransform.detach();
        this.isAttached = false;
        this.gizmoMode = "camera";
        this.selectedObjectGizmoId = null;
        this.requestRender();
      }
      return;
    }

    // Position the proxy gizmo target at the object's 3D transform.
    const w = bounds.width ?? 0;
    const h = bounds.height ?? 0;
    const centerX = bounds.x - FRAME_WIDTH / 2 + w / 2;
    const centerY = -(bounds.y - FRAME_HEIGHT / 2 + h / 2);
    const tz =
      typeof transform.translateZ === "number" ? transform.translateZ : 0;
    const rx = typeof transform.rotateX === "number" ? transform.rotateX : 0;
    const ry = typeof transform.rotateY === "number" ? transform.rotateY : 0;
    const rz = typeof transform.rotateZ === "number" ? transform.rotateZ : 0;

    this.objectGizmoTarget.position.set(centerX, centerY, tz);
    this.objectGizmoTarget.rotation.order = "XYZ";
    this.objectGizmoTarget.rotation.x = -rx * DEG_TO_RAD;
    this.objectGizmoTarget.rotation.y = ry * DEG_TO_RAD;
    this.objectGizmoTarget.rotation.z = -rz * DEG_TO_RAD;

    this.selectedObjectGizmoId = objectId;
    this.selectedObjectGizmoBounds = { width: w, height: h };
    this.selectedCameraObjectId = null;
    const shouldAttach = !this.isAttached || this.gizmoMode !== "object";
    if (shouldAttach) {
      this.translateTransform.detach();
      this.rotateTransform.detach();
    }
    this.gizmoMode = "object";
    if (shouldAttach) {
      this.translateTransform.attach(this.objectGizmoTarget);
      this.rotateTransform.attach(this.objectGizmoTarget);
      this.isAttached = true;
    }
    this.requestRender();
  }

  /**
   * Show or hide the camera's animated motion path. `data` carries the
   * dashed polyline samples plus the per-keyframe markers and bezier
   * handles. The overlay owns the meshes and the picking; it slots
   * directly into our scene graph.
   *
   * Pass `data = null` (or `visible = false`) to clear the overlay.
   */
  setCameraPath(data: CameraPathData | null, visible: boolean) {
    this.cameraPathOverlay?.setData(data, visible);
  }

  onCameraDrag(callback: (objectId: string, props: CameraObjectProps) => void) {
    this.dragCallback = callback;
  }

  onDragStateChange(callback: (active: boolean) => void) {
    this.dragStateCallback = callback;
  }

  onSelect(callback: (picked: string | null) => void) {
    this.selectCallback = callback;
  }

  /** Fired with the keyframe index when a path marker is picked. */
  onCameraPathSelect(callback: (index: number | null) => void) {
    this.cameraPathSelectCallback = callback;
  }

  /** Fired during a bezier-handle drag with the new cp.x. */
  onCameraPathHandleDrag(
    callback: (handle: CameraPathHandle, nextCp: number) => void,
  ) {
    this.cameraPathHandleDragCallback = callback;
  }

  /** Fired when a non-camera object gizmo is dragged with new transform values. */
  onObjectDrag(
    callback: (
      objectId: string,
      nextTransform: ThreeAuthorObjectTransformUpdate,
    ) => void,
  ) {
    this.objectDragCallback = callback;
  }

  /** Force a render of both layers. */
  render() {
    const camera =
      this.viewMode === "through" ? this.throughCamera : this.orbitCamera;
    // Background pass: layer 1 only (grid). Painted into bgCanvas which
    // sits behind the CSS3D layer in the DOM stack.
    camera.layers.set(1);
    this.bgRenderer.render(this.scene, camera);
    // Foreground pass: layer 0 only (frustum, camera body, gizmos,
    // camera path). Painted into the overlay canvas above the CSS3D
    // layer so overlays remain visible and interactive.
    camera.layers.set(0);
    this.renderer.render(this.scene, camera);
    // Restore default mask so anything that consults `camera.layers`
    // outside this method (raycasts, future passes) sees layer 0.
    this.cssRenderer.render(this.scene, camera);
  }

  dispose() {
    cancelAnimationFrame(this.rafHandle);
    this.translateTransform.detach();
    this.rotateTransform.detach();
    const translateHelper = this.translateTransform.getHelper?.();
    if (translateHelper && translateHelper.parent === this.scene)
      this.scene.remove(translateHelper);
    const rotateHelper = this.rotateTransform.getHelper?.();
    if (rotateHelper && rotateHelper.parent === this.scene)
      this.scene.remove(rotateHelper);
    this.translateTransform.dispose();
    this.rotateTransform.dispose();
    this.orbit.dispose();
    if (this.compositionPlane) {
      this.scene.remove(this.compositionPlane);
      this.compositionPlane = null;
    }
    this.compositionElement = null;
    if (this.cameraPathOverlay) {
      this.cameraPathOverlay.dispose();
      this.cameraPathOverlay = null;
    }
    for (const entry of this.objectPickMeshesById.values())
      this.disposeMesh(entry.mesh);
    this.objectPickMeshesById.clear();
    for (const entry of this.cameraVisualMeshesById.values())
      this.disposeObject3d(entry.group);
    this.cameraVisualMeshesById.clear();
    for (const entry of this.lightVisualMeshesById.values())
      this.disposeObject3d(entry.group);
    this.lightVisualMeshesById.clear();
    this.renderer.dispose();
    this.bgRenderer.dispose();
    if (this.canvas.parentNode === this.hostRoot)
      this.hostRoot.removeChild(this.canvas);
    if (this.bgCanvas.parentNode === this.hostRoot)
      this.hostRoot.removeChild(this.bgCanvas);
    if (this.css3dRoot.parentNode === this.hostRoot)
      this.hostRoot.removeChild(this.css3dRoot);
  }

  private commitGizmoTransformToProps() {
    // Object gizmo mode: emit translateZ/rotateX/Y/Z changes
    if (this.gizmoMode === "object") {
      if (!this.selectedObjectGizmoId) return;
      if (!this.selectedObjectGizmoBounds) return;
      const t = this.objectGizmoTarget;
      const nextTransform: ThreeAuthorObjectTransformUpdate = {
        bounds: {
          x:
            t.position.x +
            FRAME_WIDTH / 2 -
            this.selectedObjectGizmoBounds.width / 2,
          y:
            -t.position.y +
            FRAME_HEIGHT / 2 -
            this.selectedObjectGizmoBounds.height / 2,
        },
        translateZ: t.position.z,
        rotateX: -t.rotation.x * RAD_TO_DEG,
        rotateY: t.rotation.y * RAD_TO_DEG,
        rotateZ: -t.rotation.z * RAD_TO_DEG,
      };
      this.objectDragCallback?.(this.selectedObjectGizmoId, nextTransform);
      return;
    }

    // Camera gizmo mode (original behavior)
    if (!this.selectedCameraObjectId) return;
    const t = this.cameraGizmoTarget;
    const pos = {
      x: t.position.x,
      y: -t.position.y,
      z: t.position.z,
    };
    const rot = {
      x: -t.rotation.x * RAD_TO_DEG,
      y: t.rotation.y * RAD_TO_DEG,
      z: -t.rotation.z * RAD_TO_DEG,
    };
    const next: CameraObjectProps = {
      ...this.selectedCameraProps,
      position: pos,
      rotation: rot,
    };
    this.selectedCameraProps = next;
    this.cameraObjectPropsById.set(this.selectedCameraObjectId, next);
    const visual = findCameraVisualGroup(
      this.cameraVisualGroup,
      this.selectedCameraObjectId,
    );
    if (visual) applyCameraObjectTransform(visual, next);
    if (this.selectedCameraObjectId === this.activeCameraObjectId) {
      this.activeProps = next;
      applyCompositionCameraToThree(
        this.throughCamera,
        next,
        FRAME_WIDTH / FRAME_HEIGHT,
      );
      this.cameraHelper.update();
    }
    if (this.dragCallback) this.dragCallback(this.selectedCameraObjectId, next);
  }

  private requestRender() {
    if (this.rafHandle) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = 0;
      const orbitChanged = this.orbit.update();
      if (!orbitChanged && this.orbitViewStateDirty) {
        this.orbitViewStateDirty = false;
        this.viewStateCallback?.(this.getOrbitState());
      }
      this.render();
    });
  }
}
