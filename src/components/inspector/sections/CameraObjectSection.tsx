import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
  type FrameObject,
} from "../../../core/types";
import { mutedCaps } from "../../../app/config";
import { Input } from "../../ui/input";
import { useObjectInspector } from "../objectInspectorContext";

/**
 * Inspector section for a `type: "camera"` FrameObject. Reads the camera's
 * `props` (CameraObjectProps), exposes position / rotation / FOV controls,
 * and writes back via the standard `onChange` mutator from the inspector
 * context. Per-object editing means selecting the camera layer in compose
 * mode opens these controls — matching After Effects' Camera 1 layer model.
 */
export function CameraObjectSection() {
  const { object, onChange } = useObjectInspector();
  const props = readObjectCameraProps(object);

  function setProps(updater: (p: CameraObjectProps) => CameraObjectProps) {
    onChange((current) => {
      const currentProps = readObjectCameraProps(current);
      const next = updater(currentProps);
      return { ...current, props: { ...current.props, ...next } };
    });
  }

  function setPosition(axis: "x" | "y" | "z", value: string) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    setProps((p) => ({ ...p, position: { ...p.position, [axis]: num } }));
  }
  function setRotation(axis: "x" | "y" | "z", value: string) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    setProps((p) => ({ ...p, rotation: { ...p.rotation, [axis]: num } }));
  }
  function setFov(value: string) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    setProps((p) => ({ ...p, fov: Math.max(1, Math.min(179, num)) }));
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className={mutedCaps}>Position</span>
        <div className="grid grid-cols-3 gap-2">
          <Input
            type="number"
            value={props.position.x}
            onChange={(e) => setPosition("x", e.target.value)}
            aria-label="Camera position X"
          />
          <Input
            type="number"
            value={props.position.y}
            onChange={(e) => setPosition("y", e.target.value)}
            aria-label="Camera position Y"
          />
          <Input
            type="number"
            value={props.position.z}
            onChange={(e) => setPosition("z", e.target.value)}
            aria-label="Camera position Z"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className={mutedCaps}>Rotation (°)</span>
        <div className="grid grid-cols-3 gap-2">
          <Input
            type="number"
            value={props.rotation.x}
            onChange={(e) => setRotation("x", e.target.value)}
            aria-label="Camera rotation X"
          />
          <Input
            type="number"
            value={props.rotation.y}
            onChange={(e) => setRotation("y", e.target.value)}
            aria-label="Camera rotation Y"
          />
          <Input
            type="number"
            value={props.rotation.z}
            onChange={(e) => setRotation("z", e.target.value)}
            aria-label="Camera rotation Z"
          />
        </div>
      </div>

      <label className={`grid gap-1.5 ${mutedCaps}`}>
        FOV (°)
        <Input
          type="number"
          min={1}
          max={179}
          step={1}
          value={props.fov}
          onChange={(e) => setFov(e.target.value)}
        />
      </label>
    </div>
  );
}

function readObjectCameraProps(object: FrameObject): CameraObjectProps {
  const def = DEFAULT_CAMERA_OBJECT_PROPS;
  const raw = (object.props ?? {}) as Record<string, unknown>;
  const readVec3 = (
    v: unknown,
    fallback: { x: number; y: number; z: number },
  ) => {
    if (!v || typeof v !== "object") return { ...fallback };
    const o = v as Record<string, unknown>;
    const num = (k: "x" | "y" | "z") => {
      const n = o[k];
      return typeof n === "number" && Number.isFinite(n) ? n : fallback[k];
    };
    return { x: num("x"), y: num("y"), z: num("z") };
  };
  const num = (key: "fov" | "near" | "far") => {
    const n = raw[key];
    return typeof n === "number" && Number.isFinite(n) ? n : def[key];
  };
  return {
    position: readVec3(raw.position, def.position),
    rotation: readVec3(raw.rotation, def.rotation),
    fov: num("fov"),
    near: num("near"),
    far: num("far"),
  };
}
