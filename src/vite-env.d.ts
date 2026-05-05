/// <reference types="vite/client" />

declare module "*.yml?raw" {
  const source: string;
  export default source;
}

declare module "*.ts?raw" {
  const source: string;
  export default source;
}

declare module "*.css" {
  const source: string;
  export default source;
}

declare module "*.html" {
  const source: string;
  export default source;
}

type LocalFontData = {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
};

interface Window {
  queryLocalFonts?: () => Promise<LocalFontData[]>;
}

interface Window {
  clipper?: {
    platform: string;
    experimentalHtmlCanvasPostProcess?: boolean;
    readTextFile: (relativePath: string) => Promise<string>;
    readAppState?: () => Promise<Record<string, unknown>>;
    writeAppState?: (updates: Record<string, unknown>) => Promise<void>;
    writeTextFile: (relativePath: string, content: string) => Promise<void>;
    createDirectory: (relativePath: string) => Promise<void>;
    revealFile: (relativePath: string) => Promise<void>;
    revealAbsolutePath?: (filePath: string) => Promise<void>;
    trashFile: (relativePath: string) => Promise<void>;
    renameFile: (relativePath: string, nextRelativePath: string) => Promise<void>;
    copyFile: (relativePath: string, nextRelativePath: string) => Promise<void>;
    listDirectory: (relativePath: string) => Promise<{ name: string; isDirectory: boolean }[]>;
    findProjectFileByName: (directoryPath: string, fileName: string) => Promise<string | null>;
    openCompositionFile: (directoryPath: string) => Promise<string | null>;
    listSystemFonts: () => Promise<string[]>;
    openProjectManifest: () => Promise<string | null>;
    createProject: (projectName: string) => Promise<string | null>;
    exportMediaFile: (defaultFileName: string, content: string) => Promise<string | null>;
    exportBinaryFile: (defaultFileName: string, base64Content: string) => Promise<string | null>;
    startVideoExport: (defaultFileName: string, frameRate: number, width: number, height: number) => Promise<{ sessionId: string; filePath: string } | null>;
    writeVideoFrame: (sessionId: string, frameData: Uint8ClampedArray) => Promise<void>;
    finishVideoExport: (sessionId: string) => Promise<string>;
    cancelVideoExport: (sessionId: string) => Promise<void>;
    renderVideoExport: (exportId: string, defaultFileName: string, project: unknown, manifestPath: string, scene: unknown, frameRate: number, durationSeconds: number, tileHeight: number, reusePrerenderCache: boolean, exportWidth?: number, exportHeight?: number, mediaExportFormat?: string) => Promise<string | null>;
    prerenderFrame: (project: unknown, manifestPath: string, scene: unknown, sceneTime: number, sceneDuration: number, frameRate: number, tileHeight: number, blockDurationMs: number, frameRange?: { startFrame: number; endFrame: number }) => Promise<Array<{ width: number; height: number; pixelFormat: "bgra"; sceneTime: number; frameRate: number; data: Uint8Array }>>;
    prerenderVideoBlock: (project: unknown, manifestPath: string, scene: unknown, sceneTime: number, sceneDuration: number, frameRate: number, tileHeight: number, blockDurationMs: number) => Promise<{ width: number; height: number; mimeType: string; startTime: number; duration: number; startFrame: number; endFrame: number; frameRate: number; data: string }>;
    clearPrerenderCache: (manifestPath: string) => Promise<void>;
    clearAllPrerenderCaches: () => Promise<{ clearedCount: number }>;
    cancelRenderVideoExport: (exportId: string) => Promise<void>;
    setWindowFullscreen: (fullscreen: boolean) => Promise<boolean>;
    toggleWindowFullscreen: () => Promise<boolean>;
    watchTextFiles: (relativePaths: string[]) => Promise<void>;
    watchProjectFiles: (watchPaths: { files: string[]; directories: string[] }) => Promise<void>;
    onVideoExportProgress: (callback: (exportId: string, progress: { frame: number; totalFrames: number; percent: number; status: string; method?: "renderer" }) => void) => () => void;
    onTextFileChanged: (callback: (relativePath: string) => void) => () => void;
    onProjectFileChanged: (callback: (relativePath: string) => void) => () => void;
    onModeShortcut: (callback: (key: "1" | "2" | "3" | "4") => void) => () => void;
    onSettingsShortcut: (callback: () => void) => () => void;
    onCloseEditorTabShortcut: (callback: () => void) => () => void;
    onRestoreEditorTabShortcut: (callback: () => void) => () => void;
    onWindowFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  };
}

interface Window {
  /** Narrow export post-process bridge exposed by the export window preload. */
  clipperExportPostProcess?: {
    /**
     * Narrow readiness probe for export bridge diagnostics.
     * Returns true once the main process has delivered the MessagePort.
     * Intentionally not consumed by the current page handler; reserved as a
     * future-facing hook for pre-bridge health checks and dev diagnostics.
     */
    isReady: () => boolean;
  };
}
