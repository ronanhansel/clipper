import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { VideoExportSession } from "./types.js";

// ─── Dependencies injected from RenderEngine ────────────────────────────

export interface VideoSessionsDeps {
  ffmpegPath: string | null;
}

// ─── Video Export Session Manager ─────────────────────────────────────────

export class VideoExportSessionManager {
  private ffmpegPath: string | null;
  private videoExportSessions = new Map<string, VideoExportSession>();

  constructor(deps: VideoSessionsDeps) {
    this.ffmpegPath = deps.ffmpegPath;
  }

  private generateId(): string {
    return randomUUID();
  }

  startVideoExport(
    defaultFileName: string,
    frameRate: number,
    width: number,
    height: number,
    filePath: string,
  ): { sessionId: string; ffmpeg: ChildProcessWithoutNullStreams } {
    if (!this.ffmpegPath)
      throw new Error("The bundled ffmpeg binary is unavailable.");
    const sessionId = this.generateId();
    const ffmpeg = spawn(this.ffmpegPath, [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${width}x${height}`,
      "-r",
      String(frameRate),
      "-i",
      "-",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      filePath,
    ]);
    ffmpeg.stdin.setMaxListeners(0);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });

    const closePromise = new Promise<string | null>((resolve) => {
      ffmpeg.once("error", (error) => resolve(error.message));
      ffmpeg.once("close", (code) => {
        this.videoExportSessions.delete(sessionId);
        if (code === 0) resolve(null);
        else
          resolve(
            stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}.`,
          );
      });
    });

    this.videoExportSessions.set(sessionId, {
      process: ffmpeg,
      outputPath: filePath,
      closePromise,
    });
    return { sessionId, ffmpeg };
  }

  async writeVideoFrame(
    sessionId: string,
    frameData: Uint8Array,
  ): Promise<void> {
    const session = this.videoExportSessions.get(sessionId);
    if (!session) throw new Error("Video export session is not active.");
    const frame = Buffer.from(frameData);
    if (session.process.stdin.write(frame)) return;
    await new Promise<void>((resolve, reject) => {
      session.process.stdin.once("drain", resolve);
      session.process.stdin.once("error", reject);
    });
  }

  async finishVideoExport(sessionId: string): Promise<string> {
    const session = this.videoExportSessions.get(sessionId);
    if (!session) throw new Error("Video export session is not active.");
    session.process.stdin.end();
    const error = await session.closePromise;
    if (error) throw new Error(error);
    return session.outputPath;
  }

  cancelVideoExport(sessionId: string): void {
    const session = this.videoExportSessions.get(sessionId);
    if (!session) return;
    this.videoExportSessions.delete(sessionId);
    session.process.kill("SIGTERM");
  }
}
