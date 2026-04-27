/// <reference types="vite/client" />

interface Window {
  clipper?: {
    platform: string;
    readTextFile: (relativePath: string) => Promise<string>;
    writeTextFile: (relativePath: string, content: string) => Promise<void>;
    exportMediaFile: (defaultFileName: string, content: string) => Promise<string | null>;
    exportBinaryFile: (defaultFileName: string, base64Content: string) => Promise<string | null>;
    startVideoExport: (defaultFileName: string, frameRate: number, width: number, height: number) => Promise<{ sessionId: string; filePath: string } | null>;
    writeVideoFrame: (sessionId: string, frameData: Uint8ClampedArray) => Promise<void>;
    finishVideoExport: (sessionId: string) => Promise<string>;
    cancelVideoExport: (sessionId: string) => Promise<void>;
    renderVideoExport: (exportId: string, defaultFileName: string, project: unknown, scene: unknown, frameRate: number) => Promise<string | null>;
    cancelRenderVideoExport: (exportId: string) => Promise<void>;
    onVideoExportProgress: (callback: (exportId: string, progress: { frame: number; totalFrames: number; percent: number; status: string }) => void) => () => void;
    onModeShortcut: (callback: (key: "1" | "2" | "3" | "4") => void) => () => void;
  };
}
