import { createContext, useContext } from "react";
import type { Bounds, FrameObject, ProjectBinItem } from "../../core/types";
import type { ComposeAnimationAttributeKey } from "../timeline/composeAnimationModel";
import type { BoundsAnimationKey, EffectInputConfig } from "./inspectorShared";

/**
 * The shape of every helper closure produced inside `ObjectInspector`. The
 * shell builds these once per render, exposes them via context, and section
 * components consume only what they need without prop-drilling.
 */
export type ObjectInspectorHelpers = {
  object: FrameObject;
  currentTime: number;
  liveScrubClock: boolean;
  lockBounds: boolean;
  projectBin: ProjectBinItem[];
  onChange: (updater: (object: FrameObject) => FrameObject) => void;
  onPreview?: (updater: (object: FrameObject) => FrameObject) => void;

  // Live time read used inside event handlers so commits land at the playhead.
  readEffectiveTime: () => number;

  // Bounds / style / transform commits.
  updateBounds: (key: keyof Bounds, value: string) => void;
  previewBounds: (key: keyof Bounds, value: number) => void;
  updateStyleColor: (key: string, value: string) => void;
  updateTextContent: (value: string) => void;
  updateStyleValue: (key: string, value: string | number) => void;
  updateStyleNumber: (key: string, value: string) => void;
  previewStyleNumber: (key: string, value: number) => void;
  updateTransform: (key: string, value: string) => void;
  previewTransform: (key: string, value: number) => void;

  // Text styling toggles.
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrikethrough: () => void;
  hasTextDecoration: (value: "underline" | "line-through") => boolean;
  textButtonClass: (active: boolean) => string;

  // Keyframe operations.
  keyframeValue: (
    key: ComposeAnimationAttributeKey,
    fallback: number | string,
  ) => number | string;
  hasAttributeKeyframes: (key: ComposeAnimationAttributeKey) => boolean;
  keyframeAtCurrentTime: (key: ComposeAnimationAttributeKey) => unknown;
  toggleKeyframe: (
    key: ComposeAnimationAttributeKey,
    value: number | string,
  ) => void;
  toggleLinkedKeyframes: (
    keys: readonly [BoundsAnimationKey, BoundsAnimationKey],
    values: readonly [number | string, number | string],
  ) => void;
  commitKeyframedValue: (
    key: ComposeAnimationAttributeKey | undefined,
    value: string,
    fallbackCommit: (value: string) => void,
    type: "number" | "text",
  ) => void;
  commitLinkedKeyframedValue: (
    keys: readonly [BoundsAnimationKey, BoundsAnimationKey],
    changedKey: BoundsAnimationKey,
    value: string,
    fallbackCommit: (value: string) => void,
  ) => void;

  // The shared keyframed input renderer used by bounds and effects rows.
  renderKeyframedInput: (config: EffectInputConfig) => React.ReactElement;
};

const ObjectInspectorContext = createContext<ObjectInspectorHelpers | null>(
  null,
);

export const ObjectInspectorProvider = ObjectInspectorContext.Provider;

export function useObjectInspector(): ObjectInspectorHelpers {
  const ctx = useContext(ObjectInspectorContext);
  if (!ctx) {
    throw new Error(
      "useObjectInspector must be used within an ObjectInspectorProvider",
    );
  }
  return ctx;
}
