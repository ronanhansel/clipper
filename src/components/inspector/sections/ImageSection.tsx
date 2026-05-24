import { useMemo, useState } from "react";
import { mutedCaps } from "../../../app/config";
import { resolveBinItemByPath } from "../../../core/binPathResolver";
import { filePathToClipperMediaUrl } from "../../../core/mediaSource";
import {
  getMediaAssetType,
  isSupportedImageMedia,
  isSupportedVideoMedia,
} from "../../../core/mediaTypes";
import {
  evaluateObjectState,
  removePropertyKeyframe,
  upsertPropertyKeyframe,
} from "../../../core/propertyRegistry";
import type {
  FrameObject,
  JsonValue,
  ProjectBinItem,
} from "../../../core/types";
import { KeyframableNumberInput } from "../KeyframableNumberInput";
import { getPropertyTrackKeyframeAtTime } from "../inspectorShared";
import { useObjectInspector } from "../objectInspectorContext";
import { Input } from "../../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Switch } from "../../ui/switch";

const binPathDataType = "application/x-clipper-bin-path";
const objectFitOptions = ["cover", "contain", "fill"] as const;
const videoPlaybackPaths = {
  cropStart: "props.video.cropStart",
  cropEnd: "props.video.cropEnd",
  speed: "props.video.speed",
  playing: "props.video.playing",
} as const;

export function ImageSection() {
  const { object, projectBin, onChange, updateStyleValue, updateStyleNumber } =
    useObjectInspector();
  const mediaAssetType = getObjectMediaAssetType(object, projectBin);

  return (
    <div className="grid gap-3">
      <SourceSubsection
        object={object}
        projectBin={projectBin}
        onChange={onChange}
      />
      <div className="grid gap-2">
        <span className={mutedCaps}>Fit</span>
        <Select
          value={readObjectFit(object)}
          onValueChange={(next) => updateStyleValue("objectFit", next)}
        >
          <SelectTrigger className="h-8 rounded-[8px] px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {objectFitOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Opacity"
          value={object.style.opacity}
          placeholder="1"
          onCommit={(value) => updateStyleNumber("opacity", value)}
        />
        <NumberField
          label="Radius"
          value={object.style.borderRadius}
          placeholder="0"
          onCommit={(value) => updateStyleNumber("borderRadius", value)}
        />
      </div>
      {object.type === "media" && mediaAssetType === "video" ? (
        <VideoPlaybackSubsection />
      ) : null}
    </div>
  );
}

function SourceSubsection({
  object,
  projectBin,
  onChange,
}: {
  object: FrameObject;
  projectBin: ProjectBinItem[];
  onChange: (updater: (object: FrameObject) => FrameObject) => void;
}) {
  const sourcePath = object.source?.kind === "file" ? object.source.path : "";
  const [draft, setDraft] = useState(sourcePath);
  const [savedReference, setSavedReference] = useState(sourcePath);
  const [isDragOver, setIsDragOver] = useState(false);

  if (savedReference !== sourcePath) {
    setSavedReference(sourcePath);
    setDraft(sourcePath);
  }

  const validation = useMemo(
    () => validateMediaSourcePath(projectBin, object.type, sourcePath || null),
    [object.type, projectBin, sourcePath],
  );

  function commitDraft(value: string) {
    const trimmed = value.trim();
    const src = trimmed ? resolveImageSourceUrl(projectBin, trimmed) : null;
    onChange((current) => ({
      ...current,
      source: trimmed ? { kind: "file", path: trimmed } : undefined,
      style: trimmed
        ? { ...current.style, src: src ?? trimmed }
        : stripStyleSrc(current.style),
    }));
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(binPathDataType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    const dropped = event.dataTransfer.getData(binPathDataType);
    if (!dropped) return;
    event.preventDefault();
    setIsDragOver(false);
    setDraft(dropped);
    commitDraft(dropped);
  }

  return (
    <div className="grid gap-2">
      <span className={mutedCaps}>Source</span>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-[10px] ${
          isDragOver
            ? "outline outline-2 outline-[var(--clipper-accent-strong)]"
            : ""
        }`}
      >
        <Input
          className="h-[38px] rounded-[10px] px-3 text-xs font-bold text-[#dfe2ea]"
          placeholder={
            object.type === "media" ? "media/clip.mp4" : "images/hero.png"
          }
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commitDraft(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft(draft);
              (event.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
      {validation ? (
        <span className="text-[11px] font-semibold text-[#ff8585]">
          {validation}
        </span>
      ) : null}
    </div>
  );
}

function VideoPlaybackSubsection() {
  const { object, onChange, readEffectiveTime } = useObjectInspector();
  const time = readEffectiveTime();
  const evaluated = evaluateObjectState(object, time);
  const videoProps = readVideoProps(evaluated);

  function commitNumber(path: VideoPlaybackPath, value: number) {
    if (!Number.isFinite(value)) return;
    onChange((current) =>
      hasTrack(current, path)
        ? upsertPropertyKeyframe(current, path, readEffectiveTime(), value)
        : setVideoProp(current, path, value),
    );
  }

  function commitBoolean(path: VideoPlaybackPath, value: boolean) {
    onChange((current) =>
      hasTrack(current, path)
        ? upsertPropertyKeyframe(current, path, readEffectiveTime(), value)
        : setVideoProp(current, path, value),
    );
  }

  function toggleTrack(path: VideoPlaybackPath, value: number | boolean) {
    const keyframeTime = readEffectiveTime();
    const existing = getPropertyTrackKeyframeAtTime(object, path, keyframeTime);
    if (existing) {
      onChange((current) =>
        removePropertyKeyframe(current, path, existing.time, keyframeTime),
      );
      return;
    }
    onChange((current) =>
      upsertPropertyKeyframe(current, path, keyframeTime, value),
    );
  }

  return (
    <div className="grid gap-2">
      <span className={mutedCaps}>Playback</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-[#9da3b2]">
            Start
          </span>
          <KeyframableNumberInput
            ariaLabel="Crop start"
            unitPrefix=""
            step={0.01}
            min={0}
            value={videoProps.cropStart}
            active={isKeyframedNow(object, videoPlaybackPaths.cropStart, time)}
            onPreview={() => undefined}
            onCommit={(value) =>
              commitNumber(videoPlaybackPaths.cropStart, Math.max(0, value))
            }
            onToggleKeyframe={() =>
              toggleTrack(videoPlaybackPaths.cropStart, videoProps.cropStart)
            }
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] font-semibold text-[#9da3b2]">End</span>
          <KeyframableNumberInput
            ariaLabel="Crop end"
            unitPrefix=""
            step={0.01}
            min={0}
            value={videoProps.cropEnd}
            active={isKeyframedNow(object, videoPlaybackPaths.cropEnd, time)}
            onPreview={() => undefined}
            onCommit={(value) =>
              commitNumber(videoPlaybackPaths.cropEnd, Math.max(0, value))
            }
            onToggleKeyframe={() =>
              toggleTrack(videoPlaybackPaths.cropEnd, videoProps.cropEnd)
            }
          />
        </label>
      </div>
      <label className="grid gap-1">
        <span className="text-[11px] font-semibold text-[#9da3b2]">Speed</span>
        <KeyframableNumberInput
          ariaLabel="Playback speed"
          unitPrefix=""
          step={0.05}
          min={0.01}
          value={videoProps.speed}
          active={isKeyframedNow(object, videoPlaybackPaths.speed, time)}
          onPreview={() => undefined}
          onCommit={(value) =>
            commitNumber(videoPlaybackPaths.speed, Math.max(0.01, value))
          }
          onToggleKeyframe={() =>
            toggleTrack(videoPlaybackPaths.speed, videoProps.speed)
          }
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[11px] font-semibold text-[#9da3b2]">Play</span>
        <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[#2d313b] bg-[#171920] px-3 py-2">
          <span className="text-xs font-semibold text-[#dfe2ea]">
            {videoProps.playing ? "On" : "Off"}
          </span>
          <div className="flex items-center gap-3">
            <Switch
              checked={videoProps.playing}
              onCheckedChange={(checked) =>
                commitBoolean(videoPlaybackPaths.playing, checked)
              }
            />
            <button
              aria-label={
                isKeyframedNow(object, videoPlaybackPaths.playing, time)
                  ? "Remove Play keyframe at playhead"
                  : "Add Play keyframe at playhead"
              }
              aria-pressed={isKeyframedNow(
                object,
                videoPlaybackPaths.playing,
                time,
              )}
              className={`h-2 w-2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
                isKeyframedNow(object, videoPlaybackPaths.playing, time)
                  ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
                  : "border-[#6f7684] bg-[#12151d] hover:border-white"
              }`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                toggleTrack(videoPlaybackPaths.playing, videoProps.playing);
              }}
            />
          </div>
        </div>
      </label>
    </div>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string | number | undefined;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const display = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(display);
  const [savedReference, setSavedReference] = useState(display);

  if (savedReference !== display) {
    setSavedReference(display);
    setDraft(display);
  }

  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold text-[#9da3b2]">{label}</span>
      <Input
        className="h-8 rounded-[8px] px-2 text-xs"
        type="number"
        spellCheck={false}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(draft);
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

function readObjectFit(object: FrameObject): string {
  const fit = object.style.objectFit;
  if (typeof fit === "string" && objectFitOptions.includes(fit as never))
    return fit;
  return "cover";
}

function validateMediaSourcePath(
  bin: ProjectBinItem[],
  objectType: FrameObject["type"],
  sourcePath: string | null,
): string | null {
  if (!sourcePath) return null;
  const item = resolveBinItemByPath(bin, sourcePath);
  if (!item) return `No bin item at "${sourcePath}".`;
  if (item.kind !== "internal-file" && item.kind !== "external-proxy")
    return `"${sourcePath}" is not a media file.`;
  if (objectType === "image" && !isSupportedImageMedia(item.name))
    return `"${item.name}" is not a supported image file.`;
  if (
    objectType === "media" &&
    !isSupportedImageMedia(item.name) &&
    !isSupportedVideoMedia(item.name)
  )
    return `"${item.name}" is not a supported media file.`;
  return null;
}

function stripStyleSrc(style: FrameObject["style"]): FrameObject["style"] {
  const next = { ...style };
  delete next.src;
  return next;
}

function resolveImageSourceUrl(
  bin: ProjectBinItem[],
  sourcePath: string,
): string | null {
  const item = resolveBinItemByPath(bin, sourcePath);
  if (!item) return null;
  if (item.kind === "external-proxy")
    return filePathToClipperMediaUrl(item.path);
  if (item.kind !== "internal-file") return null;
  if (item.name.toLowerCase().endsWith(".svg"))
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.source)}`;
  return null;
}

type VideoPlaybackPath =
  (typeof videoPlaybackPaths)[keyof typeof videoPlaybackPaths];

type VideoProps = {
  cropStart: number;
  cropEnd: number;
  speed: number;
  playing: boolean;
};

function getObjectMediaAssetType(object: FrameObject, bin: ProjectBinItem[]) {
  const sourcePath = object.source?.kind === "file" ? object.source.path : "";
  if (sourcePath) {
    const item = resolveBinItemByPath(bin, sourcePath);
    if (item) return getMediaAssetType(item.name);
  }
  return typeof object.style.src === "string"
    ? getMediaAssetType(object.style.src)
    : null;
}

function readVideoProps(object: FrameObject): VideoProps {
  const raw = object.props?.video;
  const video =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    cropStart: readNumberProp(video, "cropStart", 0),
    cropEnd: readNumberProp(video, "cropEnd", 0),
    speed: Math.max(0.01, readNumberProp(video, "speed", 1)),
    playing: readBooleanProp(video, "playing", true),
  };
}

function readNumberProp(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBooleanProp(
  source: Record<string, unknown>,
  key: string,
  fallback: boolean,
) {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

function setVideoProp(
  object: FrameObject,
  path: VideoPlaybackPath,
  value: number | boolean,
): FrameObject {
  const key = path.slice("props.video.".length);
  return {
    ...object,
    props: {
      ...(object.props ?? {}),
      video: {
        ...readVideoObject(object),
        [key]: value,
      },
    },
  };
}

function readVideoObject(object: FrameObject): Record<string, JsonValue> {
  const raw = object.props?.video;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, JsonValue>) }
    : {};
}

function hasTrack(object: FrameObject, path: VideoPlaybackPath): boolean {
  return Boolean(object.tracks?.[path]?.points.length);
}

function isKeyframedNow(
  object: FrameObject,
  path: VideoPlaybackPath,
  time: number,
) {
  return Boolean(getPropertyTrackKeyframeAtTime(object, path, time));
}
