import * as THREE from "three";

type PivotAxis = "X" | "Y" | "Z";

type ConnectedPivotGizmoOptions = {
  camera: InstanceType<typeof THREE.PerspectiveCamera>;
  canvas: HTMLCanvasElement;
  onChange: () => void;
  onDragStateChange: (active: boolean) => void;
  requestRender: () => void;
};

type PivotDragState = {
  axis: PivotAxis;
  axisVector: InstanceType<typeof THREE.Vector3>;
  pointerId: number;
  startQuaternion: InstanceType<typeof THREE.Quaternion>;
  startVector: InstanceType<typeof THREE.Vector3>;
};

const PIVOT_RADIUS = 0.34;
const PIVOT_ARC_TUBE = 0.006;
const PIVOT_KNOB_RADIUS = 0.026;
const PIVOT_PICKER_TUBE = 0.055;
const TRANSLATE_GIZMO_SIZE = 0.9;

const AXIS_COLOR: Record<PivotAxis, number> = {
  X: 0xff0000,
  Y: 0x00ff00,
  Z: 0x0000ff,
};
const ACTIVE_COLOR = 0xffff00;

function getAxisVector(axis: PivotAxis) {
  if (axis === "X") return new THREE.Vector3(1, 0, 0);
  if (axis === "Y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function getArcPoint(axis: PivotAxis, angle: number, radius: number) {
  const a = Math.cos(angle) * radius;
  const b = Math.sin(angle) * radius;
  if (axis === "X") return new THREE.Vector3(0, a, b);
  if (axis === "Y") return new THREE.Vector3(b, 0, a);
  return new THREE.Vector3(a, b, 0);
}

function createArcGeometry(axis: PivotAxis, radius: number, tube: number) {
  const segments = 48;
  const points: InstanceType<typeof THREE.Vector3>[] = [];
  for (let i = 0; i <= segments; i += 1) {
    points.push(getArcPoint(axis, (i / segments) * (Math.PI / 2), radius));
  }
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    segments,
    tube,
    8,
    false,
  );
}

function makeGizmoMaterial(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    fog: false,
    opacity,
    toneMapped: false,
    transparent: opacity < 1,
  });
}

export class ConnectedPivotGizmo {
  readonly group = new THREE.Group();

  private readonly camera: InstanceType<typeof THREE.PerspectiveCamera>;
  private readonly canvas: HTMLCanvasElement;
  private readonly onChange: () => void;
  private readonly onDragStateChange: (active: boolean) => void;
  private readonly requestRender: () => void;
  private readonly pickerGroup = new THREE.Group();
  private readonly handles = new Map<
    PivotAxis,
    Array<{ material: InstanceType<typeof THREE.MeshBasicMaterial> }>
  >();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane();
  private readonly pivotPoint = new THREE.Vector3();
  private readonly rayHit = new THREE.Vector3();
  private target: InstanceType<typeof THREE.Object3D> | null = null;
  private enabled = true;
  private hoveredAxis: PivotAxis | null = null;
  private dragState: PivotDragState | null = null;

  constructor(options: ConnectedPivotGizmoOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.onChange = options.onChange;
    this.onDragStateChange = options.onDragStateChange;
    this.requestRender = options.requestRender;
    this.group.name = "ConnectedPivotGizmo";
    this.group.visible = false;
    this.group.renderOrder = Infinity;

    this.createHandles();
    this.group.add(this.pickerGroup);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown, {
      capture: true,
    });
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerEnd);
    this.canvas.addEventListener("pointercancel", this.handlePointerEnd);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.finishDrag();
    this.updateHandleState();
  }

  setTarget(target: InstanceType<typeof THREE.Object3D> | null) {
    this.target = target;
    if (!target) this.finishDrag();
    if (!target) this.hoveredAxis = null;
    this.updateHandleState();
    this.update();
  }

  update() {
    if (!this.target) {
      this.group.visible = false;
      return;
    }
    this.target.updateMatrixWorld();
    this.group.visible = this.enabled;
    this.group.position.setFromMatrixPosition(this.target.matrixWorld);
    this.group.quaternion.identity();
    const factor =
      this.group.position.distanceTo(this.camera.position) *
      Math.min(
        (1.9 * Math.tan((Math.PI * this.camera.fov) / 360)) / this.camera.zoom,
        7,
      );
    this.group.scale.setScalar((factor * TRANSLATE_GIZMO_SIZE) / 4);
  }

  dispose() {
    this.finishDrag();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown, {
      capture: true,
    });
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerEnd);
    this.canvas.removeEventListener("pointercancel", this.handlePointerEnd);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.group.traverse((node: InstanceType<typeof THREE.Object3D>) => {
      const mesh = node as {
        geometry?: { dispose?: () => void };
        material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
      };
      mesh.geometry?.dispose?.();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose?.();
      } else {
        material?.dispose?.();
      }
    });
  }

  private createHandles() {
    for (const axis of ["X", "Y", "Z"] as PivotAxis[]) {
      const material = makeGizmoMaterial(AXIS_COLOR[axis]);
      const arc = new THREE.Mesh(
        createArcGeometry(axis, PIVOT_RADIUS, PIVOT_ARC_TUBE),
        material,
      );
      arc.name = `pivotRotate${axis}`;
      arc.renderOrder = Infinity;
      this.group.add(arc);

      const midpoint = getArcPoint(axis, Math.PI / 4, PIVOT_RADIUS);
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(PIVOT_KNOB_RADIUS, 16, 10),
        material.clone(),
      );
      knob.name = `pivotRotate${axis}Knob`;
      knob.position.copy(midpoint);
      knob.renderOrder = Infinity;
      this.group.add(knob);
      this.handles.set(axis, [
        { material },
        {
          material: knob.material as InstanceType<
            typeof THREE.MeshBasicMaterial
          >,
        },
      ]);

      const picker = new THREE.Mesh(
        createArcGeometry(axis, PIVOT_RADIUS, PIVOT_PICKER_TUBE),
        makeGizmoMaterial(AXIS_COLOR[axis], 0),
      );
      picker.name = `pivotRotate${axis}Picker`;
      picker.userData.pivotAxis = axis;
      this.pickerGroup.add(picker);
    }
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (!this.enabled || !this.target || event.button !== 0) return;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.pickerGroup, true);
    const axis = hits.find(
      (hit: { object: { userData: Record<string, unknown> } }) =>
        typeof hit.object.userData.pivotAxis === "string",
    )?.object.userData.pivotAxis as PivotAxis | undefined;
    if (!axis) return;
    const axisVector = getAxisVector(axis);
    if (!this.updatePivotVector(axisVector, this.rayHit)) return;
    this.dragState = {
      axis,
      axisVector,
      pointerId: event.pointerId,
      startQuaternion: this.target.quaternion.clone(),
      startVector: this.rayHit.clone(),
    };
    this.hoveredAxis = axis;
    this.updateHandleState();
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.onDragStateChange(true);
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.dragState) {
      this.updateHoveredAxis(event);
      return;
    }
    if (!this.target) return;
    if (event.pointerId !== this.dragState.pointerId) return;
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    if (!this.updatePivotVector(this.dragState.axisVector, this.rayHit)) return;
    const cross = new THREE.Vector3().crossVectors(
      this.dragState.startVector,
      this.rayHit,
    );
    const angle = Math.atan2(
      this.dragState.axisVector.dot(cross),
      this.dragState.startVector.dot(this.rayHit),
    );
    const delta = new THREE.Quaternion().setFromAxisAngle(
      this.dragState.axisVector,
      angle,
    );
    this.target.quaternion
      .copy(this.dragState.startQuaternion)
      .premultiply(delta);
    this.onChange();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  private handlePointerEnd = (event: PointerEvent) => {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.finishDrag();
  };

  private handlePointerLeave = () => {
    if (this.dragState || !this.hoveredAxis) return;
    this.hoveredAxis = null;
    this.updateHandleState();
    this.requestRender();
  };

  private finishDrag() {
    if (!this.dragState) return;
    if (this.canvas.hasPointerCapture(this.dragState.pointerId)) {
      this.canvas.releasePointerCapture(this.dragState.pointerId);
    }
    this.dragState = null;
    this.updateHandleState();
    this.onDragStateChange(false);
  }

  private updateHoveredAxis(event: PointerEvent) {
    if (!this.enabled || !this.target) {
      if (!this.hoveredAxis) return;
      this.hoveredAxis = null;
      this.updateHandleState();
      this.requestRender();
      return;
    }
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.pickerGroup, true);
    const nextAxis = (hits.find(
      (hit: { object: { userData: Record<string, unknown> } }) =>
        typeof hit.object.userData.pivotAxis === "string",
    )?.object.userData.pivotAxis ?? null) as PivotAxis | null;
    if (nextAxis === this.hoveredAxis) return;
    this.hoveredAxis = nextAxis;
    this.updateHandleState();
    this.requestRender();
  }

  private updateHandleState() {
    const activeAxis = this.dragState?.axis ?? this.hoveredAxis;
    for (const [axis, handles] of this.handles) {
      const color = axis === activeAxis ? ACTIVE_COLOR : AXIS_COLOR[axis];
      for (const handle of handles) handle.material.color.setHex(color);
    }
  }

  private updatePointer(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private updatePivotVector(
    axisVector: InstanceType<typeof THREE.Vector3>,
    result: InstanceType<typeof THREE.Vector3>,
  ) {
    if (!this.target) return false;
    this.pivotPoint.setFromMatrixPosition(this.target.matrixWorld);
    this.dragPlane.setFromNormalAndCoplanarPoint(axisVector, this.pivotPoint);
    const hit = this.raycaster.ray.intersectPlane(this.dragPlane, result);
    if (!hit) return false;
    result.sub(this.pivotPoint);
    const length = result.length();
    if (length < 1e-5) return false;
    result.multiplyScalar(1 / length);
    return true;
  }
}
