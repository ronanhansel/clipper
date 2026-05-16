import type { ComponentType } from "react";
import { BoundsSection } from "./sections/BoundsSection";
import { EffectsSection } from "./sections/EffectsSection";
import { FillSection } from "./sections/FillSection";
import { Pattern2dSection } from "./sections/Pattern2dSection";
import { RectSection } from "./sections/RectSection";
import { StyleColorEntriesSection } from "./sections/StyleColorEntriesSection";
import { StyleColorSection } from "./sections/StyleColorSection";
import { TextSection } from "./sections/TextSection";

/**
 * The contract for an inspector section: a no-prop component that pulls what
 * it needs from `useObjectInspector()`. Easy to add new ones — write a
 * component, drop it into the registry.
 */
type InspectorSection = ComponentType;

export type InspectorTypeDefinition = {
  /** Sections rendered top-to-bottom for this object type. */
  sections: readonly InspectorSection[];
};

/**
 * Per-object-type inspector composition. To add a new object type:
 *   1. Write a `<SomethingSection>` component that consumes
 *      `useObjectInspector()`.
 *   2. Add an entry here mapping `object.type` → that section list.
 *
 * The render order matches the legacy `if (isText) ... if (isRect) ...`
 * sequencing in the old monolithic ObjectInspector.
 */
export const inspectorRegistry: Record<string, InspectorTypeDefinition> = {
  text: {
    sections: [
      BoundsSection,
      EffectsSection,
      TextSection,
      StyleColorEntriesSection,
    ],
  },
  rect: {
    sections: [
      BoundsSection,
      EffectsSection,
      RectSection,
      StyleColorEntriesSection,
    ],
  },
  pattern2d: {
    sections: [BoundsSection, EffectsSection, Pattern2dSection],
  },
};

/**
 * Fallback for any object type without a dedicated registry entry: bounds +
 * effects + colour + fill + extra colour entries. Matches the legacy fallback.
 */
export const defaultInspectorTypeDefinition: InspectorTypeDefinition = {
  sections: [
    BoundsSection,
    EffectsSection,
    StyleColorSection,
    FillSection,
    StyleColorEntriesSection,
  ],
};

export function getInspectorTypeDefinition(
  type: string,
): InspectorTypeDefinition {
  return inspectorRegistry[type] ?? defaultInspectorTypeDefinition;
}
