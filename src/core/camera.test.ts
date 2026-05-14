import { describe, expect, it } from "vitest";
import {
  CAMERA_PERSPECTIVE,
  formatCameraPreviewFilter,
  formatCameraPreviewTransform,
  getActiveMarkerByKind,
  getActivePerspectiveMarkers,
  getLayeredCameraPreviewTransform,
  getMotionBlurConfig,
  viewportPointToFrame,
} from "./camera";
import { motionBlocksToMotionMarkers } from "./motionEffects";
import type { MotionMarker, Part, TimelineMotionLayerState } from "./types";

const basePart: Part = {
  id: "part",
  filePath: "part.ts",
  duration: 4,
  frame: { width: 1920, height: 1080, style: {} },
  background: { id: "background", name: "Background", style: {}, elements: [] },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

describe("camera", () => {
  it("ignores tracked pan markers from removed motion layers", () => {
    const part: Part = {
      ...basePart,
      objects: [
        {
          id: "tracker",
          name: "Tracker",
          type: "rect",
          selector: "[data-object-id='tracker']",
          bounds: { x: 100, y: 100, width: 100, height: 100 },
          style: {},
          animations: [
            {
              id: "tracker-x",
              tracks: [
                {
                  property: "x" as const,
                  valueType: "number" as const,
                  points: [
                    {
                      id: "x:0",
                      time: 0 / 1,
                      value: 0,
                      easingToNext: "linear" as const,
                    },
                    {
                      id: "x:1",
                      time: 1 / 1,
                      value: 400,
                      easingToNext: "linear" as const,
                    },
                  ],
                },
              ],
              options: { duration: 4 },
            },
          ],
        },
      ],
      motionMarkers: motionBlocksToMotionMarkers([
        {
          id: "pan",
          effectId: "clipper.motion.pan",
          layerId: "removed_pan",
          start: 0,
          duration: 4,
          position: { x: 0, y: 0 },
          followId: "tracker",
        },
      ]),
    };
    const layers: TimelineMotionLayerState[] = [
      { id: "clipper.motion.pan", kind: "motion" },
    ];

    expect(getLayeredCameraPreviewTransform(part, layers, 2)).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it("uses manual pan position after a tracker id is cleared", () => {
    const part: Part = {
      ...basePart,
      objects: [
        {
          id: "tracker",
          name: "Tracker",
          type: "rect",
          selector: "[data-object-id='tracker']",
          bounds: { x: 100, y: 100, width: 100, height: 100 },
          style: {},
          animations: [
            {
              id: "tracker-x",
              tracks: [
                {
                  property: "x" as const,
                  valueType: "number" as const,
                  points: [
                    {
                      id: "x:0",
                      time: 0 / 1,
                      value: 0,
                      easingToNext: "linear" as const,
                    },
                    {
                      id: "x:1",
                      time: 1 / 1,
                      value: 400,
                      easingToNext: "linear" as const,
                    },
                  ],
                },
              ],
              options: { duration: 4 },
            },
          ],
        },
      ],
    };

    const tracked = getActiveMarkerByKind(
      [
        {
          id: "pan",
          effectId: "clipper.motion.pan",
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 4,
          position: { x: 12, y: 34 },
          followId: "tracker",
        },
      ],
      "pan",
      2,
      part,
    );
    const manual = getActiveMarkerByKind(
      [
        {
          id: "pan",
          effectId: "clipper.motion.pan",
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 4,
          position: { x: 12, y: 34 },
        },
      ],
      "pan",
      2,
      part,
    );

    expect(tracked?.position?.x).not.toBe(12);
    expect(manual?.position).toEqual({ x: 12, y: 34 });
  });

  it("suppresses rotation while picking a pan target", () => {
    const part: Part = {
      ...basePart,
      motionMarkers: motionBlocksToMotionMarkers([
        {
          id: "rotate",
          effectId: "clipper.motion.rotate",
          layerId: "clipper.motion.rotate",
          start: 0,
          duration: 4,
          position: { x: 0, y: 0 },
          rotation: 15,
        },
      ]),
    };
    const layers: TimelineMotionLayerState[] = [
      { id: "clipper.motion.rotate", kind: "motion" },
    ];

    expect(
      getLayeredCameraPreviewTransform(part, layers, 2).rotation,
    ).toBeGreaterThan(0);
    expect(
      getLayeredCameraPreviewTransform(part, layers, 2, {
        pickingTranslationPosition: true,
      }).rotation,
    ).toBe(0);
  });

  it("keeps pan as x/y translation only", () => {
    const part: Part = {
      ...basePart,
      motionMarkers: motionBlocksToMotionMarkers([
        {
          id: "pan",
          effectId: "clipper.motion.pan",
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 4,
          position: { x: 10, y: 20 },
          snapIn: true,
          snapOut: true,
        },
      ]),
    };
    const layers: TimelineMotionLayerState[] = [
      { id: "clipper.motion.pan", kind: "motion" },
    ];

    expect(getLayeredCameraPreviewTransform(part, layers, 2)).toMatchObject({
      x: 10,
      y: 20,
      z: 0,
    });
  });

  it("layers perspective markers into the camera transform", () => {
    const part: Part = {
      ...basePart,
      motionMarkers: motionBlocksToMotionMarkers([
        {
          id: "perspective",
          effectId: "clipper.motion.perspective",
          layerId: "clipper.motion.perspective",
          start: 0,
          duration: 4,
          position: { x: 0, y: 0 },
          perspective: { z: 300, rotateX: 8, rotateY: -4 },
          snapIn: true,
          snapOut: true,
        },
      ]),
    };
    const layers: TimelineMotionLayerState[] = [
      { id: "clipper.motion.perspective", kind: "motion" },
    ];

    expect(getLayeredCameraPreviewTransform(part, layers, 2)).toMatchObject({
      z: 300,
      rotateX: 8,
      rotateY: -4,
      perspective: CAMERA_PERSPECTIVE,
    });
  });

  it("keeps perspective distance out of the camera transform string", () => {
    const transform = formatCameraPreviewTransform({
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      rotation: 0,
      rotateX: 8,
      rotateY: 0,
      perspective: CAMERA_PERSPECTIVE,
      motionBlur: 0,
    });

    expect(transform).not.toContain("perspective(");
    expect(transform).toContain("rotateX(8deg)");
  });

  it("maps viewport points back through zoom camera translation", () => {
    const transform = {
      x: -120,
      y: 60,
      z: 0,
      scale: 2,
      rotation: 0,
      rotateX: 0,
      rotateY: 0,
      perspective: CAMERA_PERSPECTIVE,
      motionBlur: 0,
    };

    expect(viewportPointToFrame({ x: 960, y: 540 }, transform, 1)).toEqual({
      x: 1020,
      y: 510,
    });
    expect(viewportPointToFrame({ x: 1920, y: 1080 }, transform, 1)).toEqual({
      x: 1500,
      y: 780,
    });
  });

  it("preserves perspective tilt values when converting motion blocks to markers", () => {
    const [marker] = motionBlocksToMotionMarkers([
      {
        id: "perspective",
        effectId: "clipper.motion.perspective",
        layerId: "clipper.motion.perspective",
        start: 0,
        duration: 1,
        position: { x: 0, y: 0 },
        params: { perspective: { z: 102, rotateX: 33, rotateY: 40 } },
      },
    ]);

    expect(marker.perspective).toEqual({ z: 102, rotateX: 33, rotateY: 40 });
  });

  it("interpolates perspective markers with existing easing", () => {
    const perspective = getActivePerspectiveMarkers(
      [
        {
          id: "perspective",
          effectId: "clipper.motion.perspective",
          kind: "perspective" as const,
          layerId: "clipper.motion.perspective",
          start: 0,
          duration: 4,
          position: { x: 0, y: 0 },
          perspective: { z: 200, rotateX: 10, rotateY: -20 },
          ease: "linear",
        },
      ],
      0.44,
    );

    expect(perspective).toMatchObject({ z: 100, rotateX: 5, rotateY: -10 });
  });

  it("uses explicit mends for instant motion handoffs without snap flags", () => {
    const markers = [
      {
        id: "a",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "clipper.motion.pan",
        start: 0,
        duration: 2,
        position: { x: 10, y: 0 },
        mendOutId: "b",
      },
      {
        id: "b",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "clipper.motion.pan",
        start: 2,
        duration: 2,
        position: { x: 100, y: 0 },
        mendInId: "a",
      },
    ];

    expect(getActiveMarkerByKind(markers, "pan", 1.95)?.position?.x).toBe(10);
    expect(getActiveMarkerByKind(markers, "pan", 2)?.position?.x).toBe(100);
  });

  it("uses explicit mends for transition motion handoffs without snap flags", () => {
    const markers = [
      {
        id: "a",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "clipper.motion.pan",
        start: 0,
        duration: 2,
        position: { x: 10, y: 0 },
        mendOutId: "b",
      },
      {
        id: "b",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "clipper.motion.pan",
        start: 2,
        duration: 2,
        position: { x: 100, y: 0 },
        mendInId: "a",
        middleTransition: "transition" as const,
        middleEase: "linear" as const,
      },
    ];

    expect(getActiveMarkerByKind(markers, "pan", 2.22)?.position?.x).toBe(55);
  });

  describe("motion blur", () => {
    it("produces blur during mended pan middle transition with motionBlur enabled", () => {
      const markers = [
        {
          id: "a",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 2,
          position: { x: 10, y: 0 },
          mendOutId: "b",
        },
        {
          id: "b",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 2,
          duration: 2,
          position: { x: 500, y: 0 },
          mendInId: "a",
          middleTransition: "transition" as const,
          middleEase: "linear" as const,
          params: { mendVisual: "motionBlur" },
        },
      ];

      const marker = getActiveMarkerByKind(markers, "pan", 2.11);
      expect(marker?.motionBlur).toBeGreaterThan(0);
    });

    it("blur is zero outside the middle transition window", () => {
      const markers = [
        {
          id: "a",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 2,
          position: { x: 10, y: 0 },
          mendOutId: "b",
        },
        {
          id: "b",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 2,
          duration: 2,
          position: { x: 500, y: 0 },
          mendInId: "a",
          middleTransition: "transition" as const,
          middleEase: "linear" as const,
          params: { mendVisual: "motionBlur" },
        },
      ];

      // Well past the 0.22 middle transition window, blur should be zero
      expect(getActiveMarkerByKind(markers, "pan", 3)?.motionBlur).toBeLessThan(
        0.1,
      );
    });

    it("motionBlur is zero for static holds without mended transition", () => {
      const markers = [
        {
          id: "a",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 2,
          position: { x: 100, y: 0 },
          snapIn: true,
          snapOut: true,
        },
      ];

      expect(getActiveMarkerByKind(markers, "pan", 1)?.motionBlur).toBe(0);
    });

    it("motionBlur is zero for rotate markers in middle transition", () => {
      const markers = [
        {
          id: "a",
          effectId: "clipper.motion.rotate" as const,
          kind: "rotate" as const,
          layerId: "clipper.motion.rotate",
          start: 0,
          duration: 2,
          position: { x: 0, y: 0 },
          rotation: 0,
          mendOutId: "b",
        },
        {
          id: "b",
          effectId: "clipper.motion.rotate" as const,
          kind: "rotate" as const,
          layerId: "clipper.motion.rotate",
          start: 2,
          duration: 2,
          position: { x: 0, y: 0 },
          rotation: 90,
          mendInId: "a",
          middleTransition: "transition" as const,
          middleEase: "linear" as const,
        },
      ];

      const marker = getActiveMarkerByKind(markers, "rotate", 2.11);
      expect(marker?.motionBlur).toBe(0);
    });

    it("formatCameraPreviewFilter returns blur(Npx) only when blur > 0", () => {
      expect(
        formatCameraPreviewFilter({
          x: 0,
          y: 0,
          z: 0,
          scale: 1,
          rotation: 0,
          rotateX: 0,
          rotateY: 0,
          perspective: CAMERA_PERSPECTIVE,
          motionBlur: 0,
        }),
      ).toBeUndefined();
      expect(
        formatCameraPreviewFilter({
          x: 0,
          y: 0,
          z: 0,
          scale: 1,
          rotation: 0,
          rotateX: 0,
          rotateY: 0,
          perspective: CAMERA_PERSPECTIVE,
          motionBlur: 12,
        }),
      ).toBe("blur(12px)");
      expect(
        formatCameraPreviewFilter({
          x: 0,
          y: 0,
          z: 0,
          scale: 1,
          rotation: 0,
          rotateX: 0,
          rotateY: 0,
          perspective: CAMERA_PERSPECTIVE,
          motionBlur: 24,
        }),
      ).toBe("blur(24px)");
    });

    it("blur is capped at configured max for long pans", () => {
      const markers = [
        {
          id: "a",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 2,
          position: { x: 0, y: 0 },
          mendOutId: "b",
        },
        {
          id: "b",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 2,
          duration: 2,
          position: { x: 2000, y: 0 },
          mendInId: "a",
          middleTransition: "transition" as const,
          middleEase: "linear" as const,
          params: { mendVisual: "motionBlur" },
        },
      ];

      const marker = getActiveMarkerByKind(markers, "pan", 2.11);
      expect(marker?.motionBlur).toBeLessThanOrEqual(24);
    });

    it("layered transform accumulates max blur across layers", () => {
      const part: Part = {
        ...basePart,
        motionMarkers: [
          {
            id: "a",
            effectId: "clipper.motion.pan" as const,
            kind: "pan" as const,
            layerId: "pan_a",
            start: 0,
            duration: 2,
            position: { x: 0, y: 0 },
            mendOutId: "b",
          },
          {
            id: "b",
            effectId: "clipper.motion.pan" as const,
            kind: "pan" as const,
            layerId: "pan_a",
            start: 2,
            duration: 2,
            position: { x: 500, y: 0 },
            mendInId: "a",
            middleTransition: "transition" as const,
            middleEase: "linear" as const,
            params: { mendVisual: "motionBlur" },
          },
          {
            id: "c",
            effectId: "clipper.motion.pan" as const,
            kind: "pan" as const,
            layerId: "pan_b",
            start: 0,
            duration: 2,
            position: { x: 0, y: 0 },
            mendOutId: "d",
          },
          {
            id: "d",
            effectId: "clipper.motion.pan" as const,
            kind: "pan" as const,
            layerId: "pan_b",
            start: 2,
            duration: 2,
            position: { x: 100, y: 0 },
            mendInId: "c",
            middleTransition: "transition" as const,
            middleEase: "linear" as const,
            params: { mendVisual: "motionBlur" },
          },
        ],
      };
      const layers: TimelineMotionLayerState[] = [
        { id: "pan_a", kind: "motion" },
        { id: "pan_b", kind: "motion" },
      ];

      const transform = getLayeredCameraPreviewTransform(part, layers, 2.11);
      expect(transform.motionBlur).toBeGreaterThan(0);
      // blur from pan_a (500px distance) should dominate pan_b (100px distance)
      const markerA = getActiveMarkerByKind(
        part.motionMarkers.filter((m) => m.layerId === "pan_a"),
        "pan",
        2.11,
        part,
      );
      expect(transform.motionBlur).toBe(markerA?.motionBlur);
    });

    it("motionBlur is zero for mended transition without mendVisual enabled", () => {
      const markers = [
        {
          id: "a",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 2,
          position: { x: 10, y: 0 },
          mendOutId: "b",
        },
        {
          id: "b",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 2,
          duration: 2,
          position: { x: 500, y: 0 },
          mendInId: "a",
          middleTransition: "transition" as const,
          middleEase: "linear" as const,
        },
      ];

      // No mendVisual in params → no blur
      expect(getActiveMarkerByKind(markers, "pan", 2.11)?.motionBlur).toBe(0);
    });

    it("blur respects custom strength, max, and window params", () => {
      const markers = [
        {
          id: "a",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 0,
          duration: 2,
          position: { x: 10, y: 0 },
          mendOutId: "b",
        },
        {
          id: "b",
          effectId: "clipper.motion.pan" as const,
          kind: "pan" as const,
          layerId: "clipper.motion.pan",
          start: 2,
          duration: 2,
          position: { x: 500, y: 0 },
          mendInId: "a",
          middleTransition: "transition" as const,
          middleEase: "linear" as const,
          params: {
            mendVisual: "motionBlur",
            motionBlurStrength: 2,
            motionBlurMax: 12,
            motionBlurWindow: 0.44,
          },
        },
      ];

      const marker = getActiveMarkerByKind(markers, "pan", 2.11);
      // With double strength (divisor=8) and half max, blur should be > 0 but ≤ 12
      expect(marker?.motionBlur).toBeGreaterThan(0);
      expect(marker?.motionBlur).toBeLessThanOrEqual(12);
    });

    it("getMotionBlurConfig returns disabled for markers without mendVisual", () => {
      const marker = {
        id: "b",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "clipper.motion.pan",
        start: 0,
        duration: 2,
        position: { x: 0, y: 0 },
      } as MotionMarker;
      expect(getMotionBlurConfig(marker).enabled).toBe(false);
    });

    it("getMotionBlurConfig returns enabled with defaults when mendVisual is motionBlur", () => {
      const marker = {
        id: "b",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "clipper.motion.pan",
        start: 0,
        duration: 2,
        position: { x: 0, y: 0 },
        params: { mendVisual: "motionBlur" },
      } as unknown as MotionMarker;
      const config = getMotionBlurConfig(marker);
      expect(config.enabled).toBe(true);
      expect(config.strength).toBe(1);
      expect(config.maxBlur).toBe(24);
      expect(config.window).toBe(0.22);
    });

    it("getMotionBlurConfig reads custom params", () => {
      const marker = {
        id: "b",
        effectId: "clipper.motion.pan" as const,
        kind: "pan" as const,
        layerId: "clipper.motion.pan",
        start: 0,
        duration: 2,
        position: { x: 0, y: 0 },
        params: {
          mendVisual: "motionBlur",
          motionBlurStrength: 3,
          motionBlurMax: 48,
          motionBlurWindow: 0.11,
        },
      } as unknown as MotionMarker;
      const config = getMotionBlurConfig(marker);
      expect(config).toMatchObject({
        enabled: true,
        strength: 3,
        maxBlur: 48,
        window: 0.11,
      });
    });
  });
});
