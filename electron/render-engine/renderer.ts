import type { BrowserWindow } from "electron";
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  isExportOutOfMemoryWarning,
  renderSceneToRawFrames as renderSceneToRawFramesFromCapture,
} from "./frameCapture.js";

import { VideoExportSessionManager } from "./videoSessions.js";

import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  DEFAULT_EXPORT_TILE_HEIGHT,
  EXPORT_PROCESS_STOP_TIMEOUT_MS,
  DEFAULT_PRERENDER_BLOCK_DURATION_MS,
  MIN_PRERENDER_BLOCK_DURATION_MS,
  MAX_PRERENDER_BLOCK_DURATION_MS,
  PRERENDER_VIDEO_BLOCK_MIME_TYPE,
  PRERENDER_VIDEO_BLOCK_CODEC_VERSION,
  EXPORT_CHROMIUM_ARGS,
  isExportChildStopMessage,
  type VideoExportMethod,
  type VideoExportProgress,
  type ExportSource,
  type RenderSceneToVideoOptions,
  type ExportFrameRange,
  type SupervisedRenderPayload,
  type SupervisedRenderResult,
  type PrerenderedFrame,
  type PrerenderedVideoBlock,
  type PrerenderCachePaths,
  type PrerenderVideoBlockCachePaths,
  type PrerenderCacheManifest,
  type PrerenderVideoCacheManifest,
  type Scene,
  type ProjectManifest,
} from "./types.js";

// ─── Dependencies injected from main ───────────────────────────────────────

export interface RenderEngineDeps {
  ffmpegPath: string | null;
  appRoot: string;
  resolveClipperFile: (relativePath: string) => string;
  loadExportWindow: (window: BrowserWindow) => Promise<void>;
  getElectronChildArgs: (args: string[], electronArgs?: string[]) => string[];
  appShuttingDownRef: { current: boolean };
  appQuit: () => void;
  appExit: (code: number) => void;
}

// ─── RenderEngine Controller ────────────────────────────────────────────────

export class RenderEngine {
  // ── Private state ─────────────────────────────────────────────────────
  private ffmpegPath: string | null;
  private appRoot: string;
  private resolveClipperFile: (relativePath: string) => string;
  private loadExportWindow: (window: BrowserWindow) => Promise<void>;
  private getElectronChildArgs: (
    args: string[],
    electronArgs?: string[],
  ) => string[];
  private appShuttingDownRef: { current: boolean };
  private appQuit: () => void;
  private appExit: (code: number) => void;

  private videoSessions: VideoExportSessionManager;
  private cancelledVideoRenders = new Set<string>();
  private activeVideoRenderControllers = new Map<string, Set<() => void>>();
  private activeSupervisedRenderStops = new Set<() => void>();
  private activePreviewVideoEncoders =
    new Set<ChildProcessWithoutNullStreams>();

  private hardwareEncoderSupport: Set<string> | null = null;

  constructor(deps: RenderEngineDeps) {
    this.ffmpegPath = deps.ffmpegPath;
    this.videoSessions = new VideoExportSessionManager({
      ffmpegPath: this.ffmpegPath,
    });
    this.appRoot = deps.appRoot;
    this.resolveClipperFile = deps.resolveClipperFile;
    this.loadExportWindow = deps.loadExportWindow;
    this.getElectronChildArgs = deps.getElectronChildArgs;
    this.appShuttingDownRef = deps.appShuttingDownRef;
    this.appQuit = deps.appQuit;
    this.appExit = deps.appExit;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  // ── Simple ffmpeg-pipe video export ──────────────────────────────────

  startVideoExport(
    defaultFileName: string,
    frameRate: number,
    width: number,
    height: number,
    filePath: string,
  ): { sessionId: string; ffmpeg: ChildProcessWithoutNullStreams } {
    return this.videoSessions.startVideoExport(
      defaultFileName,
      frameRate,
      width,
      height,
      filePath,
    );
  }

  async writeVideoFrame(
    sessionId: string,
    frameData: Uint8Array,
  ): Promise<void> {
    return this.videoSessions.writeVideoFrame(sessionId, frameData);
  }

  async finishVideoExport(sessionId: string): Promise<string> {
    return this.videoSessions.finishVideoExport(sessionId);
  }

  cancelVideoExport(sessionId: string): void {
    return this.videoSessions.cancelVideoExport(sessionId);
  }

  // ── Supervised scene-to-video export ─────────────────────────────────

  async renderSceneToVideoSupervised(
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    outputPath: string,
    frameRate: number,
    durationSeconds: number,
    options: RenderSceneToVideoOptions = {},
  ): Promise<void> {
    if (!this.ffmpegPath)
      throw new Error("The bundled ffmpeg binary is unavailable.");
    if (!Number.isFinite(frameRate) || frameRate <= 0)
      throw new Error("Video export requires a valid frame rate.");
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
      throw new Error("Video export requires a valid duration.");

    const {
      exportId,
      onProgress,
      reusePrerenderCache = false,
      source = "app-supervised",
      tileHeight = DEFAULT_EXPORT_TILE_HEIGHT,
      exportWidth = FRAME_WIDTH,
      exportHeight = FRAME_HEIGHT,
      exportFormat = "prores-422-hq",
      exportRenderQuality = "high",
      exportWorkerMapping,
      exportTileMapping,
      exportRenderMode = "renderer",
      stableSlowGridPreset = "safe",
      stableSlowValidationSamples = 1,
    } = options;
    // Clear any previous cancel flag for this export ID
    if (exportId) this.cancelledVideoRenders.delete(exportId);
    const renderScale = this.getExportRenderQualityScale(exportRenderQuality);
    const captureWidth = Math.max(1, Math.round(exportWidth * renderScale));
    const captureHeight = Math.max(1, Math.round(exportHeight * renderScale));
    const captureTileHeight = this.getExportTileHeight(
      captureWidth,
      captureHeight,
      tileHeight,
      exportTileMapping,
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const encoder = this.getVideoEncoderArgs(exportFormat);
    const totalFrames = Math.max(1, Math.ceil(durationSeconds * frameRate));
    const frameRange: ExportFrameRange = {
      startFrame: 0,
      endFrame: totalFrames,
    };
    const tempDir = path.join(
      path.dirname(outputPath),
      `.export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    onProgress?.({
      frame: 0,
      totalFrames,
      percent: 0,
      status: `Preparing ${encoder.label} export...`,
    });
    console.log(
      `[clipper export] source=${source} total-frames=${totalFrames} tile-height=${captureTileHeight} output=${exportWidth}x${exportHeight} capture=${captureWidth}x${captureHeight} quality=${exportRenderQuality}`,
    );

    const ffmpeg = spawn(this.ffmpegPath, [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "bgra",
      "-s",
      `${captureWidth}x${captureHeight}`,
      "-framerate",
      String(frameRate),
      "-i",
      "-",
      "-an",
      ...(captureWidth !== exportWidth || captureHeight !== exportHeight
        ? ["-vf", `scale=${exportWidth}:${exportHeight}:flags=lanczos`]
        : []),
      ...encoder.args,
      ...(encoder.movflags ? ["-movflags", encoder.movflags] : []),
      outputPath,
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
        if (code === 0) resolve(null);
        else
          resolve(
            stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}.`,
          );
      });
    });

    let pendingFrameWrite: Promise<void> | null = null;
    let activeMethod: VideoExportMethod = exportRenderMode;
    let encodedFrameCount = 0;
    let capturedFrameCount = 0;
    let workerCount = 1;
    const unregisterFfmpegCancel = this.registerActiveVideoRenderCancel(
      exportId,
      () => {
        if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
      },
    );
    const reportStatus = (
      status: string,
      method: VideoExportMethod = activeMethod,
    ) => {
      activeMethod = method;
      onProgress?.({
        frame: encodedFrameCount,
        totalFrames,
        percent: Math.round((encodedFrameCount / totalFrames) * 100),
        status,
        method,
      });
    };
    const reportCapturedFrameProgress = (
      _frameIndex: number,
      method: VideoExportMethod = activeMethod,
    ) => {
      activeMethod = method;
      capturedFrameCount += 1;
    };
    const reportEncodedFrameProgress = (
      method: VideoExportMethod = activeMethod,
    ) => {
      activeMethod = method;
      encodedFrameCount += 1;
      const status =
        workerCount > 1
          ? `Encoding frame ${encodedFrameCount} of ${totalFrames} (${capturedFrameCount} captured)`
          : `Encoding frame ${encodedFrameCount} of ${totalFrames}`;
      onProgress?.({
        frame: encodedFrameCount,
        totalFrames,
        percent: Math.round((encodedFrameCount / totalFrames) * 100),
        status,
        method,
      });
    };

    try {
      if (exportId && this.cancelledVideoRenders.has(exportId))
        throw new Error("Video export cancelled.");

      workerCount = this.getExportWorkerCount(
        captureWidth,
        captureHeight,
        totalFrames,
        exportWorkerMapping,
      );
      const workerRanges = this.splitFrameRangeForWorkers(
        frameRange,
        workerCount,
      );
      const workerRenderRanges = workerRanges.map((range) => ({
        startFrame: frameRange.startFrame,
        endFrame: range.endFrame,
      }));

      const startupStatus =
        workerCount > 1
          ? `Renderer: capturing frames with ${workerCount} worker(s)`
          : "Renderer: capturing frames";
      reportStatus(
        exportRenderMode === "stable-slow"
          ? "Stable slow renderer: validating captured tiles"
          : startupStatus,
        exportRenderMode,
      );
      console.log(
        `[clipper export] source=${source} total-frames=${totalFrames} tile-height=${captureTileHeight} output=${exportWidth}x${exportHeight} capture=${captureWidth}x${captureHeight} quality=${exportRenderQuality} workers=${workerCount} ranges=${workerRanges.map((r) => `${r.startFrame}-${r.endFrame}`).join(",")} render-ranges=${workerRenderRanges.map((r) => `${r.startFrame}-${r.endFrame}`).join(",")}`,
      );

      const exportStartTime = Date.now();

      // Per-worker temp directories (inside parent tempDir)
      const workerTempDirs = workerRanges.map((_, i) =>
        path.join(tempDir, `worker-${i}`),
      );
      await Promise.all(
        workerTempDirs.map((d) => fs.mkdir(d, { recursive: true })),
      );

      // Build frame-index → outputPath lookup and worker-index map
      const frameOutputPathMap = new Map<number, string>();
      const frameWorkerIndexMap = new Map<number, number>();
      for (let w = 0; w < workerRanges.length; w += 1) {
        const outputPath = this.getSupervisedFrameRangeOutputPath(
          workerTempDirs[w],
        );
        for (
          let f = workerRanges[w].startFrame;
          f < workerRanges[w].endFrame;
          f += 1
        ) {
          frameOutputPathMap.set(f, outputPath);
          frameWorkerIndexMap.set(f, w);
        }
      }

      // Launch all workers concurrently
      const workerFutures = workerRenderRanges.map((range, i) =>
        this.renderSupervisedFrameRangeChild(
          project,
          manifestPath,
          scene,
          workerTempDirs[i],
          frameRate,
          durationSeconds,
          totalFrames,
          captureTileHeight,
          source,
          reportCapturedFrameProgress,
          exportId,
          range,
          "export",
          captureWidth,
          captureHeight,
          exportRenderMode,
          stableSlowGridPreset,
          stableSlowValidationSamples,
        ),
      );

      // Track per-worker completion / error
      const workerStates: {
        done: boolean;
        error: unknown;
        nativeWarningDetected: boolean;
        nativeWarningCount: number;
      }[] = workerFutures.map(() => ({
        done: false,
        error: null,
        nativeWarningDetected: false,
        nativeWarningCount: 0,
      }));
      workerFutures.forEach((promise, i) => {
        promise.then(
          (result) => {
            workerStates[i].done = true;
            workerStates[i].nativeWarningDetected =
              result.nativeWarningDetected;
            workerStates[i].nativeWarningCount = result.nativeWarningCount;
          },
          (err) => {
            workerStates[i].done = true;
            workerStates[i].error = err;
          },
        );
      });

      const expectedFrameSize = captureWidth * captureHeight * 4;
      const cacheKey =
        reusePrerenderCache &&
        renderScale === 1 &&
        exportWidth === FRAME_WIDTH &&
        exportHeight === FRAME_HEIGHT
          ? this.getPrerenderCacheKey(
              project,
              scene,
              frameRate,
              captureTileHeight,
              DEFAULT_PRERENDER_BLOCK_DURATION_MS,
              exportWidth,
              exportHeight,
            )
          : null;

      // Stream frames to ffmpeg stdin in increasing frame order
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        this.throwIfVideoRenderCancelled(exportId);

        const outputPath = frameOutputPathMap.get(frameIndex)!;
        const framePath = this.getSupervisedFrameOutputPath(
          outputPath,
          frameIndex,
        );
        const workerIdx = frameWorkerIndexMap.get(frameIndex)!;

        // Wait for the frame file to be written by its worker
        while (true) {
          this.throwIfVideoRenderCancelled(exportId);

          const ws = workerStates[workerIdx];
          if (ws.done && ws.error) {
            if (exportId) {
              this.cancelledVideoRenders.add(exportId);
              for (const cancel of this.activeVideoRenderControllers.get(
                exportId,
              ) ?? [])
                cancel();
            }
            throw ws.error;
          }

          const stat = await fs.stat(framePath).catch(() => null);
          if (stat && stat.size === expectedFrameSize) break;

          if (ws.done && !ws.error && !stat) {
            throw new Error(
              `Worker ${workerIdx} completed but frame ${frameIndex} file not found.`,
            );
          }

          await new Promise((r) => setTimeout(r, 5));
        }

        // Read and pipe to ffmpeg
        const frameBuffer = await fs.readFile(framePath);
        if (pendingFrameWrite) await pendingFrameWrite;
        pendingFrameWrite = this.writeProcessInput(
          ffmpeg,
          frameBuffer,
          exportId,
        );

        // Delete frame file to reduce disk usage
        await fs.rm(framePath, { force: true }).catch(() => undefined);

        // Write to prerender cache while streaming
        if (cacheKey) {
          const cachePaths = this.getPrerenderCachePaths(
            manifestPath,
            scene,
            frameRate,
            frameIndex,
          );
          await this.writePrerenderFrame(
            cachePaths,
            frameBuffer,
            cacheKey,
            frameIndex / frameRate,
            frameRate,
            exportWidth,
            exportHeight,
          );
        }

        reportEncodedFrameProgress(exportRenderMode);
      }

      // Clean up remaining frame files from all workers
      for (let w = 0; w < workerTempDirs.length; w += 1) {
        await this.removeSupervisedFrameOutputs(
          this.getSupervisedFrameRangeOutputPath(workerTempDirs[w]),
          workerRenderRanges[w],
        ).catch(() => undefined);
      }

      // Wait for all workers to finish and collect native warnings
      for (const p of workerFutures) {
        await p.catch(() => {
          /* already handled */
        });
      }
      for (const ws of workerStates) {
        if (ws.nativeWarningDetected) {
          console.warn(
            `[clipper export] source=${source} parent-native-warning=yes native-warnings=${ws.nativeWarningCount}`,
          );
        }
      }

      if (pendingFrameWrite) await pendingFrameWrite;
      if (exportId && this.cancelledVideoRenders.has(exportId))
        throw new Error("Video export cancelled.");
      ffmpeg.stdin.end();
      const error = await closePromise;
      if (exportId && this.cancelledVideoRenders.has(exportId))
        throw new Error("Video export cancelled.");
      if (error) throw new Error(error);

      const exportElapsed = (Date.now() - exportStartTime) / 1000;
      console.log(
        `[clipper export] total-elapsed=${exportElapsed.toFixed(1)}s total-frames=${totalFrames} throughput=${(totalFrames / Math.max(exportElapsed, 0.001)).toFixed(1)}fps workers=${workerCount}`,
      );

      onProgress?.({
        frame: totalFrames,
        totalFrames,
        percent: 100,
        status: "Finalizing video...",
        method: activeMethod,
      });
    } catch (error) {
      if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
      if (exportId) {
        this.cancelledVideoRenders.add(exportId);
        for (const cancel of this.activeVideoRenderControllers.get(exportId) ??
          [])
          cancel();
      }
      await this.waitForProcessClose(
        closePromise,
        () => ffmpeg.kill("SIGKILL"),
        EXPORT_PROCESS_STOP_TIMEOUT_MS,
      );
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
      if (exportId) this.cancelledVideoRenders.delete(exportId);
      throw error;
    } finally {
      unregisterFfmpegCancel();
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  // ── Cancel ───────────────────────────────────────────────────────────

  cancelRender(exportId: string): void {
    this.cancelledVideoRenders.add(exportId);
    for (const cancel of this.activeVideoRenderControllers.get(exportId) ?? [])
      cancel();
  }

  requestAllActiveRendersStop(): void {
    this.appShuttingDownRef.current = true;
    for (const cancelSet of this.activeVideoRenderControllers.values()) {
      for (const cancel of cancelSet) cancel();
    }
    for (const stop of this.activeSupervisedRenderStops) stop();
    for (const encoder of this.activePreviewVideoEncoders) {
      if (!encoder.killed) encoder.kill("SIGTERM");
    }
  }

  // ── Prerender cache ──────────────────────────────────────────────────

  async prerenderFrame(
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    sceneTime: number,
    sceneDuration: number,
    frameRate: number,
    tileHeight = DEFAULT_EXPORT_TILE_HEIGHT,
    blockDurationMs = DEFAULT_PRERENDER_BLOCK_DURATION_MS,
    exactFrameRange?: ExportFrameRange,
  ): Promise<PrerenderedFrame[]> {
    if (!Number.isFinite(frameRate) || frameRate <= 0)
      throw new Error("Prerender cache requires a valid frame rate.");
    if (!Number.isFinite(sceneTime) || sceneTime < 0)
      throw new Error("Prerender cache requires a valid scene time.");
    if (!Number.isFinite(sceneDuration) || sceneDuration <= 0)
      throw new Error("Prerender cache requires a valid scene duration.");
    const exportTileHeight = this.clampExportTileHeight(tileHeight);
    const exportBlockDurationMs =
      this.clampPrerenderBlockDurationMs(blockDurationMs);
    const frameIndex = Math.round(sceneTime * frameRate);
    const block = exactFrameRange
      ? this.getBoundedPrerenderFrameRange(
          exactFrameRange,
          sceneDuration,
          frameRate,
        )
      : this.getPrerenderBlockRange(
          frameIndex,
          sceneDuration,
          frameRate,
          exportBlockDurationMs,
        );
    const cacheKey = this.getPrerenderCacheKey(
      project,
      scene,
      frameRate,
      exportTileHeight,
      exportBlockDurationMs,
    );
    const logPrefix = `[clipper prerender-cache] scene=${scene.id} frame=${frameIndex} time=${sceneTime.toFixed(3)}`;
    const cachedBlock = await this.readPrerenderBlock(
      manifestPath,
      scene,
      frameRate,
      block,
      cacheKey,
    );
    if (cachedBlock.length === block.endFrame - block.startFrame)
      return cachedBlock;
    console.log(
      `${logPrefix} render-block start=${block.startFrame} end=${block.endFrame}`,
    );
    await this.renderPrerenderBlock(
      project,
      manifestPath,
      scene,
      sceneDuration,
      frameRate,
      exportTileHeight,
      block,
      cacheKey,
      logPrefix,
    );
    const frames = await this.readPrerenderBlock(
      manifestPath,
      scene,
      frameRate,
      block,
      cacheKey,
    );
    if (frames.length !== block.endFrame - block.startFrame)
      throw new Error(
        `Prerender cache block did not produce ${block.endFrame - block.startFrame} frame(s).`,
      );
    return frames;
  }

  async prerenderVideoBlock(
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    sceneTime: number,
    sceneDuration: number,
    frameRate: number,
    tileHeight = DEFAULT_EXPORT_TILE_HEIGHT,
    blockDurationMs = DEFAULT_PRERENDER_BLOCK_DURATION_MS,
  ): Promise<PrerenderedVideoBlock> {
    if (!Number.isFinite(frameRate) || frameRate <= 0)
      throw new Error("Prerender cache requires a valid frame rate.");
    if (!Number.isFinite(sceneTime) || sceneTime < 0)
      throw new Error("Prerender cache requires a valid scene time.");
    if (!Number.isFinite(sceneDuration) || sceneDuration <= 0)
      throw new Error("Prerender cache requires a valid scene duration.");
    if (!this.ffmpegPath)
      throw new Error("The bundled ffmpeg binary is unavailable.");
    const exportTileHeight = this.clampExportTileHeight(tileHeight);
    const exportBlockDurationMs =
      this.clampPrerenderBlockDurationMs(blockDurationMs);
    const frameIndex = Math.round(sceneTime * frameRate);
    const block = this.getPrerenderBlockRange(
      frameIndex,
      sceneDuration,
      frameRate,
      exportBlockDurationMs,
    );
    const cacheKey = this.getPrerenderCacheKey(
      project,
      scene,
      frameRate,
      exportTileHeight,
      exportBlockDurationMs,
    );
    const logPrefix = `[clipper prerender-video-cache] scene=${scene.id} frame=${frameIndex} time=${sceneTime.toFixed(3)}`;
    const cachedBlock = await this.readPrerenderVideoBlock(
      manifestPath,
      scene,
      frameRate,
      block,
      cacheKey,
    );
    if (cachedBlock) return cachedBlock;
    console.log(
      `${logPrefix} render-block start=${block.startFrame} end=${block.endFrame}`,
    );
    await this.renderPrerenderVideoBlock(
      project,
      manifestPath,
      scene,
      sceneDuration,
      frameRate,
      exportTileHeight,
      block,
      cacheKey,
      logPrefix,
    );
    const renderedBlock = await this.readPrerenderVideoBlock(
      manifestPath,
      scene,
      frameRate,
      block,
      cacheKey,
    );
    if (!renderedBlock)
      throw new Error("Prerender video cache block was not written.");
    return renderedBlock;
  }

  async clearPrerenderCache(manifestPath: string): Promise<void> {
    await fs
      .rm(this.getProjectCacheDirectory(manifestPath), {
        recursive: true,
        force: true,
      })
      .catch(() => undefined);
  }

  async clearAllPrerenderCaches(): Promise<{ clearedCount: number }> {
    const projectsDirectory = path.join(this.appRoot, "clipper", "projects");
    const entries = await fs
      .readdir(projectsDirectory, { withFileTypes: true })
      .catch(() => []);
    let clearedCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await fs
        .rm(path.join(projectsDirectory, entry.name, ".cache", "prerender"), {
          recursive: true,
          force: true,
        })
        .catch(() => undefined);
      clearedCount += 1;
    }
    return { clearedCount };
  }

  // ── Child process render mode ────────────────────────────────────────

  async runRenderVideoChildIfRequested(payloadPath: string): Promise<boolean> {
    let childRenderCancelled = false;
    const cancelChildRender = () => {
      childRenderCancelled = true;
      setImmediate(() => this.appQuit());
    };
    process.once("SIGTERM", cancelChildRender);
    process.once("SIGINT", cancelChildRender);
    process.on("message", (message) => {
      if (!isExportChildStopMessage(message)) return;
      cancelChildRender();
    });
    const payload = JSON.parse(
      await fs.readFile(payloadPath, "utf8"),
    ) as SupervisedRenderPayload;
    if (childRenderCancelled) return true;
    try {
      await this.renderSceneToRawFrames(
        payload,
        undefined,
        () => childRenderCancelled,
      );
    } catch (error) {
      if (childRenderCancelled) return true;
      console.error(
        error instanceof Error ? error.stack || error.message : String(error),
      );
      this.appExit(1);
      return true;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE / INTERNAL
  // ═══════════════════════════════════════════════════════════════════════

  // ── Child render process entry (public) ──────────────────────────────

  async renderSceneToRawFrames(
    payload: SupervisedRenderPayload,
    onFrameCaptured?: (frameIndex: number) => void,
    shouldStop?: () => boolean,
  ): Promise<{ nativeWarningDetected: boolean; nativeWarningCount: number }> {
    return renderSceneToRawFramesFromCapture(
      payload,
      {
        loadExportWindow: this.loadExportWindow,
        countContiguousSupervisedFrameFiles:
          this.countContiguousSupervisedFrameFiles.bind(this),
        getSupervisedFrameOutputPath:
          this.getSupervisedFrameOutputPath.bind(this),
        clampExportTileHeight: this.clampExportTileHeight.bind(this),
      },
      onFrameCaptured,
      shouldStop,
    );
  }

  // ── Video encoder helpers ────────────────────────────────────────────

  private getSupportedHardwareEncoders(): Set<string> {
    if (this.hardwareEncoderSupport) return this.hardwareEncoderSupport;
    this.hardwareEncoderSupport = new Set<string>();
    if (!this.ffmpegPath) return this.hardwareEncoderSupport;
    const result = spawnSync(this.ffmpegPath, ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    for (const encoder of [
      "h264_videotoolbox",
      "hevc_videotoolbox",
      "h264_nvenc",
      "h264_qsv",
      "h264_amf",
      "h264_vaapi",
    ]) {
      if (output.includes(encoder)) this.hardwareEncoderSupport!.add(encoder);
    }
    return this.hardwareEncoderSupport;
  }

  private getVideoEncoderArgs(
    format:
      | "prores-422-hq"
      | "prores-4444"
      | "dnxhr-hqx"
      | "mov"
      | "h264-high"
      | "mp4"
      | "webm" = "prores-422-hq",
  ): { label: string; args: string[]; movflags?: string } {
    if (format === "prores-422-hq") {
      return {
        label: "ProRes 422 HQ",
        args: [
          "-c:v",
          "prores_ks",
          "-profile:v",
          "3",
          "-vendor",
          "apl0",
          "-pix_fmt",
          "yuv422p10le",
        ],
      };
    }
    if (format === "prores-4444") {
      return {
        label: "ProRes 4444",
        args: [
          "-c:v",
          "prores_ks",
          "-profile:v",
          "4",
          "-vendor",
          "apl0",
          "-pix_fmt",
          "yuva444p10le",
        ],
      };
    }
    if (format === "dnxhr-hqx") {
      return {
        label: "DNxHR HQX",
        args: [
          "-c:v",
          "dnxhd",
          "-profile:v",
          "dnxhr_hqx",
          "-pix_fmt",
          "yuv422p10le",
        ],
      };
    }
    if (format === "mov") {
      return {
        label: "Uncompressed BGRA",
        args: ["-c:v", "rawvideo", "-pix_fmt", "bgra"],
      };
    }
    if (format === "webm") {
      return {
        label: "VP9",
        args: [
          "-c:v",
          "libvpx-vp9",
          "-b:v",
          "0",
          "-crf",
          "30",
          "-pix_fmt",
          "yuv420p",
          "-deadline",
          "realtime",
          "-cpu-used",
          "5",
        ],
      };
    }
    if (format === "h264-high") {
      return {
        label: "x264 High Quality",
        args: [
          "-c:v",
          "libx264",
          "-preset",
          "slow",
          "-crf",
          "12",
          "-pix_fmt",
          "yuv420p",
        ],
        movflags: "+faststart",
      };
    }
    const supportedEncoders = this.getSupportedHardwareEncoders();
    if (
      process.platform === "darwin" &&
      supportedEncoders.has("h264_videotoolbox")
    ) {
      return {
        label: "VideoToolbox",
        args: [
          "-c:v",
          "h264_videotoolbox",
          "-b:v",
          "12M",
          "-allow_sw",
          "0",
          "-pix_fmt",
          "yuv420p",
        ],
        movflags: "+faststart",
      };
    }
    return {
      label: "x264",
      args: [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
      ],
      movflags: "+faststart",
    };
  }

  // ── Cancel handling ──────────────────────────────────────────────────

  private registerActiveVideoRenderCancel(
    exportId: string | undefined,
    cancel: () => void,
  ): () => void {
    if (!exportId) return () => {};
    let controllers = this.activeVideoRenderControllers.get(exportId);
    if (!controllers) {
      controllers = new Set();
      this.activeVideoRenderControllers.set(exportId, controllers);
    }
    controllers.add(cancel);
    return () => {
      controllers!.delete(cancel);
      if (controllers!.size === 0)
        this.activeVideoRenderControllers.delete(exportId);
    };
  }

  private throwIfVideoRenderCancelled(exportId: string | undefined): void {
    if (exportId && this.cancelledVideoRenders.has(exportId))
      throw new Error("Video export cancelled.");
  }

  private clampExportTileHeight(
    value: number,
    maxHeight: number = FRAME_HEIGHT,
  ): number {
    if (!Number.isFinite(value)) return DEFAULT_EXPORT_TILE_HEIGHT;
    return Math.min(Math.max(Math.round(value), 1), maxHeight);
  }

  private getExportRenderQualityScale(
    quality: RenderSceneToVideoOptions["exportRenderQuality"],
  ): number {
    if (quality === "standard") return 1;
    if (quality === "ultra") return 3;
    return 2;
  }

  // ── Parallel worker helpers ──────────────────────────────────────────

  private getExportWorkerCount(
    exportWidth: number,
    exportHeight: number,
    totalFrames: number,
    mapping: RenderSceneToVideoOptions["exportWorkerMapping"],
  ): number {
    const cpuCount = os.availableParallelism?.() ?? os.cpus().length;
    let maxWorkers =
      exportHeight <= 1080
        ? (mapping?.hd ?? 4)
        : exportHeight <= 1440
          ? (mapping?.qhd ?? 2)
          : (mapping?.uhd ?? 1);
    maxWorkers = Math.min(maxWorkers, Math.max(1, cpuCount - 1));
    return Math.max(1, Math.min(maxWorkers, totalFrames));
  }

  private getExportTileHeight(
    exportWidth: number,
    exportHeight: number,
    fallbackTileHeight: number,
    mapping: RenderSceneToVideoOptions["exportTileMapping"],
  ): number {
    const configuredTileCount =
      exportHeight <= 1080
        ? mapping?.hd
        : exportHeight <= 1440
          ? mapping?.qhd
          : mapping?.uhd;
    const tileCount = Number.isFinite(configuredTileCount)
      ? Math.max(1, Math.round(configuredTileCount as number))
      : null;
    if (!tileCount)
      return this.clampExportTileHeight(fallbackTileHeight, exportHeight);
    return this.clampExportTileHeight(
      Math.ceil(exportHeight / tileCount),
      exportHeight,
    );
  }

  private splitFrameRangeForWorkers(
    range: ExportFrameRange,
    workerCount: number,
  ): ExportFrameRange[] {
    const totalFrames = range.endFrame - range.startFrame;
    if (totalFrames <= 0 || workerCount <= 1) return [range];
    const ranges: ExportFrameRange[] = [];
    const framesPerWorker = Math.ceil(totalFrames / workerCount);
    for (let i = 0; i < workerCount; i += 1) {
      const start = range.startFrame + i * framesPerWorker;
      const end = Math.min(
        range.startFrame + (i + 1) * framesPerWorker,
        range.endFrame,
      );
      if (start >= end) break;
      ranges.push({ startFrame: start, endFrame: end });
    }
    return ranges.length > 0 ? ranges : [range];
  }

  // ── Process / Promise helpers ────────────────────────────────────────

  private async waitForProcessClose<T>(
    closePromise: Promise<T>,
    forceStop: () => void,
    timeoutMs: number,
  ): Promise<void> {
    let timeout: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        closePromise.catch(() => undefined),
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            forceStop();
            resolve();
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async writeProcessInput(
    process: ChildProcessWithoutNullStreams,
    chunk: Buffer,
    exportId?: string,
  ): Promise<void> {
    this.throwIfVideoRenderCancelled(exportId);
    if (process.stdin.write(chunk)) return;
    await new Promise<void>((resolve, reject) => {
      let cancelPoll: NodeJS.Timeout | null = null;
      const cleanup = () => {
        process.stdin.off("drain", handleDrain);
        process.stdin.off("error", handleError);
        process.off("close", handleClose);
        if (cancelPoll) clearInterval(cancelPoll);
      };
      const handleDrain = () => {
        cleanup();
        resolve();
      };
      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const handleClose = () => {
        cleanup();
        reject(
          new Error(
            exportId && this.cancelledVideoRenders.has(exportId)
              ? "Video export cancelled."
              : "Video encoder closed before accepting frame data.",
          ),
        );
      };
      process.stdin.once("drain", handleDrain);
      process.stdin.once("error", handleError);
      process.once("close", handleClose);
      if (exportId) {
        cancelPoll = setInterval(() => {
          if (!this.cancelledVideoRenders.has(exportId)) return;
          cleanup();
          reject(new Error("Video export cancelled."));
        }, 50);
      }
    });
    this.throwIfVideoRenderCancelled(exportId);
  }
  // ── Child process render management ───────────────────────────────────

  private async renderSupervisedFrameRangeChild(
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    tempDir: string,
    frameRate: number,
    durationSeconds: number,
    totalFrames: number,
    tileHeight: number,
    source: ExportSource,
    onFrameCaptured?: (frameIndex: number, method?: VideoExportMethod) => void,
    exportId?: string,
    requestedFrameRange?: ExportFrameRange,
    renderSurface: SupervisedRenderPayload["renderSurface"] = "export",
    exportWidth?: number,
    exportHeight?: number,
    exportRenderMode: SupervisedRenderPayload["exportRenderMode"] = "renderer",
    stableSlowGridPreset: SupervisedRenderPayload["stableSlowGridPreset"] = "safe",
    stableSlowValidationSamples: SupervisedRenderPayload["stableSlowValidationSamples"] = 1,
  ): Promise<SupervisedRenderResult> {
    const _exportWidth = exportWidth ?? FRAME_WIDTH;
    const _exportHeight = exportHeight ?? FRAME_HEIGHT;
    const frameRange: ExportFrameRange = requestedFrameRange ?? {
      startFrame: 0,
      endFrame: totalFrames,
    };
    const outputPath = this.getSupervisedFrameRangeOutputPath(tempDir);
    const payloadPath = path.join(tempDir, "renderer.json");
    const nativeLogPath = path.join(tempDir, "renderer.native.log");
    const payload: SupervisedRenderPayload = {
      project,
      manifestPath,
      scene,
      frameRate,
      durationSeconds,
      frameRange,
      outputPath,
      tileHeight,
      source,
      renderSurface,
      exportWidth: _exportWidth,
      exportHeight: _exportHeight,
      exportRenderMode,
      stableSlowGridPreset,
      stableSlowValidationSamples,
    };
    await fs.writeFile(payloadPath, JSON.stringify(payload), "utf8");
    const electronArgs = [
      ...EXPORT_CHROMIUM_ARGS,
      "--enable-logging=file",
      `--log-file=${nativeLogPath}`,
    ];
    const child = spawn(
      process.execPath,
      this.getElectronChildArgs(
        ["--render-video-child", payloadPath],
        electronArgs,
      ),
      { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe", "ipc"] },
    );
    if (!child.stdout || !child.stderr)
      throw new Error("Supervised export child did not expose output streams.");
    let childStopForceTimer: NodeJS.Timeout | null = null;
    let childStopReason: string | null = null;
    let childStopMessageSent = false;
    const forceStopChild = () => {
      if (child.exitCode === null) child.kill("SIGKILL");
    };
    const requestChildStop = (reason: string, forceAfterTimeout = false) => {
      if (child.exitCode !== null) return;
      if (reason === "cancel" || !childStopReason) childStopReason = reason;
      if (child.connected && !childStopMessageSent) {
        childStopMessageSent = true;
        child.send(
          { type: "clipper:stop-render-child", reason },
          () => undefined,
        );
      } else if (!child.connected) child.kill("SIGTERM");
      if (forceAfterTimeout && !childStopForceTimer)
        childStopForceTimer = setTimeout(
          forceStopChild,
          EXPORT_PROCESS_STOP_TIMEOUT_MS,
        );
    };
    let cancelledWhileWaiting = false;
    const stopChild = () => {
      cancelledWhileWaiting = true;
      requestChildStop("cancel", true);
    };
    const unregisterCancel = this.registerActiveVideoRenderCancel(
      exportId,
      stopChild,
    );
    this.activeSupervisedRenderStops.add(stopChild);

    let stdout = "";
    let stderr = "";
    let stdoutWarningTail = "";
    let stderrWarningTail = "";
    let nativeWarningDetected = false;
    let nativeWarningCount = 0;
    const inspectChunk = (chunk: Buffer, stream: "stdout" | "stderr") => {
      const text = chunk.toString("utf8");
      if (stream === "stdout") stdout += text;
      else stderr += text;
      if (stdout.length > 16000) stdout = stdout.slice(-16000);
      if (stderr.length > 16000) stderr = stderr.slice(-16000);
      for (const frameIndex of this.getExportFrameProgressIndexes(text))
        onFrameCaptured?.(frameIndex, "renderer");
      const combined = `${stream === "stdout" ? stdoutWarningTail : stderrWarningTail}${text}`;
      if (stream === "stdout") stdoutWarningTail = combined.slice(-512);
      else stderrWarningTail = combined.slice(-512);
      if (isExportOutOfMemoryWarning(combined)) {
        nativeWarningDetected = true;
        nativeWarningCount += 1;
        if (nativeWarningCount <= 3) {
          console.warn(
            `[clipper export] source=${source} parent-native-warning stream=${stream} path=renderer: ${combined.trim().slice(-600)}`,
          );
        } else if (nativeWarningCount === 4) {
          console.warn(
            `[clipper export] source=${source} path=renderer suppressing repeated native tile-memory warnings.`,
          );
        }
        if (stream === "stdout") stdoutWarningTail = "";
        else stderrWarningTail = "";
      }
    };
    const inspectNativeWarningText = (
      text: string,
      stream: "stdout" | "stderr",
    ) => {
      if (!isExportOutOfMemoryWarning(text)) return;
      nativeWarningDetected = true;
      nativeWarningCount += 1;
      if (nativeWarningCount <= 3) {
        console.warn(
          `[clipper export] source=${source} parent-native-warning stream=${stream} path=renderer: ${text.trim().slice(-600)}`,
        );
      } else if (nativeWarningCount === 4) {
        console.warn(
          `[clipper export] source=${source} path=renderer suppressing repeated native tile-memory warnings.`,
        );
      }
    };
    child.stdout.on("data", (chunk: Buffer) => inspectChunk(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => inspectChunk(chunk, "stderr"));
    const nativeLogPoll = setInterval(() => {
      fs.readFile(nativeLogPath, "utf8")
        .then((log) => {
          if (log) inspectChunk(Buffer.from(log.slice(-32000)), "stderr");
        })
        .catch(() => undefined);
    }, 100);

    let exitCode: number | null = null;
    let childError: unknown = null;
    let cancelCheck: NodeJS.Timeout | null = null;
    try {
      const childClosePromise = new Promise<number | null>(
        (resolve, reject) => {
          child.once("error", (error) => {
            if (cancelledWhileWaiting || this.appShuttingDownRef.current)
              resolve(null);
            else reject(error);
          });
          child.once("close", resolve);
        },
      );
      cancelCheck = setInterval(() => {
        if (!exportId || !this.cancelledVideoRenders.has(exportId)) return;
        stopChild();
        if (cancelCheck) clearInterval(cancelCheck);
        cancelCheck = null;
      }, 50);
      exitCode = await childClosePromise;
    } catch (error) {
      childError = error;
    } finally {
      unregisterCancel();
      this.activeSupervisedRenderStops.delete(stopChild);
      if (cancelCheck) clearInterval(cancelCheck);
      if (nativeLogPoll) clearInterval(nativeLogPoll);
      if (childStopForceTimer) clearTimeout(childStopForceTimer);
    }
    const nativeLog = await this.readExportNativeLog(nativeLogPath);
    if (nativeLog) inspectNativeWarningText(nativeLog, "stderr");
    await fs.rm(payloadPath, { force: true }).catch(() => undefined);
    await fs.rm(nativeLogPath, { force: true }).catch(() => undefined);
    if (childError) throw childError;
    if (cancelledWhileWaiting || childStopReason === "cancel")
      throw new Error("Video export cancelled.");
    this.throwIfVideoRenderCancelled(exportId);
    const frameCount = await this.countContiguousSupervisedFrameFiles(
      outputPath,
      frameRange,
      _exportWidth * _exportHeight * 4,
    );
    const expectedFrameCount = frameRange.endFrame - frameRange.startFrame;
    if (frameCount === expectedFrameCount)
      return { outputPath, nativeWarningDetected, nativeWarningCount };
    if (exitCode !== 0)
      throw new Error(
        `Supervised export child failed with code ${exitCode ?? "unknown"} after ${frameCount}/${expectedFrameCount} frame(s): ${summarizeChildRenderOutput(stderr || stdout || nativeLog)}`,
      );
    const detail = summarizeChildRenderOutput(stderr || stdout || nativeLog);
    const stat = await fs.stat(outputPath).catch(() => null);
    if (!stat)
      throw new Error(
        `Supervised export child produced ${frameCount}/${expectedFrameCount} frame file(s).${detail ? ` Child output: ${detail}` : ""}`,
      );
    const expectedBytes = expectedFrameCount * _exportWidth * _exportHeight * 4;
    if (stat.size !== expectedBytes)
      throw new Error(
        `Supervised export child created ${stat.size} bytes; expected ${expectedBytes}.`,
      );
    return { outputPath, nativeWarningDetected, nativeWarningCount };
  }

  private async readExportNativeLog(logPath: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 25));
    try {
      const log = await fs.readFile(logPath, "utf8");
      return log.length > 32000 ? log.slice(-32000) : log;
    } catch {
      return "";
    }
  }

  private getExportFrameProgressIndexes(message: string): number[] {
    const frameIndexes: number[] = [];
    const pattern = /\[clipper export-frame\] frame=(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message))) {
      const frameIndex = Number.parseInt(match[1], 10) - 1;
      if (Number.isFinite(frameIndex) && frameIndex >= 0)
        frameIndexes.push(frameIndex);
    }
    return frameIndexes;
  }

  private getSupervisedFrameRangeOutputPath(tempDir: string): string {
    return path.join(tempDir, "renderer.bgra");
  }

  private getSupervisedFrameOutputPath(
    outputPath: string,
    frameIndex: number,
  ): string {
    return `${outputPath}.frame-${frameIndex}.bgra`;
  }

  private async countContiguousSupervisedFrameFiles(
    outputPath: string,
    frameRange: ExportFrameRange,
    expectedFrameByteLength?: number,
  ): Promise<number> {
    const expectedLength =
      expectedFrameByteLength ?? FRAME_WIDTH * FRAME_HEIGHT * 4;
    let count = 0;
    for (
      let frameIndex = frameRange.startFrame;
      frameIndex < frameRange.endFrame;
      frameIndex += 1
    ) {
      const stat = await fs
        .stat(this.getSupervisedFrameOutputPath(outputPath, frameIndex))
        .catch(() => null);
      if (!stat || stat.size !== expectedLength) break;
      count += 1;
    }
    return count;
  }

  private async removeSupervisedFrameOutputs(
    outputPath: string,
    frameRange: ExportFrameRange,
  ): Promise<void> {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    for (
      let frameIndex = frameRange.startFrame;
      frameIndex < frameRange.endFrame;
      frameIndex += 1
    ) {
      await fs
        .rm(this.getSupervisedFrameOutputPath(outputPath, frameIndex), {
          force: true,
        })
        .catch(() => undefined);
    }
  }

  // ── Prerender cache helpers ──────────────────────────────────────────

  private getPrerenderCacheKey(
    project: ProjectManifest,
    scene: Scene,
    frameRate: number,
    tileHeight?: number,
    blockDurationMs?: number,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): string {
    return JSON.stringify({
      projectId: project.id,
      scene,
      frameRate,
      tileHeight,
      blockDurationMs,
      previewFrameFormat: "opaque-fullframe-srgb-raw-bgra-v9",
      width,
      height,
    });
  }

  private getProjectCacheDirectory(manifestPath: string): string {
    const manifestFilePath = this.resolveClipperFile(manifestPath);
    const projectDirectory = path.dirname(manifestFilePath);
    return path.join(projectDirectory, ".cache", "prerender");
  }

  private safeCacheSegment(value: string): string {
    return (
      value
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "scene"
    );
  }

  private getPrerenderCachePaths(
    manifestPath: string,
    scene: Scene,
    frameRate: number,
    frameIndex: number,
  ): PrerenderCachePaths {
    const directory = path.join(
      this.getProjectCacheDirectory(manifestPath),
      this.safeCacheSegment(scene.id),
      `${frameRate}fps`,
    );
    const framePath = path.join(
      directory,
      `frame-${String(frameIndex).padStart(6, "0")}.bgra`,
    );
    return { directory, framePath, manifestPath: `${framePath}.json` };
  }

  private getPrerenderVideoBlockCachePaths(
    manifestPath: string,
    scene: Scene,
    frameRate: number,
    frameRange: ExportFrameRange,
  ): PrerenderVideoBlockCachePaths {
    const directory = path.join(
      this.getProjectCacheDirectory(manifestPath),
      this.safeCacheSegment(scene.id),
      `${frameRate}fps`,
      "video-blocks",
    );
    const blockName = `block-${String(frameRange.startFrame).padStart(6, "0")}-${String(frameRange.endFrame).padStart(6, "0")}`;
    const videoPath = path.join(directory, `${blockName}.mp4`);
    return { directory, videoPath, manifestPath: `${videoPath}.json` };
  }

  private getPrerenderBlockRange(
    frameIndex: number,
    sceneDuration: number,
    frameRate: number,
    blockDurationMs: number,
  ): ExportFrameRange {
    const framesPerBlock = Math.max(
      1,
      Math.round((blockDurationMs / 1000) * frameRate),
    );
    const totalFrames = Math.max(1, Math.ceil(sceneDuration * frameRate));
    const boundedFrameIndex = Math.min(
      Math.max(frameIndex, 0),
      totalFrames - 1,
    );
    const startFrame =
      Math.floor(boundedFrameIndex / framesPerBlock) * framesPerBlock;
    return {
      startFrame,
      endFrame: Math.min(startFrame + framesPerBlock, totalFrames),
    };
  }

  private getBoundedPrerenderFrameRange(
    frameRange: ExportFrameRange,
    sceneDuration: number,
    frameRate: number,
  ): ExportFrameRange {
    const totalFrames = Math.max(1, Math.ceil(sceneDuration * frameRate));
    const startFrame = Math.min(
      Math.max(Math.floor(frameRange.startFrame), 0),
      totalFrames - 1,
    );
    const endFrame = Math.min(
      Math.max(Math.ceil(frameRange.endFrame), startFrame + 1),
      totalFrames,
    );
    return { startFrame, endFrame };
  }

  private clampPrerenderBlockDurationMs(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_PRERENDER_BLOCK_DURATION_MS;
    return Math.min(
      Math.max(Math.round(value), MIN_PRERENDER_BLOCK_DURATION_MS),
      MAX_PRERENDER_BLOCK_DURATION_MS,
    );
  }

  private async readPrerenderBlock(
    manifestPath: string,
    scene: Scene,
    frameRate: number,
    frameRange: ExportFrameRange,
    cacheKey: string,
  ): Promise<PrerenderedFrame[]> {
    const frames: PrerenderedFrame[] = [];
    for (
      let frameIndex = frameRange.startFrame;
      frameIndex < frameRange.endFrame;
      frameIndex += 1
    ) {
      const sceneTime = frameIndex / frameRate;
      const frame = await this.readPrerenderFrame(
        this.getPrerenderCachePaths(manifestPath, scene, frameRate, frameIndex),
        cacheKey,
        sceneTime,
        frameRate,
      );
      if (!frame) break;
      frames.push(frame);
    }
    return frames;
  }

  private async readPrerenderFrame(
    cachePaths: PrerenderCachePaths,
    cacheKey: string,
    sceneTime: number,
    frameRate: number,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): Promise<PrerenderedFrame | null> {
    const frame = await this.readPrerenderFrameBufferFromPaths(
      cachePaths,
      cacheKey,
      sceneTime,
      frameRate,
      width,
      height,
    );
    if (!frame) return null;
    return {
      width,
      height,
      pixelFormat: "bgra",
      sceneTime,
      frameRate,
      data: new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength),
    };
  }

  private async readPrerenderFrameBufferFromPaths(
    cachePaths: PrerenderCachePaths,
    cacheKey: string,
    sceneTime: number,
    frameRate: number,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): Promise<Buffer | null> {
    const manifest = await this.readPrerenderManifest(cachePaths.manifestPath);
    if (
      !this.isPrerenderManifestCurrent(
        manifest,
        cacheKey,
        sceneTime,
        frameRate,
        width,
        height,
      )
    )
      return null;
    const frame = await fs.readFile(cachePaths.framePath).catch(() => null);
    if (!frame || frame.length !== width * height * 4) return null;
    return frame;
  }

  private async readPrerenderManifest(
    manifestPath: string,
  ): Promise<PrerenderCacheManifest> {
    try {
      return JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch {
      return null;
    }
  }

  private isPrerenderManifestCurrent(
    manifest: PrerenderCacheManifest,
    cacheKey: string,
    sceneTime: number,
    frameRate: number,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): boolean {
    return Boolean(
      manifest &&
      manifest.cacheKey === cacheKey &&
      manifest.width === width &&
      manifest.height === height &&
      manifest.frameRate === frameRate &&
      Math.abs(manifest.sceneTime - sceneTime) <= 1 / frameRate / 2,
    );
  }

  private async readPrerenderVideoBlock(
    manifestPath: string,
    scene: Scene,
    frameRate: number,
    frameRange: ExportFrameRange,
    cacheKey: string,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): Promise<PrerenderedVideoBlock | null> {
    const cachePaths = this.getPrerenderVideoBlockCachePaths(
      manifestPath,
      scene,
      frameRate,
      frameRange,
    );
    const manifest = await this.readPrerenderVideoManifest(
      cachePaths.manifestPath,
    );
    if (
      !this.isPrerenderVideoManifestCurrent(
        manifest,
        cacheKey,
        frameRange,
        frameRate,
        width,
        height,
      )
    )
      return null;
    const video = await fs.readFile(cachePaths.videoPath).catch(() => null);
    if (!video || video.length === 0) return null;
    return {
      width,
      height,
      mimeType: PRERENDER_VIDEO_BLOCK_MIME_TYPE,
      startTime: frameRange.startFrame / frameRate,
      duration: (frameRange.endFrame - frameRange.startFrame) / frameRate,
      startFrame: frameRange.startFrame,
      endFrame: frameRange.endFrame,
      frameRate,
      data: video.toString("base64"),
    };
  }

  private async readPrerenderVideoManifest(
    manifestPath: string,
  ): Promise<PrerenderVideoCacheManifest> {
    try {
      return JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch {
      return null;
    }
  }

  private isPrerenderVideoManifestCurrent(
    manifest: PrerenderVideoCacheManifest,
    cacheKey: string,
    frameRange: ExportFrameRange,
    frameRate: number,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): boolean {
    return Boolean(
      manifest &&
      manifest.cacheKey === cacheKey &&
      manifest.width === width &&
      manifest.height === height &&
      manifest.mimeType === PRERENDER_VIDEO_BLOCK_MIME_TYPE &&
      manifest.codecVersion === PRERENDER_VIDEO_BLOCK_CODEC_VERSION &&
      manifest.frameRate === frameRate &&
      manifest.startFrame === frameRange.startFrame &&
      manifest.endFrame === frameRange.endFrame,
    );
  }

  private async writePrerenderFrame(
    cachePaths: PrerenderCachePaths,
    frame: Buffer,
    cacheKey: string,
    sceneTime: number,
    frameRate: number,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): Promise<void> {
    await fs.mkdir(cachePaths.directory, { recursive: true });
    const tempFramePath = `${cachePaths.framePath}.tmp-${process.pid}`;
    const tempManifestPath = `${cachePaths.manifestPath}.tmp-${process.pid}`;
    const manifest = {
      cacheKey,
      width,
      height,
      pixelFormat: "bgra" as const,
      sceneTime,
      frameRate,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(tempFramePath, frame);
    await fs.writeFile(
      tempManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(tempFramePath, cachePaths.framePath);
    await fs.rename(tempManifestPath, cachePaths.manifestPath);
  }

  private async writePrerenderVideoBlock(
    cachePaths: PrerenderVideoBlockCachePaths,
    tempVideoPath: string,
    cacheKey: string,
    frameRange: ExportFrameRange,
    frameRate: number,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): Promise<void> {
    await fs.mkdir(cachePaths.directory, { recursive: true });
    const tempCacheVideoPath = `${cachePaths.videoPath}.tmp-${process.pid}`;
    const tempManifestPath = `${cachePaths.manifestPath}.tmp-${process.pid}`;
    const manifest = {
      cacheKey,
      width,
      height,
      mimeType: PRERENDER_VIDEO_BLOCK_MIME_TYPE,
      codecVersion: PRERENDER_VIDEO_BLOCK_CODEC_VERSION,
      startFrame: frameRange.startFrame,
      endFrame: frameRange.endFrame,
      frameRate,
      updatedAt: new Date().toISOString(),
    };
    await fs.copyFile(tempVideoPath, tempCacheVideoPath);
    await fs.writeFile(
      tempManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(tempCacheVideoPath, cachePaths.videoPath);
    await fs.rename(tempManifestPath, cachePaths.manifestPath);
  }

  private async renderPrerenderVideoBlock(
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    durationSeconds: number,
    frameRate: number,
    tileHeight: number,
    frameRange: ExportFrameRange,
    cacheKey: string,
    logPrefix: string,
  ): Promise<void> {
    const tempDir = path.join(
      this.getProjectCacheDirectory(manifestPath),
      ".tmp",
      `prerender-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    try {
      const rendererResult = await this.renderSupervisedFrameRangeChild(
        project,
        manifestPath,
        scene,
        tempDir,
        frameRate,
        durationSeconds,
        frameRange.endFrame,
        tileHeight,
        "app-supervised",
        undefined,
        undefined,
        frameRange,
        "preview-cache",
      );
      const frameCount = await this.countContiguousSupervisedFrameFiles(
        rendererResult.outputPath,
        frameRange,
      );
      const expectedFrameCount = frameRange.endFrame - frameRange.startFrame;
      if (frameCount !== expectedFrameCount)
        throw new Error(
          `Prerender video cache block produced ${frameCount} frame(s); expected ${expectedFrameCount}.`,
        );
      const cachePaths = this.getPrerenderVideoBlockCachePaths(
        manifestPath,
        scene,
        frameRate,
        frameRange,
      );
      const tempVideoPath = path.join(tempDir, "block.mp4");
      await this.encodeFrameFilesToMp4(
        rendererResult.outputPath,
        tempVideoPath,
        frameRate,
        frameRange,
      );
      await this.writePrerenderVideoBlock(
        cachePaths,
        tempVideoPath,
        cacheKey,
        frameRange,
        frameRate,
      );
      await this.removeSupervisedFrameOutputs(
        rendererResult.outputPath,
        frameRange,
      ).catch(() => undefined);
      console.log(
        `${logPrefix} cached-video-block start=${frameRange.startFrame} end=${frameRange.endFrame}`,
      );
    } finally {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  private async encodeFrameFilesToMp4(
    inputFrameOutputPath: string,
    outputPath: string,
    frameRate: number,
    frameRange: ExportFrameRange,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): Promise<void> {
    if (!this.ffmpegPath)
      throw new Error("The bundled ffmpeg binary is unavailable.");
    const ffmpeg = spawn(this.ffmpegPath, [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "bgra",
      "-s",
      `${width}x${height}`,
      "-framerate",
      String(frameRate),
      "-i",
      "-",
      "-frames:v",
      String(frameRange.endFrame - frameRange.startFrame),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-vf",
      "scale=in_range=pc:out_range=pc:out_color_matrix=bt709,format=yuv420p",
      "-profile:v",
      "baseline",
      "-level",
      "4.0",
      "-color_range",
      "pc",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-g",
      String(frameRange.endFrame - frameRange.startFrame),
      "-keyint_min",
      String(frameRange.endFrame - frameRange.startFrame),
      "-sc_threshold",
      "0",
      "-movflags",
      "+frag_keyframe+empty_moov+default_base_moof",
      "-avoid_negative_ts",
      "make_zero",
      outputPath,
    ]);
    this.activePreviewVideoEncoders.add(ffmpeg);
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    const closePromise = new Promise<string | null>((resolve) => {
      ffmpeg.once("error", (spawnError) => resolve(spawnError.message));
      ffmpeg.once("close", (code) =>
        resolve(
          code === 0
            ? null
            : stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
    try {
      for (
        let frameIndex = frameRange.startFrame;
        frameIndex < frameRange.endFrame;
        frameIndex += 1
      ) {
        const frameBuffer = await fs.readFile(
          this.getSupervisedFrameOutputPath(inputFrameOutputPath, frameIndex),
        );
        await this.writeProcessInput(ffmpeg, frameBuffer);
      }
      ffmpeg.stdin.end();
      const error = await closePromise;
      if (error) throw new Error(error);
    } catch (error) {
      if (!ffmpeg.killed) ffmpeg.kill("SIGTERM");
      await this.waitForProcessClose(
        closePromise,
        () => ffmpeg.kill("SIGKILL"),
        EXPORT_PROCESS_STOP_TIMEOUT_MS,
      );
      if (this.appShuttingDownRef.current) return;
      throw error;
    } finally {
      this.activePreviewVideoEncoders.delete(ffmpeg);
    }
  }

  private async renderPrerenderBlock(
    project: ProjectManifest,
    manifestPath: string,
    scene: Scene,
    durationSeconds: number,
    frameRate: number,
    tileHeight: number,
    frameRange: ExportFrameRange,
    cacheKey: string,
    logPrefix: string,
  ): Promise<void> {
    const tempDir = path.join(
      this.getProjectCacheDirectory(manifestPath),
      ".tmp",
      `prerender-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    try {
      const rendererResult = await this.renderSupervisedFrameRangeChild(
        project,
        manifestPath,
        scene,
        tempDir,
        frameRate,
        durationSeconds,
        frameRange.endFrame,
        tileHeight,
        "app-supervised",
        undefined,
        undefined,
        frameRange,
        "preview-cache",
      );
      const frameCount = await this.countContiguousSupervisedFrameFiles(
        rendererResult.outputPath,
        frameRange,
      );
      if (frameCount !== frameRange.endFrame - frameRange.startFrame)
        throw new Error(
          `Prerender cache block produced ${frameCount} frame(s); expected ${frameRange.endFrame - frameRange.startFrame}.`,
        );
      for (
        let frameIndex = frameRange.startFrame;
        frameIndex < frameRange.endFrame;
        frameIndex += 1
      ) {
        const frame = await fs.readFile(
          this.getSupervisedFrameOutputPath(
            rendererResult.outputPath,
            frameIndex,
          ),
        );
        await this.writePrerenderFrame(
          this.getPrerenderCachePaths(
            manifestPath,
            scene,
            frameRate,
            frameIndex,
          ),
          frame,
          cacheKey,
          frameIndex / frameRate,
          frameRate,
        );
      }
      await this.removeSupervisedFrameOutputs(
        rendererResult.outputPath,
        frameRange,
      ).catch(() => undefined);
      console.log(
        `${logPrefix} cached-block start=${frameRange.startFrame} end=${frameRange.endFrame}`,
      );
    } finally {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  private async writePrerenderFramesFromSupervisedOutput(
    manifestPath: string,
    project: ProjectManifest,
    scene: Scene,
    outputPath: string,
    frameRate: number,
    frameRange: ExportFrameRange,
    tileHeight: number,
    blockDurationMs: number,
    width: number = FRAME_WIDTH,
    height: number = FRAME_HEIGHT,
  ): Promise<void> {
    const cacheKey = this.getPrerenderCacheKey(
      project,
      scene,
      frameRate,
      tileHeight,
      blockDurationMs,
      width,
      height,
    );
    for (
      let frameIndex = frameRange.startFrame;
      frameIndex < frameRange.endFrame;
      frameIndex += 1
    ) {
      const frame = await fs.readFile(
        this.getSupervisedFrameOutputPath(outputPath, frameIndex),
      );
      await this.writePrerenderFrame(
        this.getPrerenderCachePaths(manifestPath, scene, frameRate, frameIndex),
        frame,
        cacheKey,
        frameIndex / frameRate,
        frameRate,
        width,
        height,
      );
    }
  }
}

export function summarizeChildRenderOutput(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const diagnosticLines = lines.filter((line) =>
    line.includes("CLIPPER_EXPORT_DIAGNOSTIC"),
  );
  const nonWarningLines = lines.filter(
    (line) =>
      !isExportOutOfMemoryWarning(line) &&
      !isNoisyChildRenderLogLine(line) &&
      !line.includes("CLIPPER_EXPORT_DIAGNOSTIC"),
  );
  const warningCount =
    lines.length - diagnosticLines.length - nonWarningLines.length;
  const summaryLines = [
    ...diagnosticLines.slice(-4),
    ...nonWarningLines.slice(-6),
  ];
  if (warningCount > 0)
    summaryLines.unshift(
      `${warningCount} native tile-memory warning(s) omitted.`,
    );
  return summaryLines.join("\n").slice(-4000).trim();
}

function isNoisyChildRenderLogLine(line: string): boolean {
  return /Download the React DevTools|Electron Security Warning|Insecure Content-Security-Policy|node_modules\/\.vite\/deps\/react-dom/i.test(
    line,
  );
}
