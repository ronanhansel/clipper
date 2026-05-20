import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { SceneComposer, type ComposerPass } from "./sceneComposer";

function makeFakeRenderer() {
  return {
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
  };
}

function makeNoopPass(id: string) {
  const render = vi.fn();
  const dispose = vi.fn();
  const pass: ComposerPass = { id, render, dispose };
  return Object.assign(pass, { render, dispose });
}

describe("SceneComposer", () => {
  it("creates a primary RT with a DepthTexture matching its size", () => {
    const composer = new SceneComposer({ width: 10, height: 10 });
    expect(composer.primaryRenderTarget.width).toBe(10);
    expect(composer.primaryRenderTarget.height).toBe(10);
    expect(composer.primaryRenderTarget.depthTexture).toBeInstanceOf(
      THREE.DepthTexture,
    );
    expect(composer.secondaryRenderTarget.width).toBe(10);
    expect(composer.secondaryRenderTarget.height).toBe(10);
    composer.dispose();
  });

  it("setSize resizes both RTs", () => {
    const composer = new SceneComposer({ width: 10, height: 10 });
    composer.setSize(20, 30);
    expect(composer.primaryRenderTarget.width).toBe(20);
    expect(composer.primaryRenderTarget.height).toBe(30);
    expect(composer.secondaryRenderTarget.width).toBe(20);
    expect(composer.secondaryRenderTarget.height).toBe(30);
    composer.dispose();
  });

  it("with no passes: renders scene into primary RT, then blits, then restores default FB", () => {
    const composer = new SceneComposer({ width: 4, height: 4 });
    const renderer = makeFakeRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    composer.render(renderer, scene, camera);

    // First setRenderTarget call must target the primary RT.
    expect(renderer.setRenderTarget.mock.calls[0][0]).toBe(
      composer.primaryRenderTarget,
    );
    // clear must be called between setRenderTarget and the scene render.
    expect(renderer.clear).toHaveBeenCalledTimes(1);
    // First render call is the user scene; second is the BlitPass scene.
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render.mock.calls[0][0]).toBe(scene);
    expect(renderer.render.mock.calls[0][1]).toBe(camera);
    // Final setRenderTarget call must restore the default framebuffer.
    const lastSet =
      renderer.setRenderTarget.mock.calls[
        renderer.setRenderTarget.mock.calls.length - 1
      ];
    expect(lastSet[0]).toBeNull();
    composer.dispose();
  });

  it("with one custom pass: pass receives primary texture/depth and writes to default FB", () => {
    const composer = new SceneComposer({ width: 4, height: 4 });
    const renderer = makeFakeRenderer();
    const pass = makeNoopPass("only");
    composer.setPasses([pass]);

    composer.render(renderer, new THREE.Scene(), new THREE.PerspectiveCamera());

    expect(pass.render).toHaveBeenCalledTimes(1);
    const input = pass.render.mock.calls[0][0];
    expect(input.inputColor).toBe(composer.primaryRenderTarget.texture);
    expect(input.inputDepth).toBe(composer.primaryRenderTarget.depthTexture);
    expect(input.output).toBeNull();
    expect(input.width).toBe(4);
    expect(input.height).toBe(4);
    composer.dispose();
  });

  it("with two custom passes: ping-pongs through secondary, last pass writes to default FB", () => {
    const composer = new SceneComposer({ width: 4, height: 4 });
    const renderer = makeFakeRenderer();
    const passA = makeNoopPass("a");
    const passB = makeNoopPass("b");
    composer.setPasses([passA, passB]);

    composer.render(renderer, new THREE.Scene(), new THREE.PerspectiveCamera());

    const inputA = passA.render.mock.calls[0][0];
    const inputB = passB.render.mock.calls[0][0];

    expect(inputA.inputColor).toBe(composer.primaryRenderTarget.texture);
    expect(inputA.output).toBe(composer.secondaryRenderTarget);

    expect(inputB.inputColor).toBe(composer.secondaryRenderTarget.texture);
    expect(inputB.output).toBeNull();
    composer.dispose();
  });

  it("dispose disposes both RTs and is safe to call once", () => {
    const composer = new SceneComposer({ width: 4, height: 4 });
    const primarySpy = vi.spyOn(composer.primaryRenderTarget, "dispose");
    const secondarySpy = vi.spyOn(composer.secondaryRenderTarget, "dispose");
    composer.dispose();
    expect(primarySpy).toHaveBeenCalledTimes(1);
    expect(secondarySpy).toHaveBeenCalledTimes(1);
  });

  it("setPasses replaces the active list and getPasses reflects it", () => {
    const composer = new SceneComposer({ width: 4, height: 4 });
    const passA = makeNoopPass("a");
    const passB = makeNoopPass("b");
    composer.setPasses([passA, passB]);
    expect(composer.getPasses()).toEqual([passA, passB]);
    composer.setPasses([]);
    expect(composer.getPasses()).toEqual([]);
    composer.dispose();
  });
});
