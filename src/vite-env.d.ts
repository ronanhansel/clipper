/// <reference types="vite/client" />

declare module "*.yml?raw" {
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
    trashFile: (relativePath: string) => Promise<void>;
    renameFile: (relativePath: string, nextRelativePath: string) => Promise<void>;
    copyFile: (relativePath: string, nextRelativePath: string) => Promise<void>;
    listSystemFonts: () => Promise<string[]>;
    openProjectManifest: () => Promise<string | null>;
    createProjectDialog: () => Promise<string | null>;
    exportMediaFile: (defaultFileName: string, content: string) => Promise<string | null>;
    exportBinaryFile: (defaultFileName: string, base64Content: string) => Promise<string | null>;
    startVideoExport: (defaultFileName: string, frameRate: number, width: number, height: number) => Promise<{ sessionId: string; filePath: string } | null>;
    writeVideoFrame: (sessionId: string, frameData: Uint8ClampedArray) => Promise<void>;
    finishVideoExport: (sessionId: string) => Promise<string>;
    cancelVideoExport: (sessionId: string) => Promise<void>;
    renderVideoExport: (exportId: string, defaultFileName: string, project: unknown, scene: unknown, frameRate: number) => Promise<string | null>;
    cancelRenderVideoExport: (exportId: string) => Promise<void>;
    setWindowFullscreen: (fullscreen: boolean) => Promise<boolean>;
    toggleWindowFullscreen: () => Promise<boolean>;
    onVideoExportProgress: (callback: (exportId: string, progress: { frame: number; totalFrames: number; percent: number; status: string }) => void) => () => void;
    onModeShortcut: (callback: (key: "1" | "2" | "3" | "4") => void) => () => void;
    onSettingsShortcut: (callback: () => void) => () => void;
    onWindowFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  };
}
