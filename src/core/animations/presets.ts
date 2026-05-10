import type {
  AnimationGraphCustomNode,
  AnimationGraphEdge,
  AnimationGraphGroup,
  AnimationGraphState,
} from "../types";

export type AnimationGraphPresetEffect = {
  property: "opacity" | "position" | "scale" | "rotate";
  label: string;
  parameters: Record<string, string>;
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

export function createAnimationGraphPresetGroup(
  preset: AnimationGraphPresetDefinition,
  groupId: string,
): AnimationGraphGroup {
  const timeId = `${groupId}:time:0`;
  const outId = `${groupId}:out`;
  const customNodes: Record<string, AnimationGraphCustomNode> = {
    [timeId]: {
      kind: "time",
      label: "Time",
      scopeKey: groupId,
      details: {
        delay: preset.delay ?? "0s",
        duration: preset.duration,
        ease: preset.ease ?? "linear",
        repeat: preset.repeat ?? "0",
        repeatType: preset.repeatType ?? "loop",
      },
    },
  };
  const nodes: AnimationGraphGroup["nodes"] = {
    [timeId]: { x: 6, y: 6 },
    [outId]: { x: 6, y: 10 },
  };
  const parameters: NonNullable<AnimationGraphGroup["parameters"]> = {};
  const edges: AnimationGraphEdge[] = [];
  preset.effects.forEach((effect, index) => {
    const effectId = `${groupId}:effect:${index}:${effect.property}`;
    customNodes[effectId] = {
      kind: "animation",
      label: effect.label,
      scopeKey: groupId,
      details: { property: effect.property },
    };
    nodes[effectId] = { x: 2 + index * 5, y: 2 };
    parameters[effectId] = effect.parameters;
    edges.push({
      id: `${effectId}:bottom->${timeId}:top`,
      fromNodeId: effectId,
      fromPort: "bottom",
      toNodeId: timeId,
      toPort: "top",
    });
  });
  edges.push({
    id: `${timeId}:bottom->${outId}:top`,
    fromNodeId: timeId,
    fromPort: "bottom",
    toNodeId: outId,
    toPort: "top",
  });
  return {
    id: groupId,
    name: preset.label,
    nodes,
    edges,
    customNodes,
    parameters,
    outNodeId: outId,
  };
}

export function addAnimationGraphPresetGroupToGraph(
  graph: AnimationGraphState | undefined,
  presetId: string,
  scopeKey: string,
  position: { x: number; y: number },
  idSuffix = Date.now().toString(36),
): AnimationGraphState {
  const preset = animationGraphPresets.find((item) => item.id === presetId);
  if (!preset) return graph ?? { nodes: {}, edges: [] };
  const groupId = `group:${preset.id}:${idSuffix}`;
  const nodeId = `custom:group:${idSuffix}`;
  const group = createAnimationGraphPresetGroup(preset, groupId);
  return {
    nodes: { ...(graph?.nodes ?? {}), [nodeId]: position },
    edges: graph?.edges ?? [],
    customNodes: {
      ...(graph?.customNodes ?? {}),
      [nodeId]: {
        kind: "group",
        label: preset.label,
        scopeKey,
        details: { groupId },
      },
    },
    groups: { ...(graph?.groups ?? {}), [groupId]: group },
    parameters: graph?.parameters,
    viewport: graph?.viewport,
    viewports: graph?.viewports,
  };
}
