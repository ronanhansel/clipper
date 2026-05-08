export type Composition3dPackageDefinition = {
  id: string;
  label: string;
  group: string;
  groups?: string[];
};

export const builtInComposition3dPackages = [
  { id: "composition3d:camera", label: "Camera", group: "Scene/Camera", groups: ["Scene", "Camera"] },
  { id: "composition3d:model", label: "Model", group: "Scene/Geometry", groups: ["Scene", "Geometry"] },
  { id: "composition3d:material", label: "Material", group: "Scene/Materials", groups: ["Scene", "Materials"] },
  { id: "composition3d:light", label: "Light", group: "Scene/Lights", groups: ["Scene", "Lights"] },
  { id: "composition3d:environment", label: "Environment", group: "Scene/Lighting", groups: ["Scene", "Lighting"] },
  { id: "composition3d:time", label: "Time", group: "TSL/Inputs", groups: ["TSL", "Inputs"] },
  { id: "composition3d:uv", label: "UV", group: "TSL/Inputs", groups: ["TSL", "Inputs"] },
  { id: "composition3d:color", label: "Color", group: "TSL/Color", groups: ["TSL", "Color"] },
  { id: "composition3d:texture", label: "Texture", group: "TSL/Texture", groups: ["TSL", "Texture"] },
  { id: "composition3d:mx_noise_vec3", label: "Noise", group: "TSL/Texture", groups: ["TSL", "Texture"] },
  { id: "composition3d:split_x", label: "Split X", group: "TSL/Coordinates", groups: ["TSL", "Coordinates"] },
  { id: "composition3d:split_y", label: "Split Y", group: "TSL/Coordinates", groups: ["TSL", "Coordinates"] },
  { id: "composition3d:vec2", label: "Vec2", group: "TSL/Coordinates", groups: ["TSL", "Coordinates"] },
  { id: "composition3d:mul", label: "Multiply", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:add", label: "Add", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:sub", label: "Subtract", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:div", label: "Divide", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:abs", label: "Absolute", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:max", label: "Max", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:min", label: "Min", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:pow", label: "Power", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:sin", label: "Sine", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:fract", label: "Fract", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:clamp", label: "Clamp", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:mix", label: "Mix", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:smoothstep", label: "Smoothstep", group: "TSL/Math", groups: ["TSL", "Math"] },
  { id: "composition3d:postprocess", label: "Post Process", group: "Render/Post", groups: ["Render", "Post"] },
] as const satisfies readonly Composition3dPackageDefinition[];

export function getComposition3dPackage(id: string) {
  return builtInComposition3dPackages.find((definition) => definition.id === id) ?? null;
}
