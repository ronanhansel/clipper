import { graphicBoundsKeys } from "../../../core/graphics/inspectorSettings";
import {
  evaluateObjectState,
  removePropertyKeyframe,
  upsertPropertyKeyframe,
} from "../../../core/propertyRegistry";
import { mutedCaps } from "../../../app/config";
import type { FrameObject } from "../../../core/types";
import { useObjectInspector } from "../objectInspectorContext";
import {
  getPropertyTrackKeyframeAtTime,
  hasPropertyTrack,
} from "../inspectorShared";
import type { BoundsAnimationKey } from "../inspectorShared";
import { KeyframableNumberInput } from "../KeyframableNumberInput";
import { KeyframedRow } from "../scrubLive";

/**
 * Bounds grid (x / y / width / height) with linked-pair keyframe toggles.
 * Hidden when `lockBounds` is true (e.g. composition background).
 *
 * When `object.threeD` is true, switches to a 3D layout that mirrors the
 * camera section: Position (X/Y/Z), Rotation (X/Y/Z), Size (W/H). Z + the
 * three rotations live on `transform.translateZ` / `transform.rotate{X,Y,Z}`
 * which the renderRuntime serialises into the CSS transform string. The
 * wrapper chain (perspective stage → DomBackend host → FrameObjectView)
 * propagates `preserve-3d`, so Z translation pops out as expected.
 */
export function BoundsSection() {
  const ctx = useObjectInspector();
  if (ctx.lockBounds) return null;
  if (ctx.object.threeD) return <ThreeDBoundsSection />;
  return <TwoDBoundsSection />;
}

type TransformPath =
  | "transform.translateZ"
  | "transform.rotateX"
  | "transform.rotateY"
  | "transform.rotateZ";

type BoundsPath = "bounds.x" | "bounds.y" | "bounds.width" | "bounds.height";

function ThreeDBoundsSection() {
  const {
    object,
    hasAttributeKeyframes,
    previewBounds,
    updateBounds,
    onChange,
    onPreview,
    readEffectiveTime,
  } = useObjectInspector();

  // --- Bounds (x / y / width / height) helpers --- evaluate at the
  // playhead so a keyframed axis shows its interpolated value, matching
  // the camera section's `liveValue` pattern.
  function liveBoundsValue(key: BoundsAnimationKey): number {
    const path = `bounds.${key}` as BoundsPath;
    if (!hasPropertyTrack(object, path)) return object.bounds[key];
    const evaluated = evaluateObjectState(object, readEffectiveTime());
    const v = (evaluated.bounds as Record<string, unknown>)[key];
    return typeof v === "number" && Number.isFinite(v) ? v : object.bounds[key];
  }

  function isBoundsKeyframedNow(key: BoundsAnimationKey) {
    const time = readEffectiveTime();
    const path = `bounds.${key}` as BoundsPath;
    return Boolean(getPropertyTrackKeyframeAtTime(object, path, time));
  }

  function toggleBoundsKeyframe(key: BoundsAnimationKey) {
    const path = `bounds.${key}` as BoundsPath;
    const time = readEffectiveTime();
    const existing = getPropertyTrackKeyframeAtTime(object, path, time);
    if (existing) {
      onChange((current) =>
        removePropertyKeyframe(current, path, existing.time, time),
      );
      return;
    }
    const value = liveBoundsValue(key);
    onChange((current) => upsertPropertyKeyframe(current, path, time, value));
  }

  // --- Transform (translateZ / rotateX / rotateY / rotateZ) helpers ---
  function readTransformBase(path: TransformPath): number {
    const transform =
      object.transform && typeof object.transform === "object"
        ? (object.transform as Record<string, unknown>)
        : {};
    const key = path.slice("transform.".length);
    const v = transform[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }

  function liveTransformValue(path: TransformPath): number {
    if (!hasPropertyTrack(object, path)) return readTransformBase(path);
    const evaluated = evaluateObjectState(object, readEffectiveTime());
    const transform =
      evaluated.transform && typeof evaluated.transform === "object"
        ? (evaluated.transform as Record<string, unknown>)
        : {};
    const key = path.slice("transform.".length);
    const v = transform[key];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }

  function previewTransformAt(path: TransformPath, value: number) {
    onPreview?.((current) => {
      const transform =
        current.transform && typeof current.transform === "object"
          ? (current.transform as Record<string, unknown>)
          : {};
      const key = path.slice("transform.".length);
      return {
        ...current,
        transform: { ...transform, [key]: value } as FrameObject["transform"],
      };
    });
  }

  function commitTransform(path: TransformPath, value: number) {
    if (!Number.isFinite(value)) return;
    if (hasPropertyTrack(object, path)) {
      const time = readEffectiveTime();
      onChange((current) => upsertPropertyKeyframe(current, path, time, value));
      return;
    }
    onChange((current) => {
      const transform =
        current.transform && typeof current.transform === "object"
          ? (current.transform as Record<string, unknown>)
          : {};
      const key = path.slice("transform.".length);
      return {
        ...current,
        transform: { ...transform, [key]: value } as FrameObject["transform"],
      };
    });
  }

  function toggleTransformKeyframe(path: TransformPath) {
    const time = readEffectiveTime();
    const existing = getPropertyTrackKeyframeAtTime(object, path, time);
    if (existing) {
      onChange((current) =>
        removePropertyKeyframe(current, path, existing.time, time),
      );
      return;
    }
    const value = liveTransformValue(path);
    onChange((current) => upsertPropertyKeyframe(current, path, time, value));
  }

  function isTransformKeyframedNow(path: TransformPath) {
    const time = readEffectiveTime();
    return Boolean(getPropertyTrackKeyframeAtTime(object, path, time));
  }

  const positionFields = [
    {
      axis: "X",
      ariaLabel: "Position X",
      kind: "bounds" as const,
      key: "x" as BoundsAnimationKey,
    },
    {
      axis: "Y",
      ariaLabel: "Position Y",
      kind: "bounds" as const,
      key: "y" as BoundsAnimationKey,
    },
    {
      axis: "Z",
      ariaLabel: "Position Z",
      kind: "transform" as const,
      path: "transform.translateZ" as const,
    },
  ];

  const rotationFields: ReadonlyArray<{
    axis: "X" | "Y" | "Z";
    ariaLabel: string;
    path: TransformPath;
  }> = [
    { axis: "X", ariaLabel: "Rotation X", path: "transform.rotateX" },
    { axis: "Y", ariaLabel: "Rotation Y", path: "transform.rotateY" },
    { axis: "Z", ariaLabel: "Rotation Z", path: "transform.rotateZ" },
  ];

  const sizeFields: ReadonlyArray<{
    axis: "W" | "H";
    ariaLabel: string;
    key: BoundsAnimationKey;
  }> = [
    { axis: "W", ariaLabel: "Width", key: "width" },
    { axis: "H", ariaLabel: "Height", key: "height" },
  ];

  return (
    <div className="grid gap-3">
      <FieldRow label="Position">
        {positionFields.map((field) =>
          field.kind === "bounds" ? (
            <KeyframableNumberInput
              key={field.key}
              ariaLabel={field.ariaLabel}
              unitPrefix={field.axis}
              step={1}
              value={liveBoundsValue(field.key)}
              active={
                isBoundsKeyframedNow(field.key) ||
                hasAttributeKeyframes(field.key)
              }
              onPreview={(v) => previewBounds(field.key, v)}
              onCommit={(v) => updateBounds(field.key, String(v))}
              onToggleKeyframe={() => toggleBoundsKeyframe(field.key)}
            />
          ) : (
            <KeyframableNumberInput
              key={field.path}
              ariaLabel={field.ariaLabel}
              unitPrefix={field.axis}
              step={1}
              value={liveTransformValue(field.path)}
              active={isTransformKeyframedNow(field.path)}
              onPreview={(v) => previewTransformAt(field.path, v)}
              onCommit={(v) => commitTransform(field.path, v)}
              onToggleKeyframe={() => toggleTransformKeyframe(field.path)}
            />
          ),
        )}
      </FieldRow>

      <FieldRow label="Rotation (°)">
        {rotationFields.map((field) => (
          <KeyframableNumberInput
            key={field.path}
            ariaLabel={field.ariaLabel}
            unitPrefix={field.axis}
            step={1}
            value={liveTransformValue(field.path)}
            active={isTransformKeyframedNow(field.path)}
            onPreview={(v) => previewTransformAt(field.path, v)}
            onCommit={(v) => commitTransform(field.path, v)}
            onToggleKeyframe={() => toggleTransformKeyframe(field.path)}
          />
        ))}
      </FieldRow>

      <div className="grid gap-1.5">
        <span className={mutedCaps}>Size</span>
        <div className="grid grid-cols-2 gap-2">
          {sizeFields.map((field) => (
            <KeyframableNumberInput
              key={field.key}
              ariaLabel={field.ariaLabel}
              unitPrefix={field.axis}
              step={1}
              value={liveBoundsValue(field.key)}
              active={
                isBoundsKeyframedNow(field.key) ||
                hasAttributeKeyframes(field.key)
              }
              onPreview={(v) => previewBounds(field.key, v)}
              onCommit={(v) => updateBounds(field.key, String(v))}
              onToggleKeyframe={() => toggleBoundsKeyframe(field.key)}
            />
          ))}
        </div>
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

function TwoDBoundsSection() {
  const {
    object,
    liveScrubClock,
    currentTime,
    hasAttributeKeyframes,
    previewBounds,
    updateBounds,
    renderKeyframedInput,
  } = useObjectInspector();

  return (
    <div className="grid grid-cols-2 gap-2">
      {graphicBoundsKeys.map((key) => {
        const linkedKeys:
          | readonly [BoundsAnimationKey, BoundsAnimationKey]
          | undefined =
          key === "x" || key === "y"
            ? ["x", "y"]
            : key === "width" || key === "height"
              ? ["width", "height"]
              : undefined;
        // Subscribe per-row so rows without a track stay stable on tick.
        const hasTrack = linkedKeys
          ? linkedKeys.some((k) => hasAttributeKeyframes(k))
          : hasAttributeKeyframes(key);
        return (
          <KeyframedRow
            key={key}
            liveScrubClock={liveScrubClock}
            currentTime={currentTime}
            hasTrack={hasTrack}
            render={() =>
              renderKeyframedInput({
                label: key,
                animationKey: key,
                linkedKeys,
                value: object.bounds[key],
                onPreviewNumber: (value) => previewBounds(key, value),
                onCommit: (value) => updateBounds(key, value),
              })
            }
          />
        );
      })}
    </div>
  );
}
