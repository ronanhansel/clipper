import { describe, expect, it, vi } from "vitest";
import {
  removeStylePropertyIfPresent,
  setDomAttributeIfChanged,
  setStylePropertyIfChanged,
  setTextContentIfChanged,
  syncRenderClockLayersToSceneTime,
} from "./usePlaybackController";

describe("syncRenderClockLayersToSceneTime", () => {
  it("drives mounted render-clock layers from the master scene time", () => {
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn() };
    const attributes = new Map<string, string>();
    const styleValues = new Map<string, string>();
    const layer = {
      dataset: { clipperRenderClockOffset: "-2.5" },
      getAttribute: vi.fn((key: string) => attributes.get(key) ?? null),
      setAttribute: vi.fn((key: string, value: string) => {
        attributes.set(key, value);
      }),
      style: {
        getPropertyValue: vi.fn((key: string) => styleValues.get(key) ?? ""),
        setProperty: vi.fn((key: string, value: string) => {
          styleValues.set(key, value);
        }),
      },
      getAnimations: vi.fn(() => [animation]),
      querySelectorAll: vi.fn(() => []),
    };
    const root = {
      querySelectorAll: vi.fn((selector: string) =>
        selector === "[data-clipper-render-clock-layer]" ? [layer] : [],
      ),
    } as unknown as ParentNode;

    const count = syncRenderClockLayersToSceneTime(root, 8, true);

    expect(count).toBe(1);
    expect(layer.setAttribute).toHaveBeenCalledWith(
      "data-clipper-render-time",
      "5.500000",
    );
    expect(layer.style.setProperty).toHaveBeenCalledWith(
      "--clipper-render-time-ms",
      "5500ms",
    );
    expect(animation.currentTime).toBe(5500);
    expect(animation.pause).not.toHaveBeenCalled();
    expect(animation.play).toHaveBeenCalledOnce();
  });

  it("does not rescan DOM animations on every smooth playback frame", () => {
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn() };
    const attributes = new Map<string, string>();
    const styleValues = new Map<string, string>();
    const layer = {
      dataset: { clipperRenderClockOffset: "0" },
      getAttribute: vi.fn((key: string) => attributes.get(key) ?? null),
      setAttribute: vi.fn((key: string, value: string) => {
        attributes.set(key, value);
      }),
      style: {
        getPropertyValue: vi.fn((key: string) => styleValues.get(key) ?? ""),
        setProperty: vi.fn((key: string, value: string) => {
          styleValues.set(key, value);
        }),
      },
      getAnimations: vi.fn(() => [animation]),
      querySelectorAll: vi.fn(() => []),
    };
    const root = {
      querySelectorAll: vi.fn((selector: string) =>
        selector === "[data-clipper-render-clock-layer]" ? [layer] : [],
      ),
    } as unknown as ParentNode;

    syncRenderClockLayersToSceneTime(root, 1, true);
    syncRenderClockLayersToSceneTime(root, 1.001, true);

    expect(layer.getAnimations).toHaveBeenCalledOnce();
    expect(animation.play).toHaveBeenCalledOnce();
  });

  it("can skip animation pinning while still updating render-clock DOM", () => {
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn() };
    const attributes = new Map<string, string>();
    const styleValues = new Map<string, string>();
    const layer = {
      dataset: { clipperRenderClockOffset: "0" },
      getAttribute: vi.fn((key: string) => attributes.get(key) ?? null),
      setAttribute: vi.fn((key: string, value: string) => {
        attributes.set(key, value);
      }),
      style: {
        getPropertyValue: vi.fn((key: string) => styleValues.get(key) ?? ""),
        setProperty: vi.fn((key: string, value: string) => {
          styleValues.set(key, value);
        }),
      },
      getAnimations: vi.fn(() => [animation]),
      querySelectorAll: vi.fn(() => []),
    };
    const root = {
      querySelectorAll: vi.fn((selector: string) =>
        selector === "[data-clipper-render-clock-layer]" ? [layer] : [],
      ),
    } as unknown as ParentNode;

    const count = syncRenderClockLayersToSceneTime(root, 3, false, {
      syncAnimations: false,
    });

    expect(count).toBe(1);
    expect(layer.setAttribute).toHaveBeenCalledWith(
      "data-clipper-render-time",
      "3.000000",
    );
    expect(layer.style.setProperty).toHaveBeenCalledWith(
      "--clipper-render-time-ms",
      "3000ms",
    );
    expect(layer.getAnimations).not.toHaveBeenCalled();
    expect(animation.currentTime).toBe(0);
  });

  it("skips unchanged render-clock DOM attribute and style writes", () => {
    const animation = { currentTime: 0, play: vi.fn(), pause: vi.fn() };
    const attributes = new Map<string, string>();
    const styleValues = new Map<string, string>();
    const layer = {
      dataset: { clipperRenderClockOffset: "0" },
      getAttribute: vi.fn((key: string) => attributes.get(key) ?? null),
      setAttribute: vi.fn((key: string, value: string) => {
        attributes.set(key, value);
      }),
      style: {
        getPropertyValue: vi.fn((key: string) => styleValues.get(key) ?? ""),
        setProperty: vi.fn((key: string, value: string) => {
          styleValues.set(key, value);
        }),
      },
      getAnimations: vi.fn(() => [animation]),
      querySelectorAll: vi.fn(() => []),
    };
    const root = {
      querySelectorAll: vi.fn((selector: string) =>
        selector === "[data-clipper-render-clock-layer]" ? [layer] : [],
      ),
    } as unknown as ParentNode;

    syncRenderClockLayersToSceneTime(root, 2, false, { syncAnimations: false });
    const attributeWrites = layer.setAttribute.mock.calls.length;
    const styleWrites = layer.style.setProperty.mock.calls.length;
    syncRenderClockLayersToSceneTime(root, 2, false, { syncAnimations: false });

    expect(layer.setAttribute).toHaveBeenCalledTimes(attributeWrites);
    expect(layer.style.setProperty).toHaveBeenCalledTimes(styleWrites);
  });

  it("guards unchanged DOM writes", () => {
    const attributes = new Map([["role", "slider"]]);
    const element = {
      getAttribute: vi.fn((key: string) => attributes.get(key) ?? null),
      setAttribute: vi.fn((key: string, value: string) => {
        attributes.set(key, value);
      }),
    } as unknown as Element;
    const styleValues = new Map([["--x", "1"]]);
    const style = {
      getPropertyValue: vi.fn((key: string) => styleValues.get(key) ?? ""),
      setProperty: vi.fn((key: string, value: string) => {
        styleValues.set(key, value);
      }),
      removeProperty: vi.fn((key: string) => {
        const value = styleValues.get(key) ?? "";
        styleValues.delete(key);
        return value;
      }),
    } as unknown as CSSStyleDeclaration;
    const node = { textContent: "same" } as unknown as Node;

    expect(setDomAttributeIfChanged(element, "role", "slider")).toBe(false);
    expect(setDomAttributeIfChanged(element, "role", "button")).toBe(true);
    expect(setStylePropertyIfChanged(style, "--x", "1")).toBe(false);
    expect(setStylePropertyIfChanged(style, "--x", "2")).toBe(true);
    expect(removeStylePropertyIfPresent(style, "--missing")).toBe(false);
    expect(removeStylePropertyIfPresent(style, "--x")).toBe(true);
    expect(setTextContentIfChanged(node, "same")).toBe(false);
    expect(setTextContentIfChanged(node, "next")).toBe(true);
    expect(element.setAttribute).toHaveBeenCalledOnce();
    expect(style.setProperty).toHaveBeenCalledOnce();
    expect(style.removeProperty).toHaveBeenCalledOnce();
    expect(node.textContent).toBe("next");
  });
});
