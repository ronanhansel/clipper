import { describe, expect, it } from "vitest";
import { evaluateObjectState } from "./propertyRegistry";
import type { FrameObject } from "./types";
import { getMediaVideoTime } from "./mediaVideoPlayback";

const media: FrameObject = {
  id: "media-1",
  name: "Media 1",
  type: "media",
  selector: "[data-object-id='media-1']",
  bounds: { x: 0, y: 0, width: 100, height: 100 },
  style: {},
  props: { video: { cropStart: 0, cropEnd: 0, speed: 1, playing: true } },
};

describe("media video playback timing", () => {
  it("holds the exact paused frame when play is keyed off", () => {
    const object: FrameObject = {
      ...media,
      tracks: {
        "props.video.playing": {
          valueType: "boolean",
          points: [
            { time: 0, value: true },
            { time: 1, value: false },
          ],
        },
      },
    };

    expect(getMediaVideoTime(evaluateObjectState(object, 1), 1)).toBe(1);
    expect(getMediaVideoTime(evaluateObjectState(object, 1.5), 1.5)).toBe(1);
  });

  it("resumes from the paused frame on the exact play keyframe", () => {
    const object: FrameObject = {
      ...media,
      tracks: {
        "props.video.playing": {
          valueType: "boolean",
          points: [
            { time: 0, value: true },
            { time: 1, value: false },
            { time: 2, value: true },
          ],
        },
      },
    };

    expect(getMediaVideoTime(evaluateObjectState(object, 2), 2)).toBe(1);
    expect(getMediaVideoTime(evaluateObjectState(object, 2.5), 2.5)).toBe(1.5);
  });

  it("applies crop and speed only across playing spans", () => {
    const object: FrameObject = {
      ...media,
      props: {
        video: { cropStart: 3, cropEnd: 0, speed: 2, playing: true },
      },
      tracks: {
        "props.video.playing": {
          valueType: "boolean",
          points: [
            { time: 0, value: true },
            { time: 1, value: false },
            { time: 3, value: true },
          ],
        },
      },
    };

    expect(getMediaVideoTime(evaluateObjectState(object, 1), 1)).toBe(5);
    expect(getMediaVideoTime(evaluateObjectState(object, 3.5), 3.5)).toBe(6);
  });

  it("uses static play state when no play track exists", () => {
    const object: FrameObject = {
      ...media,
      props: { video: { cropStart: 4, cropEnd: 0, speed: 1, playing: false } },
    };

    expect(getMediaVideoTime(object, 10)).toBe(4);
  });
});
