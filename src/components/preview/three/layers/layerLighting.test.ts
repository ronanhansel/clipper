import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  applyLayerLightingUniforms,
  createLayerLightingUniforms,
  EMPTY_LAYER_LIGHTING,
  type LayerLightingState,
} from "./layerLighting";

describe("applyLayerLightingUniforms", () => {
  it("skips unchanged lighting writes", () => {
    const uniforms = createLayerLightingUniforms();
    const copy = vi.spyOn(uniforms.u_shadowMatrix.value, "copy");
    const material = { uniforms, userData: {} };

    applyLayerLightingUniforms(material, EMPTY_LAYER_LIGHTING);
    applyLayerLightingUniforms(material, EMPTY_LAYER_LIGHTING);

    expect(copy).toHaveBeenCalledOnce();
  });

  it("applies again when lighting changes", () => {
    const uniforms = createLayerLightingUniforms();
    const material = { uniforms, userData: {} };
    const lighting: LayerLightingState = {
      active: true,
      lights: [
        {
          kind: "ambient",
          color: "#ffffff",
          intensity: 0.5,
          position: { x: 0, y: 0, z: 0 },
          target: { x: 0, y: 0, z: 0 },
          range: 1200,
          angle: 45,
          softness: 0.25,
        },
      ],
      shadow: EMPTY_LAYER_LIGHTING.shadow,
    };

    applyLayerLightingUniforms(material, EMPTY_LAYER_LIGHTING);
    applyLayerLightingUniforms(material, lighting);

    expect(uniforms.u_lightingActive.value).toBe(1);
    expect(uniforms.u_lightCount.value).toBe(1);
    expect(uniforms.u_lightIntensity.value[0]).toBe(0.5);
  });

  it("applies again when shadow matrix changes", () => {
    const uniforms = createLayerLightingUniforms();
    const copy = vi.spyOn(uniforms.u_shadowMatrix.value, "copy");
    const material = { uniforms, userData: {} };
    const firstShadow = {
      ...EMPTY_LAYER_LIGHTING.shadow,
      active: true,
      texture: new THREE.Texture(),
      matrix: new THREE.Matrix4().makeTranslation(1, 0, 0),
      viewMatrix: new THREE.Matrix4(),
    };
    const secondShadow = {
      ...firstShadow,
      matrix: new THREE.Matrix4().makeTranslation(2, 0, 0),
    };

    applyLayerLightingUniforms(material, {
      active: false,
      lights: [],
      shadow: firstShadow,
    });
    applyLayerLightingUniforms(material, {
      active: false,
      lights: [],
      shadow: secondShadow,
    });

    expect(copy).toHaveBeenCalledTimes(2);
  });
});
