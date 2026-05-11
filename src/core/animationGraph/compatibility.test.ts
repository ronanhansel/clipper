import { describe, expect, it } from "vitest";
import {
  canConnectTypedAnimationGraphNodes,
  getTypedAnimationGraphConnectionError,
} from "./compatibility";
import { createTypedAnimationGraphNode } from "./nodeRegistry";

describe("canConnectComposition2dTypedSockets", () => {
  it("accepts source structure into time structure input", () => {
    const source = createTypedAnimationGraphNode("layer:text", "source", {
      x: 0,
      y: 0,
    });
    const time = createTypedAnimationGraphNode("time:text:0", "time", {
      x: 1,
      y: 0,
    });

    expect(canConnectTypedAnimationGraphNodes(source, time)).toBe(true);
  });

  it("rejects source structure into condition controller input", () => {
    const source = createTypedAnimationGraphNode("layer:text", "source", {
      x: 0,
      y: 0,
    });
    const condition = createTypedAnimationGraphNode(
      "custom:condition",
      "condition",
      { x: 1, y: 0 },
    );

    expect(canConnectTypedAnimationGraphNodes(source, condition)).toBe(false);
    expect(getTypedAnimationGraphConnectionError(source, condition)).toBe(
      "Cannot connect Object to Condition.",
    );
  });

  it("accepts source text object into time structure input", () => {
    const source = createTypedAnimationGraphNode("layer:text", "source", {
      x: 0,
      y: 0,
    });
    source.outputs = source.outputs.map((socket) =>
      socket.id === "structure"
        ? { ...socket, type: "Structure.TextObject" }
        : socket,
    );
    const time = createTypedAnimationGraphNode("time:text:0", "time", {
      x: 1,
      y: 0,
    });

    expect(canConnectTypedAnimationGraphNodes(source, time)).toBe(true);
    expect(getTypedAnimationGraphConnectionError(source, time)).toBeNull();
  });

  it("uses explicit condition output sockets", () => {
    const condition = createTypedAnimationGraphNode(
      "custom:condition",
      "condition",
      { x: 0, y: 0 },
    );
    const animation = createTypedAnimationGraphNode(
      "animation:text:opacity",
      "effect",
      { x: 1, y: 0 },
    );

    expect(
      canConnectTypedAnimationGraphNodes(
        condition,
        animation,
        "output:2",
        "controller",
      ),
    ).toBe(true);
  });
});
