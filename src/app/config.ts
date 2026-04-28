export const videoExportFrameRate = 30;
export const defaultFramePreviewScale = 0.5;
export const defaultZoomDuration = 2.2;
export const minimumZoomDuration = 1;
export const marqueeSelectionThresholdPx = 10;
export const selectorOffsetPx = 4;
export const selectorHandleSizePx = 8;
export const selectorBlue = "#159dff";
export const minimumObjectResizeSide = 6;
export const defaultTimelinePixelsPerSecond = 126;
export const defaultScrubCommitThrottleMs = 75;
export const maxProjectHistoryActions = 1000;
export const projectHistoryCoalesceMs = 700;

export const appDragRegion = "[-webkit-app-region:drag] select-none";
export const appNoDragRegion = "[-webkit-app-region:no-drag]";
export const buttonBase = "rounded-[8px] border border-transparent bg-[#171920] px-2.5 py-1.5 text-sm text-[#f7f7f8] transition hover:-translate-y-px hover:border-[#3b4150] hover:bg-[#20232c]";
export const appBarButtonBase = "rounded-[7px] border border-transparent bg-[#171920] px-2 py-1 text-xs text-[#f7f7f8] transition hover:-translate-y-px hover:border-[#3b4150] hover:bg-[#20232c]";
export const appBarActionButtonBase = `${appBarButtonBase} w-[70px]`;
const appBarSaveButtonEnabled = "w-[70px] rounded-[7px] border border-[var(--clipper-accent-strong)] bg-[var(--clipper-accent)] px-2 py-1 text-xs font-extrabold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)]";
const appBarSaveButtonDisabled = "w-[70px] cursor-not-allowed rounded-[7px] border border-[#2d313b] bg-[#171920] px-2 py-1 text-xs font-extrabold text-[#737884] opacity-70";
export const sectionTitle = "m-0 text-[11px] font-semibold uppercase tracking-[0.11em] text-[#d9dbe1]";
export const mutedCaps = "text-[11px] uppercase tracking-[0.11em] text-[#9b9da7]";
export const panelCard = "grid gap-[5px] rounded-xl border border-[#2d313b] bg-[#171920] p-3 text-[13px] text-[#dfe2ea]";
export const segmentedTabBase = "rounded-[8px] px-2 py-1.5 text-sm font-bold transition";
export const segmentedTabActive = "bg-[#272b36] text-white";
export const segmentedTabInactive = "bg-[#191c24] text-[#9b9da7] hover:text-white";

export const monacoOptions = {
  automaticLayout: true,
  bracketPairColorization: { enabled: true },
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  foldingHighlight: false,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  glyphMargin: false,
  hideCursorInOverviewRuler: true,
  lineDecorationsWidth: 10,
  lineNumbersMinChars: 3,
  minimap: { enabled: false },
  overviewRulerBorder: false,
  padding: { top: 14, bottom: 14 },
  renderLineHighlight: "all",
  scrollBeyondLastLine: false,
  tabSize: 2,
  wordWrap: "on",
} as const;

export function appBarSaveButtonClass(enabled: boolean) {
  return enabled ? appBarSaveButtonEnabled : appBarSaveButtonDisabled;
}
