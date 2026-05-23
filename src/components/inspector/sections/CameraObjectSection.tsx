import {
  CAMERA_DOF_MAX_BLUR_PX,
  CAMERA_DOF_MAX_F_NUMBER,
  CAMERA_DOF_MIN_F_NUMBER,
  CAMERA_DOF_BLUR_MODES,
  CAMERA_BOKEH_PRESETS,
  type CameraAutoOrient,
  type CameraBokehPreset,
  type CameraDofBlurMode,
  type CameraObjectProps,
  type FrameObject,
} from "../../../core/types";
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
  applyCameraTargetAutomation,
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
  | "props.dof.maxBlurPx"
  | "props.lens.distortion.amount"
  | "props.lens.chromaticAberration.amountPx"
  | "props.autoFocus.zOffset"
  | "props.lockTarget.offset.x"
  | "props.lockTarget.offset.y"
  | "props.lockTarget.offset.z";
type CameraBooleanTrackPath = "props.live";

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

const BOKEH_PRESET_LABELS: Record<CameraBokehPreset, string> = {
  spherical: "Spherical",
  anamorphic: "Anamorphic",
  hex: "Hex",
  octagon: "Octagon",
  star: "Star",
};

const DOF_BLUR_MODE_LABELS: Record<CameraDofBlurMode, string> = {
  all: "All",
  near: "Near Only",
  far: "Far Only",
};

const AUTO_ORIENT_LABELS: Record<CameraAutoOrient, string> = {
  off: "Off",
  "along-path": "Along Path",
  lock: "Lock",
};

type CameraTargetOption = {
  object: FrameObject;
  number: number;
};

/**
 * Inspector section for a `type: "camera"` FrameObject.
 *
 * Each leaf field (position.x, rotation.y, fov, dof.fNumber, ...)
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
  const {
    object,
    compositionObjects,
    compositionFrame,
    onChange,
    onPreview,
    readEffectiveTime,
  } = useObjectInspector();
  const props = readCameraObjectProps(object);
  const targetOptions = compositionObjects
    .map((item, index) => ({
      object: item,
      number: compositionObjects.length - index,
    }))
    .filter((item) => item.object.id !== object.id);

  function readBase(path: CameraTrackPath): number {
    return readCameraPropAtPath(props, path);
  }

  function liveValue(path: CameraTrackPath): number {
    if (!hasPropertyTrack(object, path)) return readBase(path);
    const evaluated = evaluateCameraObjectPropsAt(object, readEffectiveTime());
    return readCameraPropAtPath(evaluated, path);
  }

  function liveBooleanValue(path: CameraBooleanTrackPath): boolean {
    if (!hasPropertyTrack(object, path)) return props.live;
    const evaluated = evaluateCameraObjectPropsAt(object, readEffectiveTime());
    return evaluated.live;
  }

  function writeBase(path: CameraTrackPath, value: number) {
    onChange((current) => writeNestedNumber(current, path, value));
  }

  function writeBooleanBase(path: CameraBooleanTrackPath, value: boolean) {
    onChange((current) => writeNestedValue(current, path, value));
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
    // the other axes at the playhead's interpolated values. Then re-run
    // camera automation so Auto-Orient/Lock does not flash back to raw
    // authored rotation while lens/DoF fields scrub.
    onPreview?.((current) => {
      const time = readEffectiveTime();
      const evaluated = evaluateCameraObjectPropsAt(current, time);
      const next = writeCameraPropAtPath(evaluated, path, value);
      const previewObject = {
        ...current,
        props: { ...(current.props ?? {}), ...next },
      };
      const previewObjects = compositionObjects.map((item) =>
        item.id === current.id ? previewObject : item,
      );
      const automated = applyCameraTargetAutomation(
        { frame: compositionFrame, objects: previewObjects },
        previewObject,
        time,
        next,
      );
      return {
        ...previewObject,
        props: { ...previewObject.props, ...automated },
      };
    });
  }

  function clampForPath(path: CameraTrackPath, value: number): number {
    if (path === "props.fov") return clampFov(value);
    if (path === "props.near" || path === "props.far")
      return clampPositive(value, 0.01);
    if (path === "props.sensor.width" || path === "props.sensor.height")
      return Math.max(1, Math.min(200, value));
    if (path === "props.dof.focusDistance") return clampPositive(value, 0);
    if (path === "props.dof.fNumber")
      return Math.max(
        CAMERA_DOF_MIN_F_NUMBER,
        Math.min(CAMERA_DOF_MAX_F_NUMBER, value),
      );
    if (path === "props.dof.maxBlurPx")
      return Math.max(0, Math.min(CAMERA_DOF_MAX_BLUR_PX, value));
    if (path === "props.lens.distortion.amount")
      return Math.max(-1, Math.min(1, value));
    if (path === "props.lens.chromaticAberration.amountPx")
      return Math.max(0, Math.min(96, value));
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

  function commitBoolean(path: CameraBooleanTrackPath, value: boolean) {
    if (hasPropertyTrack(object, path)) {
      const time = readEffectiveTime();
      onChange((current) => upsertPropertyKeyframe(current, path, time, value));
    } else {
      writeBooleanBase(path, value);
    }
  }

  function toggleBooleanKeyframe(path: CameraBooleanTrackPath) {
    const time = readEffectiveTime();
    const existing = getPropertyTrackKeyframeAtTime(object, path, time);
    if (existing) {
      onChange((current) =>
        removePropertyKeyframe(current, path, existing.time, time),
      );
    } else {
      const value = liveBooleanValue(path);
      onChange((current) => upsertPropertyKeyframe(current, path, time, value));
    }
  }

  function isKeyframedNow(path: CameraTrackPath | CameraBooleanTrackPath) {
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

  function setAutoOrient(value: CameraAutoOrient) {
    onChange((current) => {
      const currentProps = (current.props ?? {}) as Record<string, unknown>;
      return {
        ...current,
        props: { ...currentProps, autoOrient: value },
      };
    });
  }

  function setLockTargetId(targetId: string | null) {
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
          lockTarget: { ...evaluated.lockTarget, targetId },
        },
      };
    });
  }

  function setAutoFocusEnabled(enabled: boolean) {
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
          autoFocus: { ...evaluated.autoFocus, enabled },
        },
      };
    });
  }

  function setAutoFocusTargetId(targetId: string | null) {
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
          autoFocus: { ...evaluated.autoFocus, targetId },
        },
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

  function setDofDebug(debug: boolean) {
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
          dof: { ...evaluated.dof, debug },
        },
      };
    });
  }

  function setDofBlurMode(blurMode: CameraDofBlurMode) {
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
          dof: { ...evaluated.dof, blurMode },
        },
      };
    });
  }

  function setDofBokehPreset(preset: CameraBokehPreset) {
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
          dof: { ...evaluated.dof, bokeh: { preset } },
        },
      };
    });
  }

  function setLensDistortionEnabled(enabled: boolean) {
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
          lens: {
            ...evaluated.lens,
            distortion: { ...evaluated.lens.distortion, enabled },
          },
        },
      };
    });
  }

  function setLensChromaticAberrationEnabled(enabled: boolean) {
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
          lens: {
            ...evaluated.lens,
            chromaticAberration: {
              ...evaluated.lens.chromaticAberration,
              enabled,
            },
          },
        },
      };
    });
  }

  return (
    <div className="grid gap-3">
      <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#dfe2ea]">
        <span>Live</span>
        <span className="flex items-center gap-3">
          <button
            aria-label={
              isKeyframedNow("props.live")
                ? "Remove Camera Live keyframe at playhead"
                : "Add Camera Live keyframe at playhead"
            }
            aria-pressed={isKeyframedNow("props.live")}
            className={`h-2 w-2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
              isKeyframedNow("props.live")
                ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
                : "border-[#6f7684] bg-[#12151d] hover:border-white"
            }`}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              toggleBooleanKeyframe("props.live");
            }}
          />
          <Switch
            aria-label="Toggle camera live output"
            checked={liveBooleanValue("props.live")}
            onCheckedChange={(checked) => commitBoolean("props.live", checked)}
          />
        </span>
      </label>

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
            setAutoOrient(isCameraAutoOrient(value) ? value : "off")
          }
        >
          <SelectTrigger className="h-8 rounded-[8px] px-2 text-xs">
            <SelectValue aria-label={AUTO_ORIENT_LABELS[props.autoOrient]} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="along-path">Along Path</SelectItem>
              <SelectItem value="lock">Lock</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {props.autoOrient === "lock" ? (
          <div className="grid gap-2">
            <TargetSelect
              ariaLabel="Camera lock target"
              value={props.lockTarget.targetId}
              options={targetOptions}
              onChange={setLockTargetId}
            />
            <FieldRow label="Lock Offset">
              <KeyframableNumberInput
                ariaLabel="Camera lock screen offset X"
                unitPrefix="X"
                step={1}
                value={liveValue("props.lockTarget.offset.x")}
                active={isKeyframedNow("props.lockTarget.offset.x")}
                onPreview={(value) =>
                  previewBase("props.lockTarget.offset.x", value)
                }
                onCommit={(value) => commit("props.lockTarget.offset.x", value)}
                onToggleKeyframe={() =>
                  toggleKeyframe("props.lockTarget.offset.x")
                }
              />
              <KeyframableNumberInput
                ariaLabel="Camera lock screen offset Y"
                unitPrefix="Y"
                step={1}
                value={liveValue("props.lockTarget.offset.y")}
                active={isKeyframedNow("props.lockTarget.offset.y")}
                onPreview={(value) =>
                  previewBase("props.lockTarget.offset.y", value)
                }
                onCommit={(value) => commit("props.lockTarget.offset.y", value)}
                onToggleKeyframe={() =>
                  toggleKeyframe("props.lockTarget.offset.y")
                }
              />
              <KeyframableNumberInput
                ariaLabel="Camera lock depth offset Z"
                unitPrefix="Z"
                step={1}
                value={liveValue("props.lockTarget.offset.z")}
                active={isKeyframedNow("props.lockTarget.offset.z")}
                onPreview={(value) =>
                  previewBase("props.lockTarget.offset.z", value)
                }
                onCommit={(value) => commit("props.lockTarget.offset.z", value)}
                onToggleKeyframe={() =>
                  toggleKeyframe("props.lockTarget.offset.z")
                }
              />
            </FieldRow>
          </div>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <span className={mutedCaps}>Focal Length</span>
        <KeyframableNumberInput
          ariaLabel="Camera focal length"
          unitPrefix="mm"
          unitPrefixClassName="text-[10px] font-semibold"
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
              <span className={mutedCaps}>Blur Regions</span>
              <Select
                value={props.dof.blurMode}
                onValueChange={(value) =>
                  setDofBlurMode(isCameraDofBlurMode(value) ? value : "all")
                }
              >
                <SelectTrigger className="h-8 rounded-[8px] px-2 text-xs">
                  <SelectValue aria-label={props.dof.blurMode} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CAMERA_DOF_BLUR_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {DOF_BLUR_MODE_LABELS[mode]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#dfe2ea]">
              <span>Debugging</span>
              <Switch
                aria-label="Toggle depth of field debugging"
                checked={props.dof.debug}
                onCheckedChange={(checked) => setDofDebug(checked)}
              />
            </label>
            <div className="grid gap-1.5">
              <span className={mutedCaps}>Bokeh</span>
              <Select
                value={props.dof.bokeh.preset}
                onValueChange={(value) =>
                  setDofBokehPreset(
                    isCameraBokehPreset(value) ? value : "spherical",
                  )
                }
              >
                <SelectTrigger className="h-8 rounded-[8px] px-2 text-xs">
                  <SelectValue aria-label={props.dof.bokeh.preset} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CAMERA_BOKEH_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {BOKEH_PRESET_LABELS[preset]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
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
            <div className="grid gap-2">
              <span className={mutedCaps}>Auto Focus</span>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <TargetSelect
                  ariaLabel="Camera auto focus target"
                  value={props.autoFocus.targetId}
                  options={targetOptions}
                  disabled={!props.autoFocus.enabled}
                  onChange={setAutoFocusTargetId}
                />
                <Switch
                  aria-label="Toggle camera auto focus"
                  checked={props.autoFocus.enabled}
                  onCheckedChange={(checked) => setAutoFocusEnabled(checked)}
                />
              </div>
              {props.autoFocus.enabled ? (
                <KeyframableNumberInput
                  ariaLabel="Camera auto focus Z offset"
                  unitPrefix="Z"
                  step={1}
                  value={liveValue("props.autoFocus.zOffset")}
                  active={isKeyframedNow("props.autoFocus.zOffset")}
                  onPreview={(value) =>
                    previewBase("props.autoFocus.zOffset", value)
                  }
                  onCommit={(value) => commit("props.autoFocus.zOffset", value)}
                  onToggleKeyframe={() =>
                    toggleKeyframe("props.autoFocus.zOffset")
                  }
                />
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <span className={mutedCaps}>F-number</span>
              <KeyframableNumberInput
                ariaLabel="Camera f-number"
                unitPrefix="f/"
                step={0.1}
                min={CAMERA_DOF_MIN_F_NUMBER}
                max={CAMERA_DOF_MAX_F_NUMBER}
                value={liveValue("props.dof.fNumber")}
                active={isKeyframedNow("props.dof.fNumber")}
                onPreview={(value) => previewBase("props.dof.fNumber", value)}
                onCommit={(value) => commit("props.dof.fNumber", value)}
                onToggleKeyframe={() => toggleKeyframe("props.dof.fNumber")}
              />
            </div>
            <div className="grid gap-1.5">
              <span className={mutedCaps}>Max Blur (px)</span>
              <KeyframableNumberInput
                ariaLabel="Camera max blur radius"
                unitPrefix="px"
                step={1}
                min={0}
                max={CAMERA_DOF_MAX_BLUR_PX}
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

      <div className="grid gap-2">
        <span className={mutedCaps}>Lens Effects</span>
        <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#dfe2ea]">
          <span>Distortion</span>
          <Switch
            aria-label="Toggle camera lens distortion"
            checked={props.lens.distortion.enabled}
            onCheckedChange={(checked) => setLensDistortionEnabled(checked)}
          />
        </label>
        {props.lens.distortion.enabled ? (
          <div className="grid gap-1.5">
            <span className={mutedCaps}>Amount</span>
            <KeyframableNumberInput
              ariaLabel="Camera lens distortion amount"
              unitPrefix=""
              step={0.01}
              min={-1}
              max={1}
              value={liveValue("props.lens.distortion.amount")}
              active={isKeyframedNow("props.lens.distortion.amount")}
              onPreview={(value) =>
                previewBase("props.lens.distortion.amount", value)
              }
              onCommit={(value) =>
                commit("props.lens.distortion.amount", value)
              }
              onToggleKeyframe={() =>
                toggleKeyframe("props.lens.distortion.amount")
              }
            />
          </div>
        ) : null}
        <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#dfe2ea]">
          <span>Chromatic Aberration</span>
          <Switch
            aria-label="Toggle camera chromatic aberration"
            checked={props.lens.chromaticAberration.enabled}
            onCheckedChange={(checked) =>
              setLensChromaticAberrationEnabled(checked)
            }
          />
        </label>
        {props.lens.chromaticAberration.enabled ? (
          <div className="grid gap-1.5">
            <span className={mutedCaps}>Offset (px)</span>
            <KeyframableNumberInput
              ariaLabel="Camera chromatic aberration offset"
              unitPrefix="px"
              step={0.5}
              min={0}
              max={96}
              value={liveValue("props.lens.chromaticAberration.amountPx")}
              active={isKeyframedNow("props.lens.chromaticAberration.amountPx")}
              onPreview={(value) =>
                previewBase("props.lens.chromaticAberration.amountPx", value)
              }
              onCommit={(value) =>
                commit("props.lens.chromaticAberration.amountPx", value)
              }
              onToggleKeyframe={() =>
                toggleKeyframe("props.lens.chromaticAberration.amountPx")
              }
            />
          </div>
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

function TargetSelect({
  ariaLabel,
  value,
  options,
  disabled = false,
  onChange,
}: {
  ariaLabel: string;
  value: string | null;
  options: readonly CameraTargetOption[];
  disabled?: boolean;
  onChange: (targetId: string | null) => void;
}) {
  function commitDroppedTarget(event: React.DragEvent) {
    const targetId =
      event.dataTransfer.getData("application/x-clipper-object-id") ||
      event.dataTransfer.getData("text/plain");
    if (!targetId || !options.some((option) => option.object.id === targetId))
      return;
    event.preventDefault();
    onChange(targetId);
  }

  return (
    <span
      className="block min-w-0"
      onDragOver={(event) => {
        if (disabled) return;
        const types = Array.from(event.dataTransfer.types);
        if (!types.includes("application/x-clipper-object-id")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (!disabled) commitDroppedTarget(event);
      }}
    >
      <Select
        value={value ?? "none"}
        disabled={disabled}
        onValueChange={(next) => onChange(next === "none" ? null : next)}
      >
        <SelectTrigger
          className="h-8 min-w-0 rounded-[8px] px-2 text-xs"
          aria-label={ariaLabel}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="none">None</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.object.id} value={option.object.id}>
                {option.number}. {option.object.name || option.object.id}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </span>
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

function isCameraBokehPreset(value: string): value is CameraBokehPreset {
  return (CAMERA_BOKEH_PRESETS as readonly string[]).includes(value);
}

function isCameraDofBlurMode(value: string): value is CameraDofBlurMode {
  return (CAMERA_DOF_BLUR_MODES as readonly string[]).includes(value);
}

function isCameraAutoOrient(value: string): value is CameraAutoOrient {
  return value === "off" || value === "along-path" || value === "lock";
}

function writeNestedNumber(
  object: FrameObject,
  path: string,
  value: number,
): FrameObject {
  return writeNestedValue(object, path, value);
}

function writeNestedValue(
  object: FrameObject,
  path: string,
  value: number | boolean | string,
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
    case "props.dof.maxBlurPx":
      return props.dof.maxBlurPx;
    case "props.lens.distortion.amount":
      return props.lens.distortion.amount;
    case "props.lens.chromaticAberration.amountPx":
      return props.lens.chromaticAberration.amountPx;
    case "props.autoFocus.zOffset":
      return props.autoFocus.zOffset;
    case "props.lockTarget.offset.x":
      return props.lockTarget.offset.x;
    case "props.lockTarget.offset.y":
      return props.lockTarget.offset.y;
    case "props.lockTarget.offset.z":
      return props.lockTarget.offset.z;
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
    case "props.dof.maxBlurPx":
      return { ...props, dof: { ...props.dof, maxBlurPx: value } };
    case "props.lens.distortion.amount":
      return {
        ...props,
        lens: {
          ...props.lens,
          distortion: { ...props.lens.distortion, amount: value },
        },
      };
    case "props.lens.chromaticAberration.amountPx":
      return {
        ...props,
        lens: {
          ...props.lens,
          chromaticAberration: {
            ...props.lens.chromaticAberration,
            amountPx: value,
          },
        },
      };
    case "props.autoFocus.zOffset":
      return {
        ...props,
        autoFocus: { ...props.autoFocus, zOffset: value },
      };
    case "props.lockTarget.offset.x":
      return {
        ...props,
        lockTarget: {
          ...props.lockTarget,
          offset: { ...props.lockTarget.offset, x: value },
        },
      };
    case "props.lockTarget.offset.y":
      return {
        ...props,
        lockTarget: {
          ...props.lockTarget,
          offset: { ...props.lockTarget.offset, y: value },
        },
      };
    case "props.lockTarget.offset.z":
      return {
        ...props,
        lockTarget: {
          ...props.lockTarget,
          offset: { ...props.lockTarget.offset, z: value },
        },
      };
  }
}
