import { describe, expect, it } from "vitest";
import { buildNativeH264StreamExportArgs } from "../../electron/nativeVideoExport";

describe("native H.264 stream export args", () => {
  it("stream-copies Annex B H.264 into MP4", () => {
    expect(buildNativeH264StreamExportArgs({ frameRate: 30, outputPath: "/tmp/out.mp4" })).toEqual([
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-f", "h264",
      "-r", "30",
      "-i", "pipe:0",
      "-an",
      "-c:v", "copy",
      "-movflags", "+faststart",
      "/tmp/out.mp4",
    ]);
  });
});
