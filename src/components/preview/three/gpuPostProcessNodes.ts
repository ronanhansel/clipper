import {
  abs,
  clamp,
  convertToTexture,
  float,
  floor,
  Fn,
  fract,
  length,
  max,
  min,
  mix,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  filmBurnTransitionPostProcessKind,
  type FilmBurnTransitionPostProcessPass,
} from "../../../core/effects/postprocess/filmBurnTransition";
import {
  lensPostProcessKind,
  type LensPostProcessPass,
} from "../../../core/effects/postprocess/lens";
import {
  lightLeakBandsTransitionPostProcessKind,
  type LightLeakBandsTransitionPostProcessPass,
} from "../../../core/effects/postprocess/lightLeakBandsTransition";
import {
  vhsTrackingPostProcessKind,
  type VhsTrackingPostProcessPass,
} from "../../../core/effects/postprocess/vhsTracking";
import type { PostProcessPass } from "../../../core/effects/types";
import { createCameraLensNode } from "./cameraComposerPasses";

export function createGpuPostProcessNode(
  sourceNode: unknown,
  pass: PostProcessPass,
  frameSize: { width: number; height: number },
) {
  switch (pass.kind) {
    case lensPostProcessKind:
      return createCameraLensNode(
        sourceNode,
        pass as LensPostProcessPass,
        frameSize,
      );
    case vhsTrackingPostProcessKind:
      return createVhsTrackingNode(
        sourceNode,
        pass as VhsTrackingPostProcessPass,
        frameSize,
      );
    case filmBurnTransitionPostProcessKind:
      return createFilmBurnTransitionNode(
        sourceNode,
        pass as FilmBurnTransitionPostProcessPass,
        frameSize,
      );
    case lightLeakBandsTransitionPostProcessKind:
      return createLightLeakBandsTransitionNode(
        sourceNode,
        pass as LightLeakBandsTransitionPostProcessPass,
        frameSize,
      );
    default:
      throw new Error(`Unsupported GPU post-process pass: ${pass.kind}`);
  }
}

export function getGpuPostProcessPassSignature(
  passes: readonly PostProcessPass[],
) {
  return JSON.stringify(
    passes.map((pass) => ({
      id: pass.id,
      kind: pass.kind,
      uniforms: getStablePostProcessUniformSignature(pass),
    })),
  );
}

export function applyGpuPostProcessUniforms(
  targetPasses: readonly PostProcessPass[],
  sourcePasses: readonly PostProcessPass[],
) {
  for (const pass of targetPasses) {
    const sourcePass = findPostProcessPassById(sourcePasses, pass.id);
    if (!sourcePass) continue;
    const nodes = (pass as PostProcessPass & { gpuUniformNodes?: unknown })
      .gpuUniformNodes;
    if (!nodes || typeof nodes !== "object") continue;
    if (
      pass.kind === vhsTrackingPostProcessKind &&
      sourcePass.kind === vhsTrackingPostProcessKind &&
      "time" in nodes
    ) {
      (nodes as { time: { value: number } }).time.value = (
        sourcePass as VhsTrackingPostProcessPass
      ).uniforms.time;
    } else if (
      pass.kind === filmBurnTransitionPostProcessKind &&
      sourcePass.kind === filmBurnTransitionPostProcessKind &&
      "progress" in nodes
    ) {
      (nodes as { progress: { value: number } }).progress.value = (
        sourcePass as FilmBurnTransitionPostProcessPass
      ).uniforms.progress;
    } else if (
      pass.kind === lightLeakBandsTransitionPostProcessKind &&
      sourcePass.kind === lightLeakBandsTransitionPostProcessKind &&
      "progress" in nodes
    ) {
      (nodes as { progress: { value: number } }).progress.value = (
        sourcePass as LightLeakBandsTransitionPostProcessPass
      ).uniforms.progress;
    }
  }
}

function findPostProcessPassById(
  passes: readonly PostProcessPass[],
  id: string,
) {
  for (const pass of passes) {
    if (pass.id === id) return pass;
  }
  return null;
}

function getStablePostProcessUniformSignature(pass: PostProcessPass) {
  if (pass.kind === vhsTrackingPostProcessKind) {
    const { time: _time, ...stableUniforms } = (
      pass as VhsTrackingPostProcessPass
    ).uniforms;
    return stableUniforms;
  }
  if (pass.kind === filmBurnTransitionPostProcessKind) {
    const { progress: _progress, ...stableUniforms } = (
      pass as FilmBurnTransitionPostProcessPass
    ).uniforms;
    return stableUniforms;
  }
  if (pass.kind === lightLeakBandsTransitionPostProcessKind) {
    const { progress: _progress, ...stableUniforms } = (
      pass as LightLeakBandsTransitionPostProcessPass
    ).uniforms;
    return stableUniforms;
  }
  return pass.uniforms;
}

function createVhsTrackingNode(
  sourceNode: unknown,
  pass: VhsTrackingPostProcessPass,
  frameSize: { width: number; height: number },
) {
  const sourceTexture = convertToTexture(sourceNode);
  const u = pass.uniforms;
  const resolution = vec2(frameSize.width, frameSize.height);
  const time = uniform(u.time);
  (
    pass as VhsTrackingPostProcessPass & {
      gpuUniformNodes?: { time: { value: number } };
    }
  ).gpuUniformNodes = { time };
  const intensity = float(u.intensity);
  const speed = float(u.speed);
  const horizontalTear = float(u.horizontalTear);
  const verticalRoll = float(u.verticalRoll);
  const jitter = float(u.jitter);
  const bandSize = float(u.bandSize);
  const chromaShiftPixels = float(u.chromaShiftPixels);
  const scanlines = float(u.scanlines);
  const noiseAmount = float(u.noise);
  const dropout = float(u.dropout);
  const tapeStretch = float(u.tapeStretch);
  const seed = float(u.seed);

  return Fn(() => {
    const sourceUv = uv().toVar();
    const t = time.mul(max(speed, 0.0));
    const line = floor(sourceUv.y.mul(resolution.y));
    const frameTick = floor(t.mul(29.97));
    const perLine = hash2(vec2(line, frameTick), seed, 19.19).sub(0.5);
    const slowLine = noise1(line.mul(0.018).add(frameTick.mul(0.37)), seed).sub(
      0.5,
    );
    const bandCenter = fract(
      t.mul(0.18).add(noise1(frameTick.mul(0.13), seed)),
    );
    const bandWidth = max(bandSize, 0.001);
    const bandDistance = min(
      abs(sourceUv.y.sub(bandCenter)),
      float(1.0).sub(abs(sourceUv.y.sub(bandCenter))),
    );
    const band = float(1.0).sub(smoothstep(0.0, bandWidth, bandDistance));
    const headSwitch = float(1.0).sub(smoothstep(0.02, 0.12, sourceUv.y));
    const stretch = sourceUv.y
      .add(t.mul(0.13))
      .mul(22.0)
      .sin()
      .mul(tapeStretch)
      .mul(0.0025);
    const tear = slowLine
      .mul(0.012)
      .add(perLine.mul(0.003))
      .mul(horizontalTear)
      .add(
        band
          .mul(noise1(frameTick.mul(1.7), seed).sub(0.5))
          .mul(0.09)
          .mul(horizontalTear),
      )
      .add(
        headSwitch
          .mul(noise1(t.mul(7.0), seed).sub(0.5))
          .mul(0.04)
          .mul(horizontalTear),
      );
    sourceUv.x.addAssign(tear.add(stretch).mul(intensity));
    sourceUv.y.assign(
      fract(sourceUv.y.add(verticalRoll.mul(intensity).mul(0.035).mul(t))).add(
        noise1(frameTick.mul(0.9), seed)
          .sub(0.5)
          .mul(jitter)
          .mul(intensity)
          .mul(0.004),
      ),
    );

    const chroma = chromaShiftPixels
      .mul(float(0.45).add(band.mul(0.9)))
      .div(max(resolution.x, 1.0));
    const redUv = clamp(sourceUv.add(vec2(chroma, 0.0)), vec2(0), vec2(1));
    const greenUv = clamp(sourceUv, vec2(0), vec2(1));
    const blueUv = clamp(sourceUv.sub(vec2(chroma, 0.0)), vec2(0), vec2(1));
    const color = vec3(
      sourceTexture.sample(redUv).r,
      sourceTexture.sample(greenUv).g,
      sourceTexture.sample(blueUv).b,
    ).toVar();
    const luma = color.dot(vec3(0.299, 0.587, 0.114));
    color.assign(mix(color, vec3(luma), intensity.mul(0.18)));
    const scan = line.mul(3.14159265).sin().mul(0.5).add(0.5);
    color.mulAssign(float(1.0).sub(scan.mul(scanlines).mul(0.18)));
    color.addAssign(
      hash2(
        vec2(line, floor(sourceUv.x.mul(resolution.x)).add(frameTick)),
        seed,
        19.19,
      )
        .sub(0.5)
        .mul(noiseAmount)
        .mul(0.22),
    );
    const dropoutLine = step(
      float(1.0).sub(dropout.mul(0.018)),
      hash2(vec2(floor(line.mul(0.25)), frameTick.mul(0.31)), seed, 19.19),
    );
    const dropoutMask = dropoutLine.mul(
      smoothstep(
        0.18,
        0.98,
        hash2(vec2(sourceUv.x.mul(22.0), line.add(frameTick)), seed, 19.19),
      ),
    );
    color.assign(mix(color, vec3(0.92), dropoutMask.mul(dropout).mul(0.65)));
    color.addAssign(band.mul(vec3(0.08, 0.1, 0.14)).mul(intensity));
    color.mulAssign(
      float(0.96).add(noise1(frameTick.mul(0.41), seed).mul(0.05)),
    );
    return vec4(clamp(color, vec3(0), vec3(1)), 1.0);
  })();
}

function createFilmBurnTransitionNode(
  sourceNode: unknown,
  pass: FilmBurnTransitionPostProcessPass,
  frameSize: { width: number; height: number },
) {
  const sourceTexture = convertToTexture(sourceNode);
  const u = pass.uniforms;
  const resolution = vec2(frameSize.width, frameSize.height);
  const progress = uniform(u.progress);
  (
    pass as FilmBurnTransitionPostProcessPass & {
      gpuUniformNodes?: { progress: { value: number } };
    }
  ).gpuUniformNodes = { progress };
  const intensity = float(u.intensity);
  const softness = float(u.softness);
  const grainAmount = float(u.grain);
  const seed = float(u.seed);

  return Fn(() => {
    const sourceUv = uv();
    const source = sourceTexture.sample(sourceUv).rgb;
    const p = clamp(progress, 0.0, 1.0);
    const flameNoise = noise2(
      vec2(
        sourceUv.x.mul(2.2).add(p.mul(3.1)),
        sourceUv.y.mul(4.8).sub(p.mul(1.7)),
      ),
      seed,
      43.17,
      vec2(127.1, 311.7),
    );
    const verticalBias = sourceUv.x.add(flameNoise.sub(0.5).mul(softness));
    const bandWidth = float(0.5);
    const leadEdge = mix(
      softness.mul(-1.5),
      float(1.0).add(bandWidth).add(softness.mul(1.5)),
      p,
    );
    const trailEdge = leadEdge.sub(bandWidth);
    const burn = clamp(
      smoothstep(
        trailEdge.sub(softness),
        trailEdge.add(softness),
        verticalBias,
      ).sub(
        smoothstep(
          leadEdge.sub(softness),
          leadEdge.add(softness),
          verticalBias,
        ),
      ),
      0.0,
      1.0,
    );
    const hot = float(1.0).sub(
      smoothstep(0.0, softness.mul(0.5), abs(verticalBias.sub(leadEdge))),
    );
    const flicker = noise2(
      sourceUv
        .mul(resolution)
        .div(96.0)
        .add(vec2(p.mul(8.0), seed)),
      seed,
      43.17,
      vec2(127.1, 311.7),
    );
    const grain = hash2(sourceUv.mul(resolution).add(p.mul(97.0)), seed, 43.17)
      .sub(0.5)
      .mul(grainAmount);
    const amber = vec3(1.0, 0.47, 0.08);
    const yellow = vec3(1.0, 0.86, 0.33);
    const color = mix(source, amber, burn.mul(intensity).mul(0.68))
      .toVar()
      .assign(
        mix(
          mix(source, amber, burn.mul(intensity).mul(0.68)),
          yellow,
          hot.mul(intensity),
        ),
      );
    color.addAssign(
      vec3(grain.add(flicker.mul(0.08).mul(intensity))).mul(burn),
    );
    color.mulAssign(float(1.0).add(hot.mul(0.75).mul(intensity)));
    return vec4(clamp(color, vec3(0), vec3(1)), 1.0);
  })();
}

function createLightLeakBandsTransitionNode(
  sourceNode: unknown,
  pass: LightLeakBandsTransitionPostProcessPass,
  frameSize: { width: number; height: number },
) {
  void frameSize;
  const sourceTexture = convertToTexture(sourceNode);
  const u = pass.uniforms;
  const progress = uniform(u.progress);
  (
    pass as LightLeakBandsTransitionPostProcessPass & {
      gpuUniformNodes?: { progress: { value: number } };
    }
  ).gpuUniformNodes = { progress };
  const intensity = float(u.intensity);
  const softness = float(u.softness);
  const bandCount = float(u.bandCount);
  const drift = float(u.drift);
  const warmth = float(u.warmth);
  const flicker = float(u.flicker);
  const seed = float(u.seed);

  return Fn(() => {
    const sourceUv = uv();
    const source = sourceTexture.sample(sourceUv).rgb;
    const p = clamp(progress, 0.0, 1.0);
    const rise = smoothstep(0.06, 0.32, p);
    const fall = float(1.0).sub(smoothstep(0.58, 0.94, p));
    const env = rise.mul(fall);
    const sweepCenter = mix(
      -0.08,
      1.08,
      p.add(
        noise2(vec2(p.mul(4.0), seed), seed, 61.73, vec2(41.3, 289.1))
          .sub(0.5)
          .mul(0.08),
      ),
    );
    const sweepWidth = mix(0.04, 0.16, clamp(softness, 0.02, 1.0));
    const sweep = verticalStreak(
      sourceUv,
      sweepCenter,
      sweepWidth,
      sweepWidth.mul(2.4),
    );
    const streaks = scratchField(sourceUv, p, bandCount, drift, softness, seed);
    const gateFlicker = float(0.72).add(
      noise2(
        vec2(floor(p.mul(36.0)), seed.mul(2.7)),
        seed,
        61.73,
        vec2(41.3, 289.1),
      )
        .mul(flicker)
        .mul(1.4),
    );
    const microFlicker = float(0.92).add(
      noise2(
        vec2(sourceUv.y.mul(36.0), p.mul(22.0).add(seed)),
        seed,
        61.73,
        vec2(41.3, 289.1),
      )
        .sub(0.5)
        .mul(flicker),
    );
    const flash = sweep.mul(env).mul(gateFlicker);
    const scratches = streaks.mul(env).mul(microFlicker);
    const baseLeak = max(flash, scratches.mul(0.9)).mul(intensity);
    const warmMix = clamp(warmth, 0.0, 1.0);
    const coldMix = clamp(warmth.negate(), 0.0, 1.0);
    const amber = mix(vec3(1.0, 0.48, 0.08), vec3(1.0, 0.84, 0.42), warmMix);
    const red = mix(vec3(0.95, 0.28, 0.06), vec3(1.0, 0.58, 0.16), warmMix);
    const cold = mix(vec3(0.72, 0.95, 1.0), vec3(0.34, 0.54, 1.0), coldMix);
    const leakColor = mix(amber, cold, coldMix);
    const coreColor = mix(red, cold, coldMix.mul(0.72));
    const cyan = cold.mul(float(0.28).add(coldMix.mul(0.72)));
    const warmBody = flash.mul(
      float(0.7).add(
        noise2(
          vec2(sourceUv.y.mul(7.0), p.mul(13.0)),
          seed,
          61.73,
          vec2(41.3, 289.1),
        ).mul(0.3),
      ),
    );
    const redCore = scratches.mul(
      float(0.55).add(
        noise2(
          vec2(sourceUv.y.mul(29.0), p.mul(17.0)),
          seed,
          61.73,
          vec2(41.3, 289.1),
        ).mul(0.45),
      ),
    );
    const cyanEdge = streaks.mul(flash).mul(0.45);
    const color = source
      .add(leakColor.mul(warmBody))
      .add(coreColor.mul(redCore))
      .add(cyan.mul(cyanEdge));
    return vec4(
      clamp(mix(color, vec3(1.0), baseLeak.mul(0.22)), vec3(0), vec3(1)),
      1.0,
    );
  })();
}

function scratchField(
  sourceUv: ReturnType<typeof uv>,
  progress: ReturnType<typeof float>,
  bandCount: ReturnType<typeof float>,
  drift: ReturnType<typeof float>,
  softness: ReturnType<typeof float>,
  seed: ReturnType<typeof float>,
) {
  let result = float(0.0);
  const count = floor(max(bandCount, 1.0));
  for (let i = 0; i < 12; i += 1) {
    const fi = float(i);
    const active = step(fi.add(0.5), count);
    const base = hash2(vec2(fi.add(1.7), seed.mul(0.17)), seed, 61.73);
    const center = fract(
      base
        .add(progress.mul(float(0.12).add(drift.mul(0.08))))
        .add(fi.mul(0.07)),
    );
    const width = mix(
      0.0025,
      0.03,
      hash2(vec2(fi.add(3.1), seed.mul(0.31)), seed, 61.73).mul(softness),
    );
    const feather = width.mul(
      mix(1.8, 4.2, hash2(vec2(fi.add(5.9), seed.mul(0.27)), seed, 61.73)),
    );
    const streak = verticalStreak(sourceUv, center, width, feather);
    const coarseBreakup = noise2(
      vec2(fi.mul(7.1), sourceUv.y.mul(8.0).add(progress.mul(5.0))),
      seed,
      61.73,
      vec2(41.3, 289.1),
    );
    const fineBreakup = noise2(
      vec2(fi.mul(13.9).add(4.0), sourceUv.y.mul(31.0).add(progress.mul(17.0))),
      seed,
      61.73,
      vec2(41.3, 289.1),
    );
    result = result.add(
      streak
        .mul(mix(0.38, 1.0, coarseBreakup))
        .mul(mix(0.82, 1.18, fineBreakup))
        .mul(active),
    );
  }
  return clamp(result, 0.0, 1.0);
}

function verticalStreak(
  sourceUv: ReturnType<typeof uv>,
  center: ReturnType<typeof float>,
  width: ReturnType<typeof float>,
  feather: ReturnType<typeof float>,
) {
  return float(1.0).sub(
    smoothstep(width, width.add(feather), abs(sourceUv.x.sub(center))),
  );
}

function noise1(x: ReturnType<typeof float>, seed: ReturnType<typeof float>) {
  const i = floor(x);
  const f = fract(x);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(
    hash2(vec2(i, seed), seed, 19.19),
    hash2(vec2(i.add(1.0), seed), seed, 19.19),
    u,
  );
}

function noise2(
  p: ReturnType<typeof vec2>,
  seed: ReturnType<typeof float>,
  salt: number,
  basis: ReturnType<typeof vec2>,
) {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(vec2(3.0).sub(f.mul(2.0)));
  const a = hash2(i, seed, salt, basis);
  const b = hash2(i.add(vec2(1.0, 0.0)), seed, salt, basis);
  const c = hash2(i.add(vec2(0.0, 1.0)), seed, salt, basis);
  const d = hash2(i.add(vec2(1.0, 1.0)), seed, salt, basis);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

function hash2(
  p: ReturnType<typeof vec2>,
  seed: ReturnType<typeof float>,
  salt: number,
  basis = vec2(127.1, 311.7),
) {
  return fract(p.dot(basis).add(seed.mul(salt)).sin().mul(43758.5453123));
}
