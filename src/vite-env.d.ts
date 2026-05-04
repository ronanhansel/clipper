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
    readTextFile: (relativePath: string) => Promise<string>;
    readBinaryFile: (relativePath: string) => Promise<string>;
    writeTextFile: (relativePath: string, content: string) => Promise<void>;
    writeBinaryFile: (relativePath: string, base64Content: string) => Promise<void>;
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
    exportProjectDialog: (defaultFileName: string) => Promise<string | null>;
    exportMediaFile: (defaultFileName: string, content: string) => Promise<string | null>;
    exportBinaryFile: (defaultFileName: string, base64Content: string) => Promise<string | null>;
    startVideoExport: (defaultFileName: string, frameRate: number, width: number, height: number) => Promise<{ sessionId: string; filePath: string } | null>;
    writeVideoFrame: (sessionId: string, frameData: Uint8ClampedArray) => Promise<void>;
    finishVideoExport: (sessionId: string) => Promise<string>;
    cancelVideoExport: (sessionId: string) => Promise<void>;
    renderVideoExport: (exportId: string, defaultFileName: string, project: unknown, scene: unknown, frameRate: number, durationSeconds: number) => Promise<string | null>;
    rasterizePreviewFrame: (project: unknown, scene: unknown, sceneTime: number, frameRate: number) => Promise<{ width: number; height: number; pixelFormat: "bgra"; sceneTime: number; frameRate: number; data: string }>;
    cancelRenderVideoExport: (exportId: string) => Promise<void>;
    setWindowFullscreen: (fullscreen: boolean) => Promise<boolean>;
    toggleWindowFullscreen: () => Promise<boolean>;
    watchTextFiles: (relativePaths: string[]) => Promise<void>;
    watchProjectFiles: (watchPaths: { files: string[]; directories: string[] }) => Promise<void>;
    onVideoExportProgress: (callback: (exportId: string, progress: { frame: number; totalFrames: number; percent: number; status: string; method?: "fast-child" | "fast-in-process" | "slow-fallback" }) => void) => () => void;
    onTextFileChanged: (callback: (relativePath: string) => void) => () => void;
    onProjectFileChanged: (callback: (relativePath: string) => void) => () => void;
    onModeShortcut: (callback: (key: "1" | "2" | "3" | "4") => void) => () => void;
    onSettingsShortcut: (callback: () => void) => () => void;
    onExportProject: (callback: () => void) => () => void;
    onCloseEditorTabShortcut: (callback: () => void) => () => void;
    onRestoreEditorTabShortcut: (callback: () => void) => () => void;
    onWindowFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  };
}
