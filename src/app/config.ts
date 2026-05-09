export {
  defaultZoomDuration,
  marqueeSelectionThresholdPx,
  minimumObjectResizeSide,
  minimumZoomDuration,
} from "../core/editorConstants";

export const videoExportFrameRate = 30;
export const defaultVideoExportTileHeight = 270;
export const minVideoExportTileHeight = 1;
export const maxVideoExportTileHeight = 1080;
export const defaultExportWorkerMapping = { hd: 2, qhd: 2, uhd: 1 } as const;
export const minExportWorkerCount = 1;
export const maxExportWorkerCount = 8;
export const defaultExportTileMapping = { hd: 4, qhd: 6, uhd: 16 } as const;
export const minExportTileCount = 1;
export const maxExportTileCount = 64;
export const defaultStableSlowGridPreset = "safe" as const;
export const defaultStableSlowValidationSamples = 1;
export const minStableSlowValidationSamples = 1;
export const maxStableSlowValidationSamples = 3;
export const defaultPrerenderBlockDurationMs = 200;
export const minPrerenderBlockDurationMs = 20;
export const maxPrerenderBlockDurationMs = 1000;
export const defaultFramePreviewScale = 0.5;
export const defaultPreviewRenderHeight = 1080;
export const previewRenderHeightOptions = [540, 720, 1080, 1440, 2160] as const;
export const minPreviewRenderHeight = previewRenderHeightOptions[0];
export const maxPreviewRenderHeight =
  previewRenderHeightOptions[previewRenderHeightOptions.length - 1];
export const selectorOffsetPx = 0;
export const selectorHandleSizePx = 8;
export const selectorBlue = "#159dff";
export const defaultTimelinePixelsPerSecond = 126;
export const defaultTimelineEndPaddingFraction = 0.5;
export const defaultScrubCommitThrottleMs = 75;
export const defaultPausePlaybackOnScrub = true;
export const defaultNewMarkerDurationSeconds = 3;
export const defaultTimelinePrecision = 3;
export const defaultLiveDomPostProcessMaxFps = 5;
export const minLiveDomPostProcessMaxFps = 1;
export const maxLiveDomPostProcessMaxFps = 30;
export const maxProjectHistoryActions = 1000;
export const projectHistoryCoalesceMs = 700;

export const appDragRegion = "[-webkit-app-region:drag] select-none";
export const appNoDragRegion = "[-webkit-app-region:no-drag]";
export const buttonBase =
  "rounded-[8px] border border-transparent bg-[#171920] px-2.5 py-1.5 text-sm text-[#f7f7f8] transition hover:-translate-y-px hover:border-[#3b4150] hover:bg-[#20232c]";
export const appBarButtonBase =
  "rounded-[7px] border border-transparent bg-[#171920] px-2 py-1 text-xs text-[#f7f7f8] transition hover:-translate-y-px hover:border-[#3b4150] hover:bg-[#20232c]";
export const appBarActionButtonBase = `${appBarButtonBase} w-[70px]`;
export const sectionTitle = "m-0 text-[13px] font-semibold text-[#d9dbe1]";
export const mutedCaps = "text-[12px] font-medium text-[#9b9da7]";
export const panelCard =
  "grid gap-[5px] rounded-xl border border-[#2d313b] bg-[#171920] p-3 text-[13px] text-[#dfe2ea]";
export const segmentedTabBase =
  "rounded-[8px] px-2 py-1.5 text-sm font-bold transition";
export const segmentedTabActive = "bg-[#272b36] text-white";
export const segmentedTabInactive =
  "bg-[#191c24] text-[#9b9da7] hover:text-white";

export const monacoOptions = {
  automaticLayout: true,
  bracketPairColorization: { enabled: false },
  cursorBlinking: "blink",
  cursorSmoothCaretAnimation: "off",
  foldingHighlight: false,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  glyphMargin: false,
  hideCursorInOverviewRuler: true,
  lineDecorationsWidth: 10,
  lineNumbersMinChars: 3,
  minimap: { enabled: false },
  overviewRulerBorder: false,
  padding: { top: 14, bottom: 14 },
  renderLineHighlight: "line",
  scrollBeyondLastLine: false,
  tabSize: 2,
  wordWrap: "off",
} as const;

export function getMonacoOptionsForDocument(_document: {
  language: string;
  source?: string;
}) {
  return {
    ...monacoOptions,
  } as const;
}
