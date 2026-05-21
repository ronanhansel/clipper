import * as THREE from "three";

/**
 * Minimal frustum wireframe — replacement for `THREE.CameraHelper` that
 * skips everything except the near + far rectangles and the 4 edges
 * connecting their corners.
 *
 * `THREE.CameraHelper` draws cone spokes from the camera origin to the
 * 4 near-plane corners. In the AE-style author viewport those spokes
 * cross visibly through any layer that sits inside the frustum,
 * looking like X marks on each layer (image #12 / #13).
 *
 * This outline visualises the same volume — same near rectangle, same
 * far rectangle, same edges — without any line passing through the
 * interior. The user gets the bounding-box framing (the orange cuboid
 * in image #13) and nothing else.
 */
const _vector = new THREE.Vector3();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _stagingCamera: any = new THREE.Camera();

const EDGES: ReadonlyArray<readonly [string, string]> = [
  // near rectangle
  ["n1", "n2"],
  ["n2", "n4"],
  ["n4", "n3"],
  ["n3", "n1"],
  // far rectangle
  ["f1", "f2"],
  ["f2", "f4"],
  ["f4", "f3"],
  ["f3", "f1"],
  // sides connecting near → far corners
  ["n1", "f1"],
  ["n2", "f2"],
  ["n3", "f3"],
  ["n4", "f4"],
];

const NDC_W = 1;
const NDC_H = 1;

const NDC_FOR_KEY: Record<string, [number, number]> = {
  n1: [-NDC_W, -NDC_H],
  n2: [NDC_W, -NDC_H],
  n3: [-NDC_W, NDC_H],
  n4: [NDC_W, NDC_H],
  f1: [-NDC_W, -NDC_H],
  f2: [NDC_W, -NDC_H],
  f3: [-NDC_W, NDC_H],
  f4: [NDC_W, NDC_H],
};

export class FrustumOutline extends THREE.LineSegments {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly camera: any;
  private readonly pointMap: Record<string, number[]>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(camera: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geometry: any = new THREE.BufferGeometry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const material: any = new THREE.LineBasicMaterial({
      color: 0xffaa00,
      toneMapped: false,
    });
    const vertices: number[] = [];
    const pointMap: Record<string, number[]> = {};
    for (const [a, b] of EDGES) {
      addPoint(a, vertices, pointMap);
      addPoint(b, vertices, pointMap);
    }
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    super(geometry, material);
    this.type = "FrustumOutline";
    this.camera = camera;
    if (this.camera.updateProjectionMatrix)
      this.camera.updateProjectionMatrix();
    // Mesh's matrix is bound to the camera's world matrix — points are
    // unprojected in camera-local space and rendered through this matrix
    // so they land in the camera's actual world position/orientation.
    this.matrix = camera.matrixWorld;
    this.matrixAutoUpdate = false;
    this.pointMap = pointMap;
    this.update();
  }

  update(): void {
    _stagingCamera.projectionMatrixInverse.copy(
      this.camera.projectionMatrixInverse,
    );
    const nearZ = -1;
    const farZ = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geometry: any = this.geometry;
    for (const key of Object.keys(NDC_FOR_KEY)) {
      const [x, y] = NDC_FOR_KEY[key];
      const z = key.startsWith("n") ? nearZ : farZ;
      setPoint(key, this.pointMap, geometry, x, y, z);
    }
    geometry.getAttribute("position").needsUpdate = true;
  }

  dispose(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.geometry as any).dispose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.material as any).dispose();
  }
}

function addPoint(
  key: string,
  vertices: number[],
  pointMap: Record<string, number[]>,
): void {
  vertices.push(0, 0, 0);
  if (pointMap[key] === undefined) pointMap[key] = [];
  pointMap[key].push(vertices.length / 3 - 1);
}

function setPoint(
  key: string,
  pointMap: Record<string, number[]>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any,
  x: number,
  y: number,
  z: number,
): void {
  _vector.set(x, y, z).unproject(_stagingCamera);
  const indices = pointMap[key];
  if (!indices) return;
  const position = geometry.getAttribute("position");
  for (const idx of indices) {
    position.setXYZ(idx, _vector.x, _vector.y, _vector.z);
  }
}
