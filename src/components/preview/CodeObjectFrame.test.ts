import { describe, expect, it, beforeEach } from "vitest";
import {
  clearCodeObjectError,
  getCodeObjectError,
  setCodeObjectError,
} from "../../render-engine/codeObjectRuntime";
import {
  shouldUseExternalClockForCodeObject,
  shouldUsePlayheadClockForCodeObject,
} from "./CodeObjectFrame";

describe("CodeObjectFrame error boundary contract", () => {
  beforeEach(() => {
    clearCodeObjectError("frame-a");
    clearCodeObjectError("frame-b");
  });

  it("isolates errors per object id", () => {
    setCodeObjectError("frame-a", { message: "render failed" });
    expect(getCodeObjectError("frame-a")).toMatchObject({
      message: "render failed",
    });
    expect(getCodeObjectError("frame-b")).toBeNull();
  });

  it("stack is preserved when supplied", () => {
    const error = new Error("render failed");
    setCodeObjectError("frame-a", {
      message: error.message,
      stack: error.stack,
    });
    const stored = getCodeObjectError("frame-a");
    expect(stored?.message).toBe("render failed");
    expect(stored?.stack).toContain("Error: render failed");
  });
});

describe("CodeObjectFrame time ownership", () => {
  it("uses the global playhead clock only when no parent time is supplied", () => {
    expect(shouldUsePlayheadClockForCodeObject(true, undefined)).toBe(true);
    expect(shouldUseExternalClockForCodeObject(true, undefined)).toBe(false);
  });

  it("uses the parent time clock when a parent time is supplied", () => {
    expect(shouldUsePlayheadClockForCodeObject(true, 1.25)).toBe(false);
    expect(shouldUseExternalClockForCodeObject(true, 1.25)).toBe(true);
  });

  it("can disable live clocks for Direct GPU source DOM", () => {
    expect(shouldUsePlayheadClockForCodeObject(false, 1.25)).toBe(false);
    expect(shouldUseExternalClockForCodeObject(false, 1.25)).toBe(false);
  });
});
