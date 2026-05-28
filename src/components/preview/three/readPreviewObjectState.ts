import {
  evaluateObjectState,
  type EvaluatedObjectState,
} from "../../../core/propertyRegistry";
import type { FrameObject } from "../../../core/types";

export function hasTimeVaryingObjectState(object: FrameObject): boolean {
  return Object.keys(object.tracks ?? {}).length > 0;
}

export function readPreviewObjectState(
  object: FrameObject,
  localTime: number,
): EvaluatedObjectState {
  return hasTimeVaryingObjectState(object)
    ? evaluateObjectState(object, localTime)
    : readStaticObjectState(object);
}

export function readStaticObjectState(
  object: FrameObject,
): EvaluatedObjectState {
  return object as EvaluatedObjectState;
}
