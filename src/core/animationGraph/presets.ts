import type { AnimationGraph, AnimationGraphNode } from "./types";

export type AnimationGraphPresetEffect = {
  property: "opacity" | "position" | "scale" | "rotate";
  label: string;
  parameters: Record<string, string>;
};

const presetEffectKinds: Record<
  AnimationGraphPresetEffect["property"],
  string
> = {
  opacity: "effect:clipper.adjustment.opacity",
  position: "effect:clipper.motion.pan",
  scale: "effect:clipper.motion.zoom",
  rotate: "effect:clipper.motion.rotate",
};

export type AnimationGraphPresetDefinition = {
  id: string;
  label: string;
  duration: string;
  delay?: string;
  ease?: string;
  repeat?: string;
  repeatType?: string;
  effects: AnimationGraphPresetEffect[];
};

export const animationGraphPresets: readonly AnimationGraphPresetDefinition[] =
  [
    {
      id: "fade-in",
      label: "Fade In",
      duration: "0.6s",
      ease: "easeOut",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "0", to: "1" },
        },
      ],
    },
    {
      id: "fade-out",
      label: "Fade Out",
      duration: "0.6s",
      ease: "easeIn",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "1", to: "0" },
        },
      ],
    },
    {
      id: "slide-up",
      label: "Slide Up",
      duration: "0.7s",
      ease: "easeOut",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "0", to: "1" },
        },
        {
          property: "position",
          label: "Position",
          parameters: {
            "x from": "0",
            "x to": "0",
            "y from": "60",
            "y to": "0",
          },
        },
      ],
    },
    {
      id: "slide-down",
      label: "Slide Down",
      duration: "0.7s",
      ease: "easeOut",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "0", to: "1" },
        },
        {
          property: "position",
          label: "Position",
          parameters: {
            "x from": "0",
            "x to": "0",
            "y from": "-60",
            "y to": "0",
          },
        },
      ],
    },
    {
      id: "slide-left",
      label: "Slide Left",
      duration: "0.7s",
      ease: "easeOut",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "0", to: "1" },
        },
        {
          property: "position",
          label: "Position",
          parameters: {
            "x from": "60",
            "x to": "0",
            "y from": "0",
            "y to": "0",
          },
        },
      ],
    },
    {
      id: "slide-right",
      label: "Slide Right",
      duration: "0.7s",
      ease: "easeOut",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "0", to: "1" },
        },
        {
          property: "position",
          label: "Position",
          parameters: {
            "x from": "-60",
            "x to": "0",
            "y from": "0",
            "y to": "0",
          },
        },
      ],
    },
    {
      id: "scale-pop",
      label: "Scale Pop",
      duration: "0.5s",
      ease: "easeOut",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "0", to: "1" },
        },
        {
          property: "scale",
          label: "Scale",
          parameters: { from: "0.8", to: "1" },
        },
      ],
    },
    {
      id: "scale-in",
      label: "Scale In",
      duration: "0.7s",
      ease: "easeOut",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "0", to: "1" },
        },
        {
          property: "scale",
          label: "Scale",
          parameters: { from: "0", to: "1" },
        },
      ],
    },
    {
      id: "rotate-in",
      label: "Rotate In",
      duration: "0.6s",
      ease: "easeOut",
      effects: [
        {
          property: "opacity",
          label: "Opacity",
          parameters: { from: "0", to: "1" },
        },
        {
          property: "rotate",
          label: "Rotate",
          parameters: { from: "-12", to: "0" },
        },
      ],
    },
    {
      id: "drift",
      label: "Drift",
      duration: "3s",
      ease: "easeInOut",
      repeat: "Infinity",
      repeatType: "reverse",
      effects: [
        {
          property: "position",
          label: "Position",
          parameters: {
            "x from": "-20",
            "x to": "20",
            "y from": "-10",
            "y to": "10",
          },
        },
      ],
    },
    {
      id: "pulse",
      label: "Pulse",
      duration: "1.5s",
      ease: "easeInOut",
      repeat: "Infinity",
      effects: [
        {
          property: "scale",
          label: "Scale",
          parameters: { from: "1", to: "1.05" },
        },
      ],
    },
    {
      id: "bounce",
      label: "Bounce",
      duration: "0.8s",
      ease: "easeOut",
      effects: [
        {
          property: "position",
          label: "Position",
          parameters: {
            "x from": "0",
            "x to": "0",
            "y from": "0",
            "y to": "-30",
          },
        },
      ],
    },
  ];

export function addAnimationGraphPresetGroupToGraph(
  graph: AnimationGraph | undefined,
  presetId: string,
  sourceObjectId: string,
  position: { x: number; y: number },
  idSuffix = Date.now().toString(36),
): AnimationGraph {
  const preset = animationGraphPresets.find((item) => item.id === presetId);
  if (!preset) {
    return (
      graph ?? {
        id: `graph:${sourceObjectId}`,
        sourceObjectId,
        nodes: {},
        edges: [],
      }
    );
  }
  const prefix = `preset:${preset.id}:${idSuffix}`;
  const sourceId = `${prefix}:source`;
  const timeId = `${prefix}:time`;
  const outId = `${prefix}:out`;
  const nodes: Record<string, AnimationGraphNode> = {
    [sourceId]: {
      id: sourceId,
      kind: "source",
      position,
      config: { objectId: sourceObjectId },
    },
    [timeId]: {
      id: timeId,
      kind: "time",
      position: { x: position.x + 5, y: position.y },
      config: {
        delay: preset.delay ?? "0s",
        duration: preset.duration,
        ease: preset.ease ?? "linear",
        repeat: preset.repeat ?? "0",
        repeatType: preset.repeatType ?? "loop",
      },
    },
    [outId]: {
      id: outId,
      kind: "out",
      position: {
        x: position.x + 10 + preset.effects.length * 5,
        y: position.y,
      },
      config: {},
    },
  };
  const edges: AnimationGraph["edges"] = [
    {
      id: `${sourceId}:out->${timeId}:in`,
      from: { nodeId: sourceId, portId: "out" },
      to: { nodeId: timeId, portId: "in" },
    },
  ];
  let previousId = timeId;
  preset.effects.forEach((effect, index) => {
    const effectId = `${prefix}:effect:${index}:${effect.property}`;
    nodes[effectId] = {
      id: effectId,
      kind: presetEffectKinds[effect.property],
      position: { x: position.x + 10 + index * 5, y: position.y },
      config: { params: effect.parameters },
    };
    edges.push({
      id: `${previousId}:out->${effectId}:in`,
      from: { nodeId: previousId, portId: "out" },
      to: { nodeId: effectId, portId: "in" },
    });
    previousId = effectId;
  });
  edges.push({
    id: `${previousId}:out->${outId}:in`,
    from: { nodeId: previousId, portId: "out" },
    to: { nodeId: outId, portId: "in" },
  });
  return {
    id: graph?.id ?? `graph:${sourceObjectId}`,
    sourceObjectId: graph?.sourceObjectId ?? sourceObjectId,
    nodes: { ...(graph?.nodes ?? {}), ...nodes },
    edges: [...(graph?.edges ?? []), ...edges],
    viewport: graph?.viewport,
  };
}
