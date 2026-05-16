import { describe, expect, it, beforeEach } from "vitest";
import {
  clearCodeObjectError,
  getCodeObjectError,
  setCodeObjectError,
} from "../../render-engine/codeObjectRuntime";

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
