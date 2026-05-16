import { describe, expect, it, beforeEach } from "vitest";
import {
  clearCodeObjectError,
  getCodeObjectError,
  loadCodeComponent,
  setCodeObjectError,
  subscribeCodeObjectErrors,
} from "./codeObjectRuntime";

describe("codeObjectRuntime", () => {
  beforeEach(() => {
    clearCodeObjectError("a");
    clearCodeObjectError("b");
  });

  it("returns a placeholder component for any source path", () => {
    const component = loadCodeComponent("paper/main.tsx");
    expect(component).not.toBeNull();
    const node = component?.({
      time: 0,
      props: {},
      size: { width: 1, height: 1 },
    });
    expect(node).toBeTruthy();
  });

  it("returns a placeholder component when source is null", () => {
    const component = loadCodeComponent(null);
    expect(component).not.toBeNull();
  });

  it("stores and clears errors per object id", () => {
    setCodeObjectError("a", { message: "boom" });
    expect(getCodeObjectError("a")).toEqual({ message: "boom" });
    expect(getCodeObjectError("b")).toBeNull();

    clearCodeObjectError("a");
    expect(getCodeObjectError("a")).toBeNull();
  });

  it("notifies subscribers on set and clear", () => {
    let calls = 0;
    const unsubscribe = subscribeCodeObjectErrors(() => {
      calls += 1;
    });

    setCodeObjectError("a", { message: "boom" });
    expect(calls).toBe(1);

    clearCodeObjectError("a");
    expect(calls).toBe(2);

    unsubscribe();
    setCodeObjectError("a", { message: "again" });
    expect(calls).toBe(2);
  });

  it("does not notify on clear when nothing is stored", () => {
    let calls = 0;
    const unsubscribe = subscribeCodeObjectErrors(() => {
      calls += 1;
    });

    clearCodeObjectError("never-set");
    expect(calls).toBe(0);

    unsubscribe();
  });
});
