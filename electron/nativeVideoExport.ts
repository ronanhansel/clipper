import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type NativeVideoExportSession = {
  id: string;
  exportId: string;
  ownerWebContentsId: number;
  process: ChildProcessWithoutNullStreams;
  outputPath: string;
  stderr: string;
  terminating: boolean;
  writeSequence: Promise<void>;
  completionPromise: Promise<void>;
  maxQueuedWriteBytes: number;
};

export type NativeVideoExportStartOptions = {
  sessionId: string;
  exportId: string;
  ffmpegPath: string;
  ownerWebContentsId: number;
  outputPath: string;
  frameRate: number;
  maxQueuedWriteBytes?: number;
};

export const nativeVideoExportSessions = new Map<string, NativeVideoExportSession>();

export function buildNativeH264StreamExportArgs(config: { frameRate: number; outputPath: string }) {
  return [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-f", "h264",
    "-r", String(config.frameRate),
    "-i", "pipe:0",
    "-an",
    "-c:v", "copy",
    "-movflags", "+faststart",
    config.outputPath,
  ];
}

export async function startNativeH264StreamExportSession(options: NativeVideoExportStartOptions): Promise<NativeVideoExportSession> {
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  const ffmpeg = spawn(options.ffmpegPath, buildNativeH264StreamExportArgs({ frameRate: options.frameRate, outputPath: options.outputPath }));
  const session: NativeVideoExportSession = {
    id: options.sessionId,
    exportId: options.exportId,
    ownerWebContentsId: options.ownerWebContentsId,
    process: ffmpeg,
    outputPath: options.outputPath,
    stderr: "",
    terminating: false,
    writeSequence: Promise.resolve(),
    completionPromise: Promise.resolve(),
    maxQueuedWriteBytes: options.maxQueuedWriteBytes ?? 8 * 1024 * 1024,
  };

  session.completionPromise = new Promise<void>((resolve, reject) => {
    ffmpeg.once("error", (error) => {
      if (session.terminating) resolve();
      else reject(error);
    });
    ffmpeg.once("close", (code, signal) => {
      if (session.terminating) {
        resolve();
        return;
      }
      if (code === 0) resolve();
      else reject(new Error(session.stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}${signal ? ` (signal ${signal})` : ""}.`));
    });
  });
  session.completionPromise.catch(() => undefined);

  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    session.stderr += chunk.toString("utf8");
    if (session.stderr.length > 12000) session.stderr = session.stderr.slice(-12000);
  });

  nativeVideoExportSessions.set(session.id, session);
  return session;
}

export async function writeNativeVideoExportChunkById(sessionId: string, chunk: Uint8Array) {
  const session = nativeVideoExportSessions.get(sessionId);
  if (!session) throw new Error(`Native video export session not found: ${sessionId}`);
  await writeNativeVideoExportChunk(session, chunk);
}

export async function writeOwnedNativeVideoExportChunk(sessionId: string, ownerWebContentsId: number, chunk: Uint8Array) {
  const session = nativeVideoExportSessions.get(sessionId);
  if (!session) throw new Error(`Native video export session not found: ${sessionId}`);
  if (session.ownerWebContentsId !== ownerWebContentsId) throw new Error("Native video export write was rejected for unauthorized sender.");
  await writeNativeVideoExportChunk(session, chunk);
}

export function isNativeVideoExportOwner(sessionId: string, ownerWebContentsId: number, exportId?: string) {
  const session = nativeVideoExportSessions.get(sessionId);
  return Boolean(session && session.ownerWebContentsId === ownerWebContentsId && (!exportId || session.exportId === exportId));
}

export async function writeNativeVideoExportChunk(session: NativeVideoExportSession, chunk: Uint8Array) {
  const writePromise = session.writeSequence.then(async () => {
    if (session.terminating) throw new Error("Native video export session was cancelled.");
    const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    if (!session.process.stdin.write(buffer)) await waitForNativeVideoExportDrain(session);
    else if (session.process.stdin.writableLength >= session.maxQueuedWriteBytes) await waitForNativeVideoExportDrain(session);
  });
  session.writeSequence = writePromise.catch(() => undefined);
  await writePromise;
}

export async function finishNativeVideoExportSession(session: NativeVideoExportSession) {
  await session.writeSequence;
  if (!session.process.stdin.destroyed && !session.process.stdin.writableEnded) session.process.stdin.end();
  await session.completionPromise;
  nativeVideoExportSessions.delete(session.id);
}

export async function cancelNativeVideoExportSession(session: NativeVideoExportSession) {
  session.terminating = true;
  nativeVideoExportSessions.delete(session.id);
  try {
    if (!session.process.stdin.destroyed) session.process.stdin.destroy();
  } catch {
    // Stream may already be closed.
  }
  try {
    session.process.kill("SIGKILL");
  } catch {
    // Process may already be closed.
  }
  await session.completionPromise.catch(() => undefined);
  await fs.rm(session.outputPath, { force: true }).catch(() => undefined);
}

function waitForNativeVideoExportDrain(session: NativeVideoExportSession) {
  if (session.process.stdin.destroyed || session.process.stdin.writableEnded || !session.process.stdin.writable || session.process.stdin.writableLength <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for native video export backpressure to clear."));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timeout);
      session.process.stdin.off("drain", handleDrain);
      session.process.stdin.off("error", handleError);
      session.process.off("close", handleClose);
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
      reject(new Error(session.stderr.trim() || "Native video export process closed before draining."));
    };
    session.process.stdin.once("drain", handleDrain);
    session.process.stdin.once("error", handleError);
    session.process.once("close", handleClose);
  });
}
