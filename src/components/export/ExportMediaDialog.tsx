import { useRef, useState } from "react";
import { appBarButtonBase, mutedCaps } from "../../app/config";
import type {
  ExportRenderQuality,
  MediaExportFormat,
  MediaExportRenderMode,
  VideoExportProgress,
} from "../../app/types";
import { clamp } from "../../core/math";
import { formatTime } from "../../core/timeline";
import type { ProjectManifest } from "../../core/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

const RESOLUTION_OPTIONS: { label: string; width: number; height: number }[] = [
  { label: "1920 × 1080 (HD)", width: 1920, height: 1080 },
  { label: "2560 × 1440 (QHD)", width: 2560, height: 1440 },
  { label: "3840 × 2160 (4K)", width: 3840, height: 2160 },
];

const RENDER_QUALITY_OPTIONS: {
  label: string;
  value: ExportRenderQuality;
  scale: number;
}[] = [
  { label: "Ultra", value: "ultra", scale: 2 },
  { label: "High", value: "high", scale: 1.5 },
  { label: "Standard", value: "standard", scale: 1 },
];

const BASELINE_HD30_PIXELS_PER_SECOND = 1920 * 1080 * 30;

type DropdownOption<T> = {
  label: string;
  value: T;
  description?: string;
  tooltip?: string;
};

export type ExportMediaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Pick<ProjectManifest, "resolution">;
  sceneName: string;
  frameRate: number;
  renderQuality: ExportRenderQuality;
  onRenderQualityChange: (quality: ExportRenderQuality) => void;
  resolution: { width: number; height: number };
  onResolutionChange: (resolution: { width: number; height: number }) => void;
  mediaFormat: MediaExportFormat;
  onMediaFormatChange: (format: MediaExportFormat) => void;
  mediaRenderMode: MediaExportRenderMode;
  onMediaRenderModeChange: (mode: MediaExportRenderMode) => void;
  onExport: () => void;
};

export function ExportMediaDialog({
  open,
  onOpenChange,
  project,
  sceneName,
  frameRate,
  renderQuality,
  onRenderQualityChange,
  resolution,
  onResolutionChange,
  mediaFormat,
  onMediaFormatChange,
  mediaRenderMode,
  onMediaRenderModeChange,
  onExport,
}: ExportMediaDialogProps) {
  const resolutionOptions = buildResolutionOptions(
    resolution,
    project.resolution,
  );
  const qualityOptions = buildRenderQualityOptions(resolution);
  const formatOptions = buildMediaFormatOptions(resolution, frameRate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Media</DialogTitle>
          <DialogDescription>
            Render {sceneName} as a video file.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm font-medium">Resolution</label>
            <div className="col-span-3">
              <Select
                value={formatResolutionKey(resolution)}
                onValueChange={(val) => {
                  const [w, h] = val.split("x").map(Number);
                  onResolutionChange({ width: w, height: h });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resolutionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm font-medium">Quality</label>
            <div className="col-span-3">
              <Select
                value={renderQuality}
                onValueChange={(val) =>
                  onRenderQualityChange(val as ExportRenderQuality)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {qualityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        {opt.description && (
                          <span className="text-xs text-muted-foreground">
                            {opt.description}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm font-medium">Format</label>
            <div className="col-span-3">
              <Select
                value={mediaFormat}
                onValueChange={(val) =>
                  onMediaFormatChange(val as MediaExportFormat)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        {opt.description && (
                          <span className="text-xs text-muted-foreground">
                            {opt.description}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm font-medium">Engine</label>
            <div className="col-span-3">
              <Select
                value={mediaRenderMode}
                onValueChange={(val) =>
                  onMediaRenderModeChange(val as MediaExportRenderMode)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="renderer">
                    High Performance (GPU)
                  </SelectItem>
                  <SelectItem value="stable-slow">
                    Compatibility (CPU)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            className={
              appBarButtonBase +
              " bg-blue-600 px-6 py-2 text-white hover:bg-blue-500"
            }
            onClick={() => {
              onExport();
              onOpenChange(false);
            }}
          >
            Start Export
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type VideoExportOverlayProps = {
  progress: VideoExportProgress | null;
  isCancelling?: boolean;
  onCancel: () => void;
};

export function VideoExportOverlay({
  progress,
  isCancelling,
  onCancel,
}: VideoExportOverlayProps) {
  if (!progress) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col items-center gap-6 p-8 text-center">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">
            {isCancelling ? "Cancelling Export..." : "Exporting Media..."}
          </h2>
          <p className="text-sm text-white/60">
            {progress.status ||
              `Frame ${progress.frame} of ${progress.totalFrames}`}
          </p>
        </div>

        {!isCancelling && (
          <button
            className={
              appBarButtonBase +
              " border border-white/20 bg-white/5 px-6 py-2 text-white/80 hover:bg-white/10"
            }
            onClick={onCancel}
          >
            Cancel Export
          </button>
        )}
      </div>
    </div>
  );
}

function buildResolutionOptions(
  current: { width: number; height: number },
  project: { width: number; height: number },
): { label: string; value: string }[] {
  const seen = new Set<string>();
  const result: { label: string; value: string }[] = [];

  const add = (label: string, r: { width: number; height: number }) => {
    const key = formatResolutionKey(r);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ label, value: key });
  };

  add(`${project.width} × ${project.height} (Project)`, project);

  for (const opt of RESOLUTION_OPTIONS) {
    add(opt.label, opt);
  }

  return result;
}

function formatResolutionKey(r: { width: number; height: number }) {
  return `${r.width}x${r.height}`;
}

function buildRenderQualityOptions(resolution: {
  width: number;
  height: number;
}): DropdownOption<ExportRenderQuality>[] {
  return RENDER_QUALITY_OPTIONS.map((option) => ({
    label: option.label,
    value: option.value,
    description: `${option.scale}× supersample, internal ${Math.round(resolution.width * option.scale)} × ${Math.round(resolution.height * option.scale)}`,
  }));
}

function buildMediaFormatOptions(
  resolution: { width: number; height: number },
  frameRate: number,
): DropdownOption<MediaExportFormat>[] {
  const scale =
    (resolution.width * resolution.height * frameRate) /
    BASELINE_HD30_PIXELS_PER_SECOND;
  return [
    {
      label: "MP4 H.264 Fast",
      value: "mp4",
      description: formatEstimatedDataRate(1.5 * scale),
    },
    {
      label: "MP4 H.264 HQ",
      value: "h264-high",
      description: formatEstimatedDataRate(2.25 * scale),
    },
    {
      label: "WebM (VP9)",
      value: "webm",
      description: formatEstimatedDataRate(1.2 * scale),
    },
    {
      label: "MOV ProRes 422 HQ",
      value: "prores-422-hq",
      description: formatEstimatedDataRate(27.5 * scale),
    },
    {
      label: "MOV ProRes 4444",
      value: "prores-4444",
      description: formatEstimatedDataRate(41.25 * scale),
    },
    {
      label: "MOV DNxHR HQX",
      value: "dnxhr-hqx",
      description: formatEstimatedDataRate(27.5 * scale),
    },
  ];
}

function formatEstimatedDataRate(mbPerSecond: number) {
  const mbPerMinute = mbPerSecond * 60;
  return `~${formatDataAmount(mbPerSecond)}/s, ${formatDataAmount(mbPerMinute)}/min`;
}

function formatDataAmount(mb: number) {
  if (mb >= 1000) return `${formatCompactNumber(mb / 1000)} GB`;
  return `${formatCompactNumber(mb)} MB`;
}

function formatCompactNumber(value: number) {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
