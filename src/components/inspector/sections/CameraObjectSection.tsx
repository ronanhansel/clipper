import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  type CameraObjectProps,
  type FrameObject,
} from "../../../core/types";
import {
  evaluateObjectState,
  removePropertyKeyframe,
  upsertPropertyKeyframe,
} from "../../../core/propertyRegistry";
import { mutedCaps } from "../../../app/config";
import { livePreviewScrubCommitThrottleMs } from "../../../app/services/scrubInteractionService";
import { Input } from "../../ui/input";
import { useObjectInspector } from "../objectInspectorContext";
import {
  getPropertyTrackKeyframeAtTime,
  hasPropertyTrack,
} from "../inspectorShared";

type CameraTrackPath =
  | "props.position.x"
  | "props.position.y"
  | "props.position.z"
  | "props.rotation.x"
  | "props.rotation.y"
  | "props.rotation.z"
  | "props.fov";

const POSITION_FIELDS: ReadonlyArray<{
  axis: "x" | "y" | "z";
  path: CameraTrackPath;
  ariaLabel: string;
}> = [
  { axis: "x", path: "props.position.x", ariaLabel: "Camera position X" },
  { axis: "y", path: "props.position.y", ariaLabel: "Camera position Y" },
  { axis: "z", path: "props.position.z", ariaLabel: "Camera position Z" },
];

const ROTATION_FIELDS: ReadonlyArray<{
  axis: "x" | "y" | "z";
  path: CameraTrackPath;
  ariaLabel: string;
}> = [
  { axis: "x", path: "props.rotation.x", ariaLabel: "Camera rotation X" },
  { axis: "y", path: "props.rotation.y", ariaLabel: "Camera rotation Y" },
  { axis: "z", path: "props.rotation.z", ariaLabel: "Camera rotation Z" },
];

/**
 * Inspector section for a `type: "camera"` FrameObject.
 *
 * Each leaf field (position.x, rotation.y, fov, …) is a keyframable
 * `props.*.*` track via the property registry's nested dynamic-props
 * support. Number-scrub previews land on `onPreview` for instant 3D
 * updates; commit/typing writes either a keyframe (when a track exists)
 * or the base value.
 */
export function CameraObjectSection() {
  const { object, onChange, onPreview, readEffectiveTime } =
    useObjectInspector();
  const props = readObjectCameraProps(object);

  function readBase(path: CameraTrackPath): number {
    if (path === "props.fov") return props.fov;
    if (path === "props.position.x") return props.position.x;
    if (path === "props.position.y") return props.position.y;
    if (path === "props.position.z") return props.position.z;
    if (path === "props.rotation.x") return props.rotation.x;
    if (path === "props.rotation.y") return props.rotation.y;
    return props.rotation.z;
  }

  function liveValue(path: CameraTrackPath): number {
    if (!hasPropertyTrack(object, path)) return readBase(path);
    const evaluated = evaluateCameraPropsAt(object, readEffectiveTime());
    return readCameraPropAtPath(evaluated, path);
  }

  function writeBase(path: CameraTrackPath, value: number) {
    onChange((current) => writeNestedNumber(current, path, value));
  }

  function previewBase(path: CameraTrackPath, value: number) {
    // The 3D preview path (`useComposeObjectPreview`) reads the full
    // CameraObjectProps off the object it receives and dispatches them
    // straight to `clipper:camera-preview`. If we only mutate the
    // single axis the user is touching, the other axes leak their
    // *base* values (the static t=0 props) and the 3D camera snaps to
    // those instead of staying at the interpolated playhead values.
    // Resolve the full evaluated camera state at the current time and
    // overlay just the changing axis so the dispatched preview keeps
    // the other axes at the playhead's interpolated values.
    onPreview?.((current) => {
      const evaluated = evaluateCameraPropsAt(current, readEffectiveTime());
      const next = writeCameraPropAtPath(evaluated, path, value);
      return { ...current, props: { ...(current.props ?? {}), ...next } };
    });
  }

  function commit(path: CameraTrackPath, raw: string | number) {
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num)) return;
    const clamped = path === "props.fov" ? clampFov(num) : num;
    if (hasPropertyTrack(object, path)) {
      const time = readEffectiveTime();
      onChange((current) =>
        upsertPropertyKeyframe(current, path, time, clamped),
      );
    } else {
      writeBase(path, clamped);
    }
  }

  function toggleKeyframe(path: CameraTrackPath) {
    const time = readEffectiveTime();
    const existing = getPropertyTrackKeyframeAtTime(object, path, time);
    if (existing) {
      onChange((current) =>
        removePropertyKeyframe(current, path, existing.time, time),
      );
    } else {
      const value = liveValue(path);
      onChange((current) => upsertPropertyKeyframe(current, path, time, value));
    }
  }

  function isKeyframedNow(path: CameraTrackPath) {
    const time = readEffectiveTime();
    return Boolean(getPropertyTrackKeyframeAtTime(object, path, time));
  }

  return (
    <div className="grid gap-3">
      <FieldRow label="Position">
        {POSITION_FIELDS.map((field) => (
          <KeyframableNumberInput
            key={field.path}
            ariaLabel={field.ariaLabel}
            unitPrefix={field.axis.toUpperCase()}
            step={1}
            value={liveValue(field.path)}
            active={isKeyframedNow(field.path)}
            onPreview={(value) => previewBase(field.path, value)}
            onCommit={(value) => commit(field.path, value)}
            onToggleKeyframe={() => toggleKeyframe(field.path)}
          />
        ))}
      </FieldRow>

      <FieldRow label="Rotation (°)">
        {ROTATION_FIELDS.map((field) => (
          <KeyframableNumberInput
            key={field.path}
            ariaLabel={field.ariaLabel}
            unitPrefix={field.axis.toUpperCase()}
            step={1}
            value={liveValue(field.path)}
            active={isKeyframedNow(field.path)}
            onPreview={(value) => previewBase(field.path, value)}
            onCommit={(value) => commit(field.path, value)}
            onToggleKeyframe={() => toggleKeyframe(field.path)}
          />
        ))}
      </FieldRow>

      <div className="grid gap-1.5">
        <span className={mutedCaps}>FOV</span>
        <KeyframableNumberInput
          ariaLabel="Camera FOV"
          unitPrefix="°"
          step={1}
          min={1}
          max={179}
          value={liveValue("props.fov")}
          active={isKeyframedNow("props.fov")}
          onPreview={(value) => previewBase("props.fov", clampFov(value))}
          onCommit={(value) => commit("props.fov", clampFov(value))}
          onToggleKeyframe={() => toggleKeyframe("props.fov")}
        />
      </div>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className={mutedCaps}>{label}</span>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function KeyframableNumberInput({
  ariaLabel,
  unitPrefix,
  step,
  min,
  max,
  value,
  active,
  onPreview,
  onCommit,
  onToggleKeyframe,
}: {
  ariaLabel: string;
  unitPrefix: string;
  step: number;
  min?: number;
  max?: number;
  value: number;
  active: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onToggleKeyframe: () => void;
}) {
  return (
    <span className="relative block">
      <Input
        aria-label={ariaLabel}
        className={`pr-7 ${active ? "border-white" : ""}`}
        type="number"
        min={min}
        max={max}
        step={step}
        unitPrefix={unitPrefix}
        numberScrubMode="preview"
        numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
        value={value}
        onNumberScrubPreview={onPreview}
        onNumberScrubCommit={onCommit}
        onChange={(event) => {
          const num = Number(event.target.value);
          if (Number.isFinite(num)) onCommit(num);
        }}
      />
      <button
        aria-label={
          active
            ? `Remove ${ariaLabel} keyframe at playhead`
            : `Add ${ariaLabel} keyframe at playhead`
        }
        aria-pressed={active}
        className={`absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
          active
            ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
            : "border-[#6f7684] bg-[#12151d] hover:border-white"
        }`}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          onToggleKeyframe();
        }}
      />
    </span>
  );
}

function clampFov(value: number) {
  return Math.max(1, Math.min(179, value));
}

function writeNestedNumber(
  object: FrameObject,
  path: string,
  value: number,
): FrameObject {
  const segments = path.slice("props.".length).split(".");
  const root: Record<string, unknown> = { ...(object.props ?? {}) };
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const existing = cursor[segment];
    const next =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[segment] = next;
    cursor = next;
  }
  cursor[segments[segments.length - 1]] = value;
  return { ...object, props: root as FrameObject["props"] };
}

function readObjectCameraProps(object: FrameObject) {
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

/**
 * Resolve the full camera props at `time` by evaluating every animated
 * `props.*` track on the object. Falls back to the object's static
 * base values for axes without a track. The result is a complete,
 * interpolated `CameraObjectProps` snapshot — the inputs and the 3D
 * preview overlay both consume this so non-edited axes don't snap to
 * their static base values during a single-axis scrub.
 */
function evaluateCameraPropsAt(
  object: FrameObject,
  time: number,
): CameraObjectProps {
  const evaluated = evaluateObjectState(object, time);
  const fallback = readObjectCameraProps(object);
  const props = evaluated.props as Record<string, unknown>;
  const readVec3 = (v: unknown, base: { x: number; y: number; z: number }) => {
    if (!v || typeof v !== "object") return { ...base };
    const o = v as Record<string, unknown>;
    const num = (k: "x" | "y" | "z") => {
      const n = o[k];
      return typeof n === "number" && Number.isFinite(n) ? n : base[k];
    };
    return { x: num("x"), y: num("y"), z: num("z") };
  };
  const numField = (key: "fov" | "near" | "far") => {
    const n = props[key];
    return typeof n === "number" && Number.isFinite(n) ? n : fallback[key];
  };
  return {
    position: readVec3(props.position, fallback.position),
    rotation: readVec3(props.rotation, fallback.rotation),
    fov: numField("fov"),
    near: numField("near"),
    far: numField("far"),
  };
}

function readCameraPropAtPath(
  props: CameraObjectProps,
  path: CameraTrackPath,
): number {
  if (path === "props.fov") return props.fov;
  if (path === "props.position.x") return props.position.x;
  if (path === "props.position.y") return props.position.y;
  if (path === "props.position.z") return props.position.z;
  if (path === "props.rotation.x") return props.rotation.x;
  if (path === "props.rotation.y") return props.rotation.y;
  return props.rotation.z;
}

function writeCameraPropAtPath(
  props: CameraObjectProps,
  path: CameraTrackPath,
  value: number,
): CameraObjectProps {
  if (path === "props.fov") return { ...props, fov: value };
  if (path === "props.position.x")
    return { ...props, position: { ...props.position, x: value } };
  if (path === "props.position.y")
    return { ...props, position: { ...props.position, y: value } };
  if (path === "props.position.z")
    return { ...props, position: { ...props.position, z: value } };
  if (path === "props.rotation.x")
    return { ...props, rotation: { ...props.rotation, x: value } };
  if (path === "props.rotation.y")
    return { ...props, rotation: { ...props.rotation, y: value } };
  return { ...props, rotation: { ...props.rotation, z: value } };
}
