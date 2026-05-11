import type { LayerAnimation } from "../../../../types";

export type AnimationControllerField = {
  key: string;
  label: string;
  defaultValue: string;
  min?: number;
  max?: number;
  step?: number;
};

export type AnimationControllerFieldGroup = {
  id: string;
  label?: string;
  columns?: number;
  fields: AnimationControllerField[];
};

export type AnimationMaterializationContext = {
  readNumber: (key: string, fallback: number) => number;
};

export type AnimationDefinition = {
  property: string;
  label: string;
  category: string;
  popover?: { width: number; height: number };
  fieldGroups: AnimationControllerFieldGroup[];
  getDetails: (animation: LayerAnimation) => Record<string, string> | null;
  materializeKeyframes: (
    context: AnimationMaterializationContext,
  ) => LayerAnimation["keyframes"];
};

export type AnimationManifest = Pick<
  AnimationDefinition,
  "property" | "label" | "category" | "popover" | "fieldGroups"
>;

export type AnimationLogic = Pick<
  AnimationDefinition,
  "getDetails" | "materializeKeyframes"
>;
