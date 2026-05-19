import * as THREE from "three";

// three's npm package doesn't ship types, so we lean on `any` for the
// scene-graph values like ThreeAuthorScene.ts does. The math types
// (vec3-shaped objects, axis enums) stay strongly typed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mesh = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Group = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Camera = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Line3D = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Vector3 = any;

const HANDLE_SIZE = 10;
const HANDLE_PICKER_SIZE = 18;
const MARKER_SIZE = 14;
const AXIS_COLORS = {
  x: 0xff5060,
  y: 0x4dd061,
  z: 0x4796ff,
} as const;

export type CameraPathAxis = "x" | "y" | "z";
export type CameraPathHandleSide = "in" | "out";

export interface CameraPathSample {
  x: number;
  y: number;
  z: number;
}

/**
 * One bezier handle on the camera path.
 *
 * Handles map to a per-axis time-ease segment between two consecutive
 * keyframes on that axis. The "out" handle attaches to the segment's
 * start keyframe and edits `cp1.x` of `easingToNext`; the "in" handle
 * attaches to the segment's end keyframe and edits `cp2.x` of the same
 * `easingToNext` (note: the previous segment, hence the segment whose
 * end is this keyframe).
 *
 * Geometry mapping (Clipper frame coords; the overlay flips y when
 * placing meshes in three world coords, same as the dotted polyline):
 *
 * - Out handle world position:
 *     startKf + cp1x * (endKf[axis] - startKf[axis]) * unitAxis
 * - In handle world position:
 *     endKf   + (cp2x - 1) * (endKf[axis] - startKf[axis]) * unitAxis
 *
 * `axisDelta` is the signed (endKf[axis] - startKf[axis]) and is used by
 * the drag math to convert pointer projection on the axis line back
 * into a [0,1] cp.x value.
 */
export interface CameraPathHandle {
  /** Stable identifier so React can match incoming updates. */
  id: string;
  /** Index into the merged keyframes array this handle is attached to. */
  keyframeIndex: number;
  /** Anchor keyframe time. */
  keyframeTime: number;
  axis: CameraPathAxis;
  side: CameraPathHandleSide;
  /** World-space mesh position. The overlay places the handle here. */
  position: CameraPathSample;
  /**
   * Origin of the slide (the keyframe the handle anchors to). Drag math
   * projects the pointer ray onto a line through `origin` along the
   * handle's axis.
   */
  origin: CameraPathSample;
  /** Signed segment delta on `axis` (endKf[axis] - startKf[axis]). */
  axisDelta: number;
  /** Current cp1.x (out) or cp2.x (in). */
  currentCp: number;
  /**
   * The track property path on the camera object whose `easingToNext`
   * this handle edits. For "out" this is the start keyframe's segment;
   * for "in" this is the previous segment ending at this keyframe.
   */
  trackPath: string;
  /** Index of the point owning the `easingToNext` to edit. */
  pointIndex: number;
}

export interface CameraPathKeyframe {
  /** Merged time across all axes. */
  time: number;
  /** Sampled world position at this time. */
  position: CameraPathSample;
}

export interface CameraPathData {
  /** Dense polyline samples for the dashed line. */
  samples: ReadonlyArray<CameraPathSample>;
  keyframes: ReadonlyArray<CameraPathKeyframe>;
  handles: ReadonlyArray<CameraPathHandle>;
  /** Index into `keyframes` whose handles should be visible, or null. */
  selectedKeyframeIndex: number | null;
}

export interface CameraPathOverlayCallbacks {
  /**
   * Marker picked. `index` is the keyframe index, or null when an empty
   * pointerup deselects.
   */
  onSelectKeyframe: (index: number | null) => void;
  onHandleDragStateChange: (active: boolean) => void;
  /**
   * Handle dragged. The overlay supplies the new cp.x; the consumer
   * persists it on the matching track point's `easingToNext`.
   */
  onHandleDrag: (handle: CameraPathHandle, nextCpX: number) => void;
}

interface MarkerEntry {
  index: number;
  mesh: Mesh;
}

interface HandleEntry {
  handle: CameraPathHandle;
  visual: Mesh;
  picker: Mesh;
}

interface DragState {
  pointerId: number;
  handle: CameraPathHandle;
  axisDir: Vector3;
  axisOrigin: Vector3;
  /** Initial cp.x at drag start; restored on cancel. */
  initialCp: number;
  /** Latest committed cp.x for the visual update. */
  currentCp: number;
}

/**
 * Camera path overlay. Owns the dashed polyline, keyframe markers, and
 * per-axis bezier handles for the selected keyframe. Picking and drag
 * math live here so `ThreeAuthorScene` only routes pointer events.
 */
export class CameraPathOverlay {
  readonly group: Group;

  private camera: Camera;
  private canvas: HTMLCanvasElement;
  private callbacks: CameraPathOverlayCallbacks;

  private requestRender: () => void;

  private pathLine: Line3D | null = null;
  private markers: MarkerEntry[] = [];
  private handles: HandleEntry[] = [];

  private markerGroup: Group;
  private handleGroup: Group;

  private raycaster = new THREE.Raycaster();
  private dragState: DragState | null = null;

  private currentData: CameraPathData | null = null;
  private visible = false;

  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerCancel: (e: PointerEvent) => void;

  /** Last pointerdown for distinguishing click vs drag on empty space. */
  private downPoint: { x: number; y: number } | null = null;
  /** True when pointerdown landed on a marker (consumed). */
  private downHitMarker = false;

  constructor(input: {
    camera: Camera;
    canvas: HTMLCanvasElement;
    requestRender: () => void;
    callbacks: CameraPathOverlayCallbacks;
  }) {
    this.camera = input.camera;
    this.canvas = input.canvas;
    this.requestRender = input.requestRender;
    this.callbacks = input.callbacks;

    this.group = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.handleGroup = new THREE.Group();
    this.group.add(this.markerGroup);
    this.group.add(this.handleGroup);
    this.group.visible = false;

    this.boundPointerDown = (e) => this.handlePointerDown(e);
    this.boundPointerMove = (e) => this.handlePointerMove(e);
    this.boundPointerUp = (e) => this.handlePointerUp(e);
    this.boundPointerCancel = (e) => this.handlePointerCancel(e);

    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    this.canvas.addEventListener("pointerup", this.boundPointerUp);
    this.canvas.addEventListener("pointercancel", this.boundPointerCancel);
  }

  /**
   * Replace the path data. The overlay rebuilds its meshes only when
   * the structural shape changes; mid-drag updates of the same handle
   * just nudge mesh positions to avoid GC churn.
   */
  setData(data: CameraPathData | null, visible: boolean) {
    this.currentData = data;
    this.visible = visible;
    if (!data || !visible) {
      this.group.visible = false;
      this.clearMarkers();
      this.clearHandles();
      this.rebuildPathLine(null);
      this.requestRender();
      return;
    }
    this.group.visible = true;
    this.rebuildPathLine(data.samples);
    this.rebuildMarkers(data.keyframes, data.selectedKeyframeIndex);
    this.rebuildHandles(data.handles, data.selectedKeyframeIndex);
    this.requestRender();
  }

  dispose() {
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("pointerup", this.boundPointerUp);
    this.canvas.removeEventListener("pointercancel", this.boundPointerCancel);
    this.clearMarkers();
    this.clearHandles();
    this.rebuildPathLine(null);
    if (this.group.parent) this.group.parent.remove(this.group);
  }

  /**
   * Returns true when a handle drag is in progress. The scene reads
   * this so OrbitControls and the camera-body picker stay disabled.
   */
  isDragging() {
    return this.dragState != null;
  }

  // ------ Mesh management ------

  private rebuildPathLine(samples: ReadonlyArray<CameraPathSample> | null) {
    if (this.pathLine) {
      this.group.remove(this.pathLine);
      this.pathLine.geometry?.dispose?.();
      this.pathLine.material?.dispose?.();
      this.pathLine = null;
    }
    if (!samples || samples.length < 2) return;
    const positions = new Float32Array(samples.length * 3);
    for (let i = 0; i < samples.length; i += 1) {
      positions[i * 3] = samples[i].x;
      positions[i * 3 + 1] = -samples[i].y;
      positions[i * 3 + 2] = samples[i].z;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineDashedMaterial({
      color: 0xe9d8ce,
      dashSize: 8,
      gapSize: 6,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const line = new THREE.Line(geom, mat);
    line.computeLineDistances();
    line.renderOrder = 998;
    this.pathLine = line;
    this.group.add(line);
  }

  private clearMarkers() {
    for (const entry of this.markers) {
      entry.mesh.geometry?.dispose?.();
      entry.mesh.material?.dispose?.();
      this.markerGroup.remove(entry.mesh);
    }
    this.markers = [];
  }

  private rebuildMarkers(
    keyframes: ReadonlyArray<CameraPathKeyframe>,
    selectedIndex: number | null,
  ) {
    this.clearMarkers();
    for (let i = 0; i < keyframes.length; i += 1) {
      const kf = keyframes[i];
      const isSelected = i === selectedIndex;
      const geom = new THREE.BoxGeometry(MARKER_SIZE, MARKER_SIZE, MARKER_SIZE);
      const mat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xffffff : 0xe9d8ce,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(kf.position.x, -kf.position.y, kf.position.z);
      mesh.renderOrder = 999;
      mesh.userData.cameraPathMarkerIndex = i;
      this.markerGroup.add(mesh);
      this.markers.push({ index: i, mesh });
    }
  }

  private clearHandles() {
    for (const entry of this.handles) {
      entry.visual.geometry?.dispose?.();
      entry.visual.material?.dispose?.();
      entry.picker.geometry?.dispose?.();
      entry.picker.material?.dispose?.();
      this.handleGroup.remove(entry.visual);
      this.handleGroup.remove(entry.picker);
    }
    this.handles = [];
  }

  private rebuildHandles(
    handles: ReadonlyArray<CameraPathHandle>,
    selectedIndex: number | null,
  ) {
    this.clearHandles();
    if (selectedIndex == null) return;
    for (const handle of handles) {
      if (handle.keyframeIndex !== selectedIndex) continue;
      const color = AXIS_COLORS[handle.axis];
      const visual = new THREE.Mesh(
        new THREE.BoxGeometry(HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
        }),
      );
      visual.position.set(
        handle.position.x,
        -handle.position.y,
        handle.position.z,
      );
      visual.renderOrder = 1000;
      const picker = new THREE.Mesh(
        new THREE.BoxGeometry(
          HANDLE_PICKER_SIZE,
          HANDLE_PICKER_SIZE,
          HANDLE_PICKER_SIZE,
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          depthTest: false,
        }),
      );
      picker.position.copy(visual.position);
      picker.renderOrder = 1000;
      picker.userData.cameraPathHandleId = handle.id;
      this.handleGroup.add(visual);
      this.handleGroup.add(picker);
      this.handles.push({ handle, visual, picker });
    }
  }

  // ------ Pointer routing ------

  private ndcFromEvent(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }

  /**
   * Returns true when this overlay handled the pointerdown (a marker or
   * handle was hit). The scene uses the return value to suppress the
   * camera-body picker and OrbitControls for this gesture.
   */
  pickAtPointer(event: PointerEvent): "marker" | "handle" | null {
    if (!this.visible || !this.currentData) return null;
    if (this.dragState) return null;
    const ndc = this.ndcFromEvent(event);
    this.raycaster.setFromCamera(ndc, this.camera);

    // Handle hits win over marker hits — once handles are visible, the
    // user is editing them and shouldn't accidentally re-select the
    // keyframe by clicking through the handle visual.
    const handlePickers = this.handles.map((h) => h.picker);
    if (handlePickers.length > 0) {
      const hits = this.raycaster.intersectObjects(handlePickers, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData.cameraPathHandleId as
          | string
          | undefined;
        if (id) {
          const entry = this.handles.find((h) => h.handle.id === id);
          if (entry) {
            this.beginHandleDrag(event, entry);
            return "handle";
          }
        }
      }
    }

    const markerMeshes = this.markers.map((m) => m.mesh);
    if (markerMeshes.length > 0) {
      const hits = this.raycaster.intersectObjects(markerMeshes, false);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.cameraPathMarkerIndex as
          | number
          | undefined;
        if (idx != null) {
          this.callbacks.onSelectKeyframe(idx);
          this.downHitMarker = true;
          return "marker";
        }
      }
    }
    return null;
  }

  private handlePointerDown(event: PointerEvent) {
    this.downPoint = { x: event.clientX, y: event.clientY };
    this.downHitMarker = false;
    // The actual pick is invoked by ThreeAuthorScene through
    // `pickAtPointer` so it can sequence with the camera-body picker
    // before calling us. We don't pick here.
  }

  private handlePointerMove(event: PointerEvent) {
    const drag = this.dragState;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;
    const ndc = this.ndcFromEvent(event);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const projection = closestPointOnAxisToRay(
      drag.axisOrigin,
      drag.axisDir,
      ray.origin,
      ray.direction,
    );
    if (!projection) return;
    const offset = projection.clone().sub(drag.axisOrigin).dot(drag.axisDir);
    const handle = drag.handle;
    let nextCp: number;
    if (handle.side === "out") {
      nextCp = clamp01(offset / handle.axisDelta);
    } else {
      nextCp = clamp01(1 + offset / handle.axisDelta);
    }
    drag.currentCp = nextCp;
    // Update visuals imperatively so the handle slides smoothly even if
    // the React store hasn't committed yet.
    const entry = this.handles.find((h) => h.handle.id === handle.id);
    if (entry) {
      const newWorld = handleWorldPosition(handle, nextCp);
      entry.visual.position.set(newWorld.x, -newWorld.y, newWorld.z);
      entry.picker.position.copy(entry.visual.position);
    }
    this.callbacks.onHandleDrag(handle, nextCp);
    this.requestRender();
  }

  private handlePointerUp(event: PointerEvent) {
    if (this.dragState && event.pointerId === this.dragState.pointerId) {
      this.endDrag();
      return;
    }
    if (!this.downPoint) return;
    const moved = Math.hypot(
      event.clientX - this.downPoint.x,
      event.clientY - this.downPoint.y,
    );
    const wasClick = moved < 4;
    const hitMarker = this.downHitMarker;
    this.downPoint = null;
    this.downHitMarker = false;
    // Empty-space click deselects the keyframe — but only when the
    // overlay is visible and nothing else (camera body, gizmo, marker,
    // handle) consumed the gesture. The scene's own pointerup deselect
    // covers the camera-side; we cover the path-overlay side here.
    if (wasClick && !hitMarker && this.visible && this.currentData) {
      if (this.currentData.selectedKeyframeIndex != null) {
        // Defer to scene picking — ThreeAuthorScene asks us via
        // `pickAtPointer` first; if nothing matched there it knows to
        // deselect. We don't proactively fire from here so we don't
        // double-deselect.
      }
    }
  }

  private handlePointerCancel(event: PointerEvent) {
    if (this.dragState && event.pointerId === this.dragState.pointerId) {
      this.cancelDrag();
    }
  }

  private beginHandleDrag(event: PointerEvent, entry: HandleEntry) {
    if (this.dragState) return;
    if (
      !Number.isFinite(entry.handle.axisDelta) ||
      entry.handle.axisDelta === 0
    )
      return;
    const axisDir = unitAxis(entry.handle.axis);
    const axisOrigin = new THREE.Vector3(
      entry.handle.origin.x,
      -entry.handle.origin.y,
      entry.handle.origin.z,
    );
    this.dragState = {
      pointerId: event.pointerId,
      handle: entry.handle,
      axisDir,
      axisOrigin,
      initialCp: entry.handle.currentCp,
      currentCp: entry.handle.currentCp,
    };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // capture failures are non-fatal — pointermove still fires.
    }
    this.callbacks.onHandleDragStateChange(true);
    event.stopPropagation();
    event.preventDefault();
  }

  private endDrag() {
    if (!this.dragState) return;
    try {
      this.canvas.releasePointerCapture(this.dragState.pointerId);
    } catch {
      // no-op
    }
    this.dragState = null;
    this.callbacks.onHandleDragStateChange(false);
  }

  private cancelDrag() {
    if (!this.dragState) return;
    try {
      this.canvas.releasePointerCapture(this.dragState.pointerId);
    } catch {
      // no-op
    }
    this.dragState = null;
    this.callbacks.onHandleDragStateChange(false);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function unitAxis(axis: CameraPathAxis): Vector3 {
  // World coords flip Y relative to Clipper frame coords. The path
  // line and markers already apply that flip. For the axis-line drag
  // math we work in *world* coords too, so unit Y is -Y.
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, -1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function handleWorldPosition(
  handle: CameraPathHandle,
  cp: number,
): CameraPathSample {
  const o = handle.origin;
  const delta = handle.axisDelta;
  if (handle.side === "out") {
    if (handle.axis === "x") return { x: o.x + cp * delta, y: o.y, z: o.z };
    if (handle.axis === "y") return { x: o.x, y: o.y + cp * delta, z: o.z };
    return { x: o.x, y: o.y, z: o.z + cp * delta };
  }
  // in handle: handle = endKf + (cp - 1) * delta * unitAxis. origin is endKf.
  const offset = (cp - 1) * delta;
  if (handle.axis === "x") return { x: o.x + offset, y: o.y, z: o.z };
  if (handle.axis === "y") return { x: o.x, y: o.y + offset, z: o.z };
  return { x: o.x, y: o.y, z: o.z + offset };
}

/**
 * Closest point on the (infinite) axis line `P + t * axisDir` to the
 * (infinite) ray `Q + s * rayDir`. Returns null when the lines are
 * parallel (no unique closest point).
 */
function closestPointOnAxisToRay(
  axisOrigin: Vector3,
  axisDir: Vector3,
  rayOrigin: Vector3,
  rayDir: Vector3,
): Vector3 | null {
  // Standard skew-line closest-point formula. Solve for t along axis.
  const w0 = new THREE.Vector3().subVectors(axisOrigin, rayOrigin);
  const a = axisDir.dot(axisDir);
  const b = axisDir.dot(rayDir);
  const c = rayDir.dot(rayDir);
  const d = axisDir.dot(w0);
  const e = rayDir.dot(w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-8) return null;
  const t = (b * e - c * d) / denom;
  return axisOrigin.clone().addScaledVector(axisDir, t);
}
