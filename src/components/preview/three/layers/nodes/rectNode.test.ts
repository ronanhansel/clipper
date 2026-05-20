import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { rectNodeFactory } from "./rectNode";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";

function makeState(
  overrides: Partial<EvaluatedObjectState> = {},
): EvaluatedObjectState {
  return {
    id: "rect-1",
    name: "rect-1",
    type: "rect",
    selector: "[data-id='rect-1']",
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    style: { backgroundColor: "#ff0000", opacity: 1, borderRadius: 12 },
    transform: {},
    filter: {},
    shadow: {},
    stroke: {},
    props: {},
    ...overrides,
  } as unknown as EvaluatedObjectState;
}

describe("rectNodeFactory", () => {
  it("registers under kind 'rect'", () => {
    expect(rectNodeFactory.kind).toBe("rect");
  });

  it("creates a Mesh with PlaneGeometry + ShaderMaterial", () => {
    const node = rectNodeFactory.create({ id: "rect-1" } as FrameObject, {
      compositeTexture: null,
    });
    expect(node.object3D).toBeInstanceOf(THREE.Mesh);
    expect(node.object3D.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(node.object3D.material).toBeInstanceOf(THREE.ShaderMaterial);
    node.dispose();
  });

  it("update sets size, colour, radius, opacity uniforms", () => {
    const node = rectNodeFactory.create({ id: "rect-1" } as FrameObject, {
      compositeTexture: null,
    });
    node.update(makeState());
    const u = node.object3D.material.uniforms;
    expect(u.u_size.value.x).toBe(200);
    expect(u.u_size.value.y).toBe(100);
    expect(u.u_color.value.x).toBeCloseTo(1); // red in linear
    expect(u.u_color.value.w).toBe(1); // alpha
    expect(u.u_radius.value).toBe(12);
    expect(u.u_opacity.value).toBe(1);
    node.dispose();
  });

  it("falls back to transparent colour when backgroundColor is unparseable", () => {
    const node = rectNodeFactory.create({ id: "rect-1" } as FrameObject, {
      compositeTexture: null,
    });
    node.update(
      makeState({
        style: { backgroundColor: "linear-gradient(red, blue)" },
      }),
    );
    const u = node.object3D.material.uniforms;
    expect(u.u_color.value.w).toBe(0);
    node.dispose();
  });

  it("uses color when backgroundColor is absent", () => {
    const node = rectNodeFactory.create({ id: "rect-1" } as FrameObject, {
      compositeTexture: null,
    });
    node.update(
      makeState({
        style: { color: "#00ff00", opacity: 1 },
      }),
    );
    const u = node.object3D.material.uniforms;
    expect(u.u_color.value.y).toBeCloseTo(1);
    expect(u.u_color.value.w).toBe(1);
    node.dispose();
  });

  it("resizes geometry when bounds change", () => {
    const node = rectNodeFactory.create({ id: "rect-1" } as FrameObject, {
      compositeTexture: null,
    });
    node.update(makeState({ bounds: { x: 0, y: 0, width: 50, height: 50 } }));
    expect(node.object3D.geometry.parameters.width).toBe(50);
    node.update(makeState({ bounds: { x: 0, y: 0, width: 300, height: 80 } }));
    expect(node.object3D.geometry.parameters.width).toBe(300);
    expect(node.object3D.geometry.parameters.height).toBe(80);
    node.dispose();
  });
});
