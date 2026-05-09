import type { AdjustmentVisualOverlay } from "../../../effects/types";

type OverlayTarget = AdjustmentVisualOverlay["target"];

export type PracticalArtifactInput = {
  id: string;
  target: OverlayTarget;
  sceneTime: number;
  frameRate: number;
  seed: number;
  intensity: number;
  grain: number;
  grainSize: number;
  dust: number;
  scratches: number;
  halation: number;
  flicker: number;
  gateWeave: number;
  vignette: number;
  warmth: number;
  motionSpeed: number;
  grainSpeed: number;
  dustSpeed: number;
  scratchSpeed: number;
  flickerSpeed: number;
  weaveSpeed: number;
};

export function createPracticalArtifactOverlays(
  input: PracticalArtifactInput,
): AdjustmentVisualOverlay[] {
  const baseFrameIndex = getFrameIndex(
    input.sceneTime,
    input.frameRate,
    input.motionSpeed,
  );
  const grainFrameIndex = getFrameIndex(
    input.sceneTime,
    input.frameRate,
    input.motionSpeed * input.grainSpeed,
  );
  const dustFrameIndex = getFrameIndex(
    input.sceneTime,
    input.frameRate,
    input.motionSpeed * input.dustSpeed,
  );
  const scratchFrameIndex = getFrameIndex(
    input.sceneTime,
    input.frameRate,
    input.motionSpeed * input.scratchSpeed,
  );
  const flickerFrameIndex = getFrameIndex(
    input.sceneTime,
    input.frameRate,
    input.motionSpeed * input.flickerSpeed,
  );
  const weaveFrameIndex = getFrameIndex(
    input.sceneTime,
    input.frameRate,
    input.motionSpeed * input.weaveSpeed,
  );
  const seed = Math.trunc(input.seed);
  const flicker = filmFlicker(seed, flickerFrameIndex, input.flicker);
  const weaveX = jitter(seed + 31, weaveFrameIndex, input.gateWeave) * 5;
  const weaveY = jitter(seed + 47, weaveFrameIndex, input.gateWeave) * 3;
  const overlays: AdjustmentVisualOverlay[] = [];

  if (input.grain > 0) {
    overlays.push({
      id: `${input.id}:film-emulation-grain`,
      target: input.target,
      style: {
        backgroundImage: createNoiseSvgDataUri({
          seed: seed + grainFrameIndex * 13,
          size: Math.round(72 + input.grainSize * 34),
          density: input.grain,
          contrast: 0.66 + input.grain * 0.42,
        }),
        backgroundSize: `${Math.max(34, 105 - input.grainSize * 18)}px ${Math.max(34, 105 - input.grainSize * 18)}px`,
        backgroundPosition: `${weaveX}px ${weaveY}px`,
        mixBlendMode: "overlay",
        opacity: round(input.intensity * input.grain * 0.42 * flicker),
      },
    });
  }

  if (input.dust > 0 || input.scratches > 0) {
    overlays.push({
      id: `${input.id}:film-emulation-damage`,
      target: input.target,
      style: {
        backgroundImage: createDamageSvgDataUri({
          seed: seed + Math.floor(dustFrameIndex / 2) * 19,
          scratchSeed: seed + Math.floor(scratchFrameIndex / 2) * 23,
          dust: input.dust,
          scratches: input.scratches,
          warmth: input.warmth,
        }),
        backgroundSize: "cover",
        backgroundPosition: `${weaveX * 1.8}px ${weaveY * 1.8}px`,
        mixBlendMode: "screen",
        opacity: round(
          input.intensity * (0.2 + input.dust * 0.34 + input.scratches * 0.28),
        ),
      },
    });
  }

  if (input.halation > 0) {
    overlays.push({
      id: `${input.id}:film-emulation-halation`,
      target: input.target,
      style: {
        backgroundImage: [
          "radial-gradient(circle at 18% 22%, rgba(255,99,55,0.42) 0, rgba(255,120,64,0.22) 11%, transparent 32%)",
          "radial-gradient(circle at 78% 18%, rgba(255,78,42,0.34) 0, rgba(255,146,74,0.18) 13%, transparent 36%)",
          "linear-gradient(90deg, rgba(255,74,38,0.22), transparent 24%, transparent 76%, rgba(255,112,54,0.18))",
        ].join(","),
        mixBlendMode: "screen",
        opacity: round(input.intensity * input.halation * 0.5),
      },
    });
  }

  if (input.vignette > 0 || input.flicker > 0 || input.gateWeave > 0) {
    overlays.push({
      id: `${input.id}:film-emulation-gate`,
      target: input.target,
      style: {
        backgroundImage: [
          "radial-gradient(ellipse at 50% 50%, transparent 0 52%, rgba(34,18,12,0.42) 100%)",
          "linear-gradient(90deg, rgba(0,0,0,0.22), transparent 4%, transparent 96%, rgba(0,0,0,0.22))",
          "linear-gradient(180deg, rgba(255,221,164,0.08), transparent 42%, rgba(41,22,13,0.08))",
        ].join(","),
        transform: `translate(${round(weaveX)}px, ${round(weaveY)}px)`,
        mixBlendMode: "multiply",
        opacity: round(
          input.intensity * (input.vignette * 0.58 + (1 - flicker) * 0.5),
        ),
      },
    });
  }

  return overlays;
}

function getFrameIndex(sceneTime: number, frameRate: number, speed: number) {
  return Math.max(
    0,
    Math.floor(sceneTime * Math.max(frameRate, 1) * clamp(speed, 0, 4)),
  );
}

function createNoiseSvgDataUri(input: {
  seed: number;
  size: number;
  density: number;
  contrast: number;
}) {
  const size = clamp(Math.round(input.size), 48, 180);
  let random = mulberry32(input.seed);
  const rects: string[] = [];
  const count = Math.round(size * size * clamp(input.density, 0, 1.4) * 0.08);
  for (let index = 0; index < count; index += 1) {
    const value = random();
    const alpha = 0.1 + Math.pow(random(), 1.7) * input.contrast;
    const channel = value > 0.52 ? 255 : 12;
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const dot = 1 + Math.floor(random() * 2);
    rects.push(
      `<rect x="${x}" y="${y}" width="${dot}" height="${dot}" fill="rgb(${channel},${channel},${channel})" opacity="${round(alpha)}"/>`,
    );
  }
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rects.join("")}</svg>`,
  );
}

function createDamageSvgDataUri(input: {
  seed: number;
  scratchSeed: number;
  dust: number;
  scratches: number;
  warmth: number;
}) {
  let random = mulberry32(input.seed);
  let scratchRandom = mulberry32(input.scratchSeed);
  const width = 320;
  const height = 180;
  const marks: string[] = [];
  const dustCount = Math.round(12 + input.dust * 56);
  for (let index = 0; index < dustCount; index += 1) {
    const x = round(random() * width);
    const y = round(random() * height);
    const radius = round(
      0.25 + Math.pow(random(), 2.1) * (2.2 + input.dust * 1.8),
    );
    const alpha = round((0.16 + random() * 0.62) * input.dust);
    const channel = random() > 0.23 ? 255 : 18;
    marks.push(
      `<circle cx="${x}" cy="${y}" r="${radius}" fill="rgb(${channel},${channel},${channel})" opacity="${alpha}"/>`,
    );
  }
  const scratchCount = Math.round(input.scratches * 13);
  for (let index = 0; index < scratchCount; index += 1) {
    marks.push(createScratchMark(scratchRandom, width, height, input));
  }
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${marks.join("")}</svg>`,
  );
}

function createScratchMark(
  random: () => number,
  width: number,
  height: number,
  input: { scratches: number; warmth: number },
) {
  const x = round(random() * width);
  const y = round(random() * height);
  const length = 34 + random() * 142;
  const segments = 5 + Math.floor(random() * 9);
  const tilt = (random() - 0.5) * 10;
  const raggedness = 1.6 + random() * 5.6;
  const red = Math.round(226 + input.warmth * 18);
  const stroke = `rgb(${red},232,218)`;
  const strokeWidth = round(0.22 + Math.pow(random(), 1.9) * 1.28);
  const alpha = round((0.16 + random() * 0.5) * input.scratches);
  const points: string[] = [];

  for (let pointIndex = 0; pointIndex <= segments; pointIndex += 1) {
    const t = pointIndex / segments;
    const split = pointIndex > 0 && pointIndex < segments && random() < 0.18;
    const nick = split ? ` M` : pointIndex === 0 ? `M` : ` L`;
    const px = round(x + tilt * t + (random() - 0.5) * raggedness);
    const py = round(y + length * t + (random() - 0.5) * raggedness * 1.8);
    points.push(`${nick} ${px} ${py}`);
  }

  const chips = Array.from({ length: Math.floor(random() * 4) }, () => {
    const t = random();
    const cx = round(x + tilt * t + (random() - 0.5) * 7);
    const cy = round(y + length * t + (random() - 0.5) * 7);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${round(0.35 + random() * 1.8)}" ry="${round(0.18 + random() * 0.8)}" fill="${stroke}" opacity="${round(alpha * (0.28 + random() * 0.5))}" transform="rotate(${round(-8 + random() * 16)} ${cx} ${cy})"/>`;
  }).join("");

  return `<path d="${points.join("")}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="butt" stroke-linejoin="miter" stroke-dasharray="${round(12 + random() * 38)} ${round(1 + random() * 12)} ${round(1 + random() * 10)} ${round(2 + random() * 18)}" opacity="${alpha}"/>${chips}`;
}

function filmFlicker(seed: number, frameIndex: number, amount: number) {
  const random = mulberry32(seed + frameIndex * 101)();
  return 1 + (random - 0.5) * clamp(amount, 0, 1) * 0.34;
}

function jitter(seed: number, frameIndex: number, amount: number) {
  const random = mulberry32(seed + Math.floor(frameIndex / 2) * 137)();
  return (random - 0.5) * clamp(amount, 0, 1);
}

function mulberry32(seed: number) {
  let value = seed || 1;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function svgDataUri(svg: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
