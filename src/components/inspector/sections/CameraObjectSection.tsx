import { type CameraObjectProps, type FrameObject } from "../../../core/types";
import {
  removePropertyKeyframe,
  upsertPropertyKeyframe,
} from "../../../core/propertyRegistry";
import { mutedCaps } from "../../../app/config";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Switch } from "../../ui/switch";
import { useObjectInspector } from "../objectInspectorContext";
import { KeyframableNumberInput } from "../KeyframableNumberInput";
import {
  getPropertyTrackKeyframeAtTime,
  hasPropertyTrack,
} from "../inspectorShared";
import {
  evaluateCameraObjectPropsAt,
  readCameraObjectProps,
} from "../../preview/compositors/useCompositionCamera";

type CameraTrackPath =
  | "props.position.x"
  | "props.position.y"
  | "props.position.z"
  | "props.rotation.x"
  | "props.rotation.y"
  | "props.rotation.z"
  | "props.fov"
  | "props.near"
  | "props.far"
  | "props.sensor.width"
  | "props.sensor.height"
  | "props.dof.focusDistance"
  | "props.dof.fNumber"
  | "props.dof.blurLevel"
  | "props.dof.maxBlurPx";

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

const FOCAL_LENGTH_PRESETS_MM = [15, 24, 35, 50, 80, 135, 200] as const;

const SENSOR_PRESETS: ReadonlyArray<{
  label: string;
  width: number;
  height: number;
}> = [
  { label: "Full Frame", width: 36, height: 24 },
  { label: "APS-C", width: 24.89, height: 18.66 },
  { label: "Super 35", width: 24.89, height: 18.66 },
  { label: "Micro 4/3", width: 17.3, height: 13 },
];

/**
 * Inspector section for a `type: "camera"` FrameObject.
 *
 * Each leaf field (position.x, rotation.y, fov, sensor.width, dof.fNumber, …)
 * is a keyframable `props.*` track via the property registry's nested
 * dynamic-props support. Number-scrub previews land on `onPreview` for
 * instant 3D updates; commit/typing writes either a keyframe (when a track
 * exists) or the base value.
 *
 * Focal length is *derived* from `fov` + `sensor.height` and writes back to
 * `props.fov`, so its keyframe diamond toggles the fov keyframe. The
 * `dof.enabled` switch and `autoOrient` select are static (non-keyframable)
 * scalar props written directly through `onChange`.
 */
export function CameraObjectSection() {
  const { object, onChange, onPreview, readEffectiveTime } =
    useObjectInspector();
  const props = readCameraObjectProps(object);

  function readBase(path: CameraTrackPath): number {
    return readCameraPropAtPath(props, path);
  }

  function liveValue(path: CameraTrackPath): number {
    if (!hasPropertyTrack(object, path)) return readBase(path);
    const evaluated = evaluateCameraObjectPropsAt(object, readEffectiveTime());
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
      const evaluated = evaluateCameraObjectPropsAt(
        current,
        readEffectiveTime(),
      );
      const next = writeCameraPropAtPath(evaluated, path, value);
      return { ...current, props: { ...(current.props ?? {}), ...next } };
    });
  }

  function clampForPath(path: CameraTrackPath, value: number): number {
    if (path === "props.fov") return clampFov(value);
    if (path === "props.near" || path === "props.far")
      return clampPositive(value, 0.01);
    if (path === "props.sensor.width" || path === "props.sensor.height")
      return Math.max(1, Math.min(200, value));
    if (path === "props.dof.focusDistance") return clampPositive(value, 0);
    if (path === "props.dof.fNumber") return Math.max(0.5, Math.min(64, value));
    if (path === "props.dof.blurLevel") return Math.max(0, Math.min(4, value));
    if (path === "props.dof.maxBlurPx")
      return Math.max(0, Math.min(256, value));
    return value;
  }

  function commit(path: CameraTrackPath, raw: string | number) {
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num)) return;
    const clamped = clampForPath(path, num);
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

  // Focal length is derived from fov + sensor.height; commit translates the
  // edited focal back into a fov so the underlying track stays canonical.
  const sensorHeightLive = liveValue("props.sensor.height");
  const fovLive = liveValue("props.fov");
  const focalLengthLive = focalLengthFromFov(fovLive, sensorHeightLive);

  function commitFocalLength(focalLengthMm: number) {
    if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) return;
    const fov = fovFromFocalLength(focalLengthMm, sensorHeightLive);
    commit("props.fov", fov);
  }

  function previewFocalLength(focalLengthMm: number) {
    if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) return;
    const fov = clampFov(fovFromFocalLength(focalLengthMm, sensorHeightLive));
    previewBase("props.fov", fov);
  }

  function applySensorPreset(width: number, height: number) {
    onChange((current) => {
      const currentProps = (current.props ?? {}) as Record<string, unknown>;
      return {
        ...current,
        props: {
          ...currentProps,
          sensor: { width, height },
        },
      };
    });
  }

  function setAutoOrient(value: "off" | "along-path") {
    onChange((current) => {
      const currentProps = (current.props ?? {}) as Record<string, unknown>;
      return {
        ...current,
        props: { ...currentProps, autoOrient: value },
      };
    });
  }

  function setDofEnabled(enabled: boolean) {
    onChange((current) => {
      const evaluated = evaluateCameraObjectPropsAt(
        current,
        readEffectiveTime(),
      );
      const currentProps = (current.props ?? {}) as Record<string, unknown>;
      return {
        ...current,
        props: {
          ...currentProps,
          dof: { ...evaluated.dof, enabled },
        },
      };
    });
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
        <span className={mutedCaps}>Auto-Orient</span>
        <Select
          value={props.autoOrient}
          onValueChange={(value) =>
            setAutoOrient(value === "along-path" ? "along-path" : "off")
          }
        >
          <SelectTrigger className="h-8 rounded-[8px] px-2 text-xs">
            <SelectValue aria-label={props.autoOrient} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="along-path">Along Path</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <span className={mutedCaps}>Lens</span>
        <div className="flex flex-wrap gap-1">
          {FOCAL_LENGTH_PRESETS_MM.map((mm) => (
            <button
              key={mm}
              type="button"
              aria-label={`Set focal length to ${mm}mm`}
              className="rounded-[6px] border border-[#2d313b] bg-[#171920] px-2 py-1 text-[10px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:text-white"
              onClick={() => commitFocalLength(mm)}
            >
              {mm}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <span className={mutedCaps}>Focal Length (mm)</span>
          <KeyframableNumberInput
            ariaLabel="Camera focal length"
            unitPrefix="mm"
            step={1}
            min={1}
            max={1000}
            value={focalLengthLive}
            active={isKeyframedNow("props.fov")}
            onPreview={(value) => previewFocalLength(value)}
            onCommit={(value) => commitFocalLength(value)}
            onToggleKeyframe={() => toggleKeyframe("props.fov")}
          />
        </div>
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

      <div className="grid gap-2">
        <span className={mutedCaps}>Sensor (mm)</span>
        <div className="grid grid-cols-2 gap-2">
          <KeyframableNumberInput
            ariaLabel="Camera sensor width"
            unitPrefix="X"
            step={0.1}
            min={1}
            max={200}
            value={liveValue("props.sensor.width")}
            active={isKeyframedNow("props.sensor.width")}
            onPreview={(value) => previewBase("props.sensor.width", value)}
            onCommit={(value) => commit("props.sensor.width", value)}
            onToggleKeyframe={() => toggleKeyframe("props.sensor.width")}
          />
          <KeyframableNumberInput
            ariaLabel="Camera sensor height"
            unitPrefix="Y"
            step={0.1}
            min={1}
            max={200}
            value={liveValue("props.sensor.height")}
            active={isKeyframedNow("props.sensor.height")}
            onPreview={(value) => previewBase("props.sensor.height", value)}
            onCommit={(value) => commit("props.sensor.height", value)}
            onToggleKeyframe={() => toggleKeyframe("props.sensor.height")}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {SENSOR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              aria-label={`Set sensor to ${preset.label}`}
              className="rounded-[6px] border border-[#2d313b] bg-[#171920] px-2 py-1 text-[10px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:text-white"
              onClick={() => applySensorPreset(preset.width, preset.height)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className={mutedCaps}>Clipping</span>
        <div className="grid grid-cols-2 gap-2">
          <KeyframableNumberInput
            ariaLabel="Camera near clipping plane"
            unitPrefix="N"
            step={1}
            min={0.01}
            value={liveValue("props.near")}
            active={isKeyframedNow("props.near")}
            onPreview={(value) => previewBase("props.near", value)}
            onCommit={(value) => commit("props.near", value)}
            onToggleKeyframe={() => toggleKeyframe("props.near")}
          />
          <KeyframableNumberInput
            ariaLabel="Camera far clipping plane"
            unitPrefix="F"
            step={1}
            min={0.01}
            value={liveValue("props.far")}
            active={isKeyframedNow("props.far")}
            onPreview={(value) => previewBase("props.far", value)}
            onCommit={(value) => commit("props.far", value)}
            onToggleKeyframe={() => toggleKeyframe("props.far")}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <span className={mutedCaps}>Depth of Field</span>
        <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#dfe2ea]">
          <span>Enabled</span>
          <Switch
            aria-label="Toggle depth of field"
            checked={props.dof.enabled}
            onCheckedChange={(checked) => setDofEnabled(checked)}
          />
        </label>
        {props.dof.enabled ? (
          <>
            <div className="grid gap-1.5">
              <span className={mutedCaps}>Focus Distance</span>
              <KeyframableNumberInput
                ariaLabel="Camera focus distance"
                unitPrefix=""
                step={1}
                min={0}
                value={liveValue("props.dof.focusDistance")}
                active={isKeyframedNow("props.dof.focusDistance")}
                onPreview={(value) =>
                  previewBase("props.dof.focusDistance", value)
                }
                onCommit={(value) => commit("props.dof.focusDistance", value)}
                onToggleKeyframe={() =>
                  toggleKeyframe("props.dof.focusDistance")
                }
              />
            </div>
            <div className="grid gap-1.5">
              <span className={mutedCaps}>F-number</span>
              <KeyframableNumberInput
                ariaLabel="Camera f-number"
                unitPrefix="f/"
                step={0.1}
                min={0.5}
                max={64}
                value={liveValue("props.dof.fNumber")}
                active={isKeyframedNow("props.dof.fNumber")}
                onPreview={(value) => previewBase("props.dof.fNumber", value)}
                onCommit={(value) => commit("props.dof.fNumber", value)}
                onToggleKeyframe={() => toggleKeyframe("props.dof.fNumber")}
              />
            </div>
            <div className="grid gap-1.5">
              <span className={mutedCaps}>Blur Level</span>
              <KeyframableNumberInput
                ariaLabel="Camera depth-of-field blur level"
                unitPrefix=""
                step={0.05}
                min={0}
                max={4}
                value={liveValue("props.dof.blurLevel")}
                active={isKeyframedNow("props.dof.blurLevel")}
                onPreview={(value) => previewBase("props.dof.blurLevel", value)}
                onCommit={(value) => commit("props.dof.blurLevel", value)}
                onToggleKeyframe={() => toggleKeyframe("props.dof.blurLevel")}
              />
            </div>
            <div className="grid gap-1.5">
              <span className={mutedCaps}>Max Blur (px)</span>
              <KeyframableNumberInput
                ariaLabel="Camera max blur radius"
                unitPrefix="px"
                step={1}
                min={0}
                max={256}
                value={liveValue("props.dof.maxBlurPx")}
                active={isKeyframedNow("props.dof.maxBlurPx")}
                onPreview={(value) => previewBase("props.dof.maxBlurPx", value)}
                onCommit={(value) => commit("props.dof.maxBlurPx", value)}
                onToggleKeyframe={() => toggleKeyframe("props.dof.maxBlurPx")}
              />
            </div>
          </>
        ) : null}
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

function clampFov(value: number) {
  return Math.max(1, Math.min(179, value));
}

function clampPositive(value: number, min = 0) {
  return Math.max(min, value);
}

function focalLengthFromFov(fovDeg: number, sensorHeightMm: number): number {
  if (!Number.isFinite(fovDeg) || !Number.isFinite(sensorHeightMm)) return 0;
  if (sensorHeightMm <= 0) return 0;
  const fovRad = (fovDeg * Math.PI) / 180;
  const t = Math.tan(fovRad / 2);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return sensorHeightMm / (2 * t);
}

function fovFromFocalLength(
  focalLengthMm: number,
  sensorHeightMm: number,
): number {
  if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) return 50;
  if (!Number.isFinite(sensorHeightMm) || sensorHeightMm <= 0) return 50;
  return (2 * Math.atan(sensorHeightMm / (2 * focalLengthMm)) * 180) / Math.PI;
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

function readCameraPropAtPath(
  props: CameraObjectProps,
  path: CameraTrackPath,
): number {
  switch (path) {
    case "props.fov":
      return props.fov;
    case "props.near":
      return props.near;
    case "props.far":
      return props.far;
    case "props.position.x":
      return props.position.x;
    case "props.position.y":
      return props.position.y;
    case "props.position.z":
      return props.position.z;
    case "props.rotation.x":
      return props.rotation.x;
    case "props.rotation.y":
      return props.rotation.y;
    case "props.rotation.z":
      return props.rotation.z;
    case "props.sensor.width":
      return props.sensor.width;
    case "props.sensor.height":
      return props.sensor.height;
    case "props.dof.focusDistance":
      return props.dof.focusDistance;
    case "props.dof.fNumber":
      return props.dof.fNumber;
    case "props.dof.blurLevel":
      return props.dof.blurLevel;
    case "props.dof.maxBlurPx":
      return props.dof.maxBlurPx;
  }
}

function writeCameraPropAtPath(
  props: CameraObjectProps,
  path: CameraTrackPath,
  value: number,
): CameraObjectProps {
  switch (path) {
    case "props.fov":
      return { ...props, fov: value };
    case "props.near":
      return { ...props, near: value };
    case "props.far":
      return { ...props, far: value };
    case "props.position.x":
      return { ...props, position: { ...props.position, x: value } };
    case "props.position.y":
      return { ...props, position: { ...props.position, y: value } };
    case "props.position.z":
      return { ...props, position: { ...props.position, z: value } };
    case "props.rotation.x":
      return { ...props, rotation: { ...props.rotation, x: value } };
    case "props.rotation.y":
      return { ...props, rotation: { ...props.rotation, y: value } };
    case "props.rotation.z":
      return { ...props, rotation: { ...props.rotation, z: value } };
    case "props.sensor.width":
      return { ...props, sensor: { ...props.sensor, width: value } };
    case "props.sensor.height":
      return { ...props, sensor: { ...props.sensor, height: value } };
    case "props.dof.focusDistance":
      return { ...props, dof: { ...props.dof, focusDistance: value } };
    case "props.dof.fNumber":
      return { ...props, dof: { ...props.dof, fNumber: value } };
    case "props.dof.blurLevel":
      return { ...props, dof: { ...props.dof, blurLevel: value } };
    case "props.dof.maxBlurPx":
      return { ...props, dof: { ...props.dof, maxBlurPx: value } };
  }
}
