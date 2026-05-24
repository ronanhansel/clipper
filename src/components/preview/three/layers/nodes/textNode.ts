import * as THREE from "three";
import { Text } from "troika-three-text";
import type { EvaluatedObjectState } from "../../../../../core/propertyRegistry";
import type { FrameObject } from "../../../../../core/types";
import { filePathToClipperMediaUrl } from "../../../../../core/mediaSource";
import type {
  LayerNode,
  LayerNodeContext,
  LayerNodeFactory,
} from "../layerNodeRegistry";
import { createPerElementCaptureFactory } from "./perElementCaptureNode";
import { resolveLayerTransform } from "../layerTransform";
import {
  applyLayerLightingUniforms,
  createLayerLightingUniforms,
  EMPTY_LAYER_LIGHTING,
  LAYER_LIGHTING_FRAGMENT,
  LAYER_LIGHTING_VERTEX_BODY,
  LAYER_LIGHTING_VERTEX_VARYINGS,
} from "../layerLighting";
import {
  parseCssColorToLinearRgba,
  type LinearRgba,
} from "../color/parseCssColor";

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;
const DEFAULT_LETTER_SPACING = 0;
const DEFAULT_LINE_HEIGHT = "normal";
const DEFAULT_TEXT_ALIGN = "left";
const DEFAULT_FONT_STYLE = "normal";
const FONT_SOURCE_EXTENSION_PATTERN = /\.(?:ttf|otf|woff2?)(?:[?#].*)?$/i;

class TextNode implements LayerNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly object3D: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly text: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  private readonly context: LayerNodeContext;
  private width = 0;
  private height = 0;

  constructor(id: string, context: LayerNodeContext) {
    this.context = context;
    const wrapper = new THREE.Group();
    wrapper.name = `TextNode:${id}`;
    this.object3D = wrapper;

    // troika-three-text exposes anchor controls that pin the text's
    // local origin. We want a CSS-style top-left layout box so the
    // FrameObject's bounds map cleanly onto the rendered glyphs — the
    // inner Text is then translated by `(-w/2, +h/2)` inside the
    // wrapper so the anchor lands at the layer's top-left in scene
    // space. resolveLayerTransform places the wrapper at the layer's
    // centre (rectNode parity).
    this.text = new Text();
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.installLightingShaderPatch(this.material);
    this.text.material = this.material;
    this.text.anchorX = "left";
    this.text.anchorY = "top";
    wrapper.add(this.text);
  }

  update(state: EvaluatedObjectState): void {
    const t = resolveLayerTransform(state);

    this.object3D.position.set(t.positionX, t.positionY, t.positionZ);
    this.object3D.rotation.order = "XYZ";
    this.object3D.rotation.x = t.rotationX;
    this.object3D.rotation.y = t.rotationY;
    this.object3D.rotation.z = t.rotationZ;
    this.object3D.scale.set(t.scaleX, t.scaleY, 1);

    if (t.width !== this.width || t.height !== this.height) {
      this.width = t.width;
      this.height = t.height;
    }

    // Compensate for wrapper-at-centre + anchor-at-top-left so the
    // glyphs render inside the layer's bounding box.
    this.text.position.set(-t.width / 2, t.height / 2, 0);

    this.text.text = resolveTextContent(state);
    this.text.fontSize = readNumber(state.style?.fontSize, DEFAULT_FONT_SIZE);
    this.text.fontWeight = state.style?.fontWeight ?? DEFAULT_FONT_WEIGHT;
    this.text.fontStyle =
      typeof state.style?.fontStyle === "string"
        ? state.style.fontStyle
        : DEFAULT_FONT_STYLE;
    this.text.letterSpacing = readNumber(
      state.style?.letterSpacing,
      DEFAULT_LETTER_SPACING,
    );
    this.text.lineHeight = state.style?.lineHeight ?? DEFAULT_LINE_HEIGHT;
    this.text.textAlign =
      typeof state.style?.textAlign === "string"
        ? state.style.textAlign
        : DEFAULT_TEXT_ALIGN;
    this.text.maxWidth = t.width;

    this.text.font = resolveTroikaFontSource(
      state.style?.fontSource ?? state.style?.fontFamily,
    );

    const opacity = clamp01(readNumber(state.style?.opacity, 1));
    const colour = resolveTextLinearRgba(state);
    if (colour) {
      // troika's `color` is a multiplier on the material; alpha is
      // applied via a separate path. We bake opacity into the colour
      // alpha by feeding opacity as the material opacity once the mesh
      // is synced (troika exposes `material` after the first sync).
      // The colour shortcut accepts a THREE.Color, hex int, or string;
      // we use a THREE.Color built from linear-light channels and let
      // the renderer handle the linear→sRGB write to match rectNode.
      this.text.color = new THREE.Color(colour.r, colour.g, colour.b);
    } else {
      this.text.color = new THREE.Color(1, 1, 1);
    }

    this.text.material = this.material;
    this.text.fillOpacity = opacity * (colour?.a ?? 1);
    applyLayerLightingUniforms(
      { uniforms: this.material.userData.layerLightingUniforms },
      this.context.getLighting?.() ?? EMPTY_LAYER_LIGHTING,
    );

    this.text.sync();
  }

  dispose(): void {
    this.text.dispose();
    this.material.dispose();
    this.object3D.remove(this.text);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private installLightingShaderPatch(material: any): void {
    material.userData.layerLightingUniforms = createLayerLightingUniforms();
    material.onBeforeCompile = (shader: {
      vertexShader: string;
      fragmentShader: string;
      uniforms: Record<string, unknown>;
    }) => {
      Object.assign(shader.uniforms, material.userData.layerLightingUniforms);
      material.userData.layerLightingUniforms = shader.uniforms;
      shader.vertexShader = shader.vertexShader
        .replace(
          "void main() {",
          `${LAYER_LIGHTING_VERTEX_VARYINGS}\nvoid main() {`,
        )
        .replace(
          "void main() {",
          `void main() {\n${LAYER_LIGHTING_VERTEX_BODY}`,
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        `${LAYER_LIGHTING_FRAGMENT}\nvoid main() {`,
      );
      if (shader.fragmentShader.includes("#include <dithering_fragment>")) {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          "gl_FragColor.rgb *= layerLightMultiplier();\n#include <dithering_fragment>",
        );
      } else {
        shader.fragmentShader = shader.fragmentShader.replace(
          /}\s*$/,
          "  gl_FragColor.rgb *= layerLightMultiplier();\n}",
        );
      }
    };
  }
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Pull the canonical text body from the evaluated state. `EvaluatedObjectState`
 * extends `FrameObject` so `content` is the inspector-authored body.
 * Template-driven content (`renderContent` from renderRuntime) lives one
 * layer up and never reaches `LayerNodeSync` today — captured as a
 * Phase C follow-up if templates need to drive native text.
 */
function resolveTextContent(state: EvaluatedObjectState): string {
  if (typeof state.content === "string") return state.content;
  return "";
}

function resolveTextLinearRgba(state: EvaluatedObjectState): LinearRgba | null {
  const colour = state.style?.color;
  if (typeof colour === "string") {
    const parsed = parseCssColorToLinearRgba(colour);
    if (parsed) return parsed;
  }
  return null;
}

function resolveTroikaFontSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const source = value.trim();
  if (!source) return null;
  if (source.startsWith("data:font/") || source.startsWith("blob:")) {
    return source;
  }
  if (source.startsWith("clipper-media:"))
    return FONT_SOURCE_EXTENSION_PATTERN.test(source) ? source : null;
  if (source.startsWith("file:")) return filePathToClipperMediaUrl(source);
  if (FONT_SOURCE_EXTENSION_PATTERN.test(source))
    return filePathToClipperMediaUrl(source);
  return null;
}

export const textNodeFactory: LayerNodeFactory = {
  kind: "text",
  create(object: FrameObject, context: LayerNodeContext) {
    if (context.materialBackend === "webgpu-node") {
      return createPerElementCaptureFactory("text").create(object, context);
    }
    return new TextNode(object.id, context);
  },
};
