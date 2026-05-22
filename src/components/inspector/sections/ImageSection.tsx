import { useMemo, useState } from "react";
import { mutedCaps } from "../../../app/config";
import { resolveBinItemByPath } from "../../../core/binPathResolver";
import { filePathToClipperMediaUrl } from "../../../core/mediaSource";
import type { FrameObject, ProjectBinItem } from "../../../core/types";
import { useObjectInspector } from "../objectInspectorContext";
import { Input } from "../../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

const binPathDataType = "application/x-clipper-bin-path";
const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
const objectFitOptions = ["cover", "contain", "fill"] as const;

export function ImageSection() {
  const { object, projectBin, onChange, updateStyleValue, updateStyleNumber } =
    useObjectInspector();

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
    () => validateImageSourcePath(projectBin, sourcePath || null),
    [projectBin, sourcePath],
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
          placeholder="images/hero.png"
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

function validateImageSourcePath(
  bin: ProjectBinItem[],
  sourcePath: string | null,
): string | null {
  if (!sourcePath) return null;
  const item = resolveBinItemByPath(bin, sourcePath);
  if (!item) return `No bin item at "${sourcePath}".`;
  if (item.kind !== "internal-file" && item.kind !== "external-proxy")
    return `"${sourcePath}" is not an image file.`;
  if (!imageExtensions.some((ext) => item.name.toLowerCase().endsWith(ext)))
    return `"${item.name}" is not a supported image file.`;
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
