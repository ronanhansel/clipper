import { type MutableRefObject, useCallback } from "react";
import { flushSync } from "react-dom";
import type { FrameObject, Point, Part } from "../../../core/types";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import {
  buildPathObjectUpdate,
  createPathSegment,
  denormalizePathSegments,
  computeShapeDrawBox,
  getDirectedDrawBounds,
  getDrawAxisSnap,
  getDraftJoints,
  getDraftPreviewSegments,
  getDrawToolName,
  getLastPathPoint,
  getMirroredPoint,
  getPathDraftSnapPoint,
  getPathDrawData,
  getPenPathData,
  getPenPreviewData,
  getPointDistance,
  getSvgDrawContent,
  isBezierDrawTool,
  isPathDrawTool,
  isSvgDrawTool,
  isTextPathObject,
  parseClipperPathStyle,
  removePathJoint,
  updateTextPathOffsetInContent,
  type ComposeDrawTool,
  type PathDraft,
  type ShapeDrawPreview,
} from "./composeDrawing";
import { getFrameObjectSnapStops } from "../../../core/frameInteraction";
import { framePointFromClient } from "../../../core/geometry";
import { getPattern2dDefaults } from "../../../core/graphics/pattern2d";

export type ShapeDrawStart = {
  x: number;
  y: number;
  pointerId: number;
  points: Point[];
};

type UpdateObjectById = (
  objectId: string,
  updater: (object: FrameObject) => FrameObject,
  options?: {
    history?: boolean;
    syncSources?: boolean;
    coalesceHistory?: boolean;
  },
) => void;

type PersistComposeSelection = (objectIds: string[]) => void;

type UpdateCompositionForTimelinePart = (
  partId: string,
  updater: (composition: Part) => Part,
) => void;

type SetShapeDrawPreview = (preview: ShapeDrawPreview | null) => void;

type SetActiveTool = (tool: ComposeDrawTool | null) => void;

type SetEditingTextObjectId = (id: string | null) => void;

type SetObjectSnapGuides = (
  guides: { axis: "x" | "y"; position: number }[],
) => void;

type PendingComposeSelectionRef = MutableRefObject<string[]>;

type ActiveToolRef = MutableRefObject<ComposeDrawTool | null>;

type ShapeDrawStartRef = MutableRefObject<ShapeDrawStart | null>;

type PathDraftRef = MutableRefObject<PathDraft | null>;

type ShapeDrawPreviewRef = MutableRefObject<ShapeDrawPreview | null>;

type ShapeDrawPreviewFrameRef = MutableRefObject<number>;

type ObjectSnapGuidesRef = MutableRefObject<
  { axis: "x" | "y"; position: number }[]
>;

type FrameViewportRef = MutableRefObject<HTMLDivElement | null>;

export type UseComposeDrawingParams = {
  part: Part | null;
  activeToolRef: ActiveToolRef;
  cameraPreviewScale: number;
  shapeDrawStartRef: ShapeDrawStartRef;
  pathDraftRef: PathDraftRef;
  shapeDrawPreviewRef: ShapeDrawPreviewRef;
  shapeDrawPreviewFrameRef: ShapeDrawPreviewFrameRef;
  objectSnapGuidesRef: ObjectSnapGuidesRef;
  frameViewportRef: FrameViewportRef;
  displayFramePreviewScale: number;
  pendingComposeSelectionObjectIdsRef: PendingComposeSelectionRef;
  updateCompositionForTimelinePart: UpdateCompositionForTimelinePart;
  updateObjectById: UpdateObjectById;
  persistComposeSelection: PersistComposeSelection;
  setActiveTool: SetActiveTool;
  setShapeDrawPreview: SetShapeDrawPreview;
  setEditingTextObjectId: SetEditingTextObjectId;
  setObjectSnapGuides: SetObjectSnapGuides;
  startTextObjectEdit: (
    event: React.MouseEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  onFramePointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onFramePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onFramePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onFramePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
};

export type ComposeDrawingController = {
  addNullObjectToFrameCenter: () => void;
  createTextObjectAtPoint: (point: Point) => void;
  handleShapeToolPointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => boolean;
  handleShapeToolPointerMove: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => boolean;
  handleShapeToolPointerUp: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => boolean;
  handlePathControlPointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    objectId: string,
    segmentIndex: number,
    control: "start" | "end" | "c1" | "c2",
  ) => void;
  wrappedOnFramePointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
  wrappedOnFramePointerMove: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
  wrappedOnFramePointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  wrappedOnFramePointerCancel: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
  wrappedOnFramePointerLeave: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
  handleObjectCornerRadiusChange: (objectId: string, radius: number) => void;
  handleTextEditEnd: () => void;
  updateTextPathOffset: (
    objectId: string,
    offset: number,
    options?: { history?: boolean },
  ) => void;
  commitPathDraftObject: (draft: PathDraft) => void;
  updatePathObjectControl: (
    objectId: string,
    segmentIndex: number,
    control: "start" | "end" | "c1" | "c2",
    point: Point,
    options?: {
      history?: boolean;
      syncSources?: boolean;
      coalesceHistory?: boolean;
    },
  ) => void;
  deletePathObjectJoint: (
    objectId: string,
    segmentIndex: number,
    control: "start" | "end" | "c1" | "c2",
  ) => void;
  clearComposeDrawSnapGuides: () => void;
  getShapeDrawSnapEnd: (start: Point, end: Point, constrain: boolean) => Point;
};

export function useComposeDrawing({
  part,
  activeToolRef,
  cameraPreviewScale,
  shapeDrawStartRef,
  pathDraftRef,
  shapeDrawPreviewRef,
  shapeDrawPreviewFrameRef,
  objectSnapGuidesRef,
  frameViewportRef,
  displayFramePreviewScale,
  pendingComposeSelectionObjectIdsRef,
  updateCompositionForTimelinePart,
  updateObjectById,
  persistComposeSelection,
  setActiveTool,
  setShapeDrawPreview,
  setEditingTextObjectId,
  setObjectSnapGuides,
  startTextObjectEdit,
  onFramePointerCancel,
  onFramePointerDown,
  onFramePointerMove,
  onFramePointerUp,
}: UseComposeDrawingParams): ComposeDrawingController {
  const updateComposeDrawSnapGuides = useCallback(
    (guides: { axis: "x" | "y"; position: number }[]) => {
      const current = objectSnapGuidesRef.current;
      if (
        current.length === guides.length &&
        current.every(
          (guide, index) =>
            guide.axis === guides[index]?.axis &&
            guide.position === guides[index]?.position,
        )
      )
        return;
      objectSnapGuidesRef.current = guides;
      setObjectSnapGuides(guides);
    },
    [objectSnapGuidesRef, setObjectSnapGuides],
  );

  const clearComposeDrawSnapGuides = useCallback(() => {
    if (objectSnapGuidesRef.current.length === 0) return;
    objectSnapGuidesRef.current = [];
    setObjectSnapGuides([]);
  }, [objectSnapGuidesRef, setObjectSnapGuides]);

  const getShapeDrawSnapEnd = useCallback(
    (start: Point, end: Point, constrain: boolean): Point => {
      if (!part) return end;
      const finalBounds = computeShapeDrawBox(start, end, constrain);
      const stops = getFrameObjectSnapStops([
        ...part.background.elements,
        ...part.objects,
      ]);
      const threshold =
        8 / Math.max(displayFramePreviewScale * cameraPreviewScale, 0.001);
      const xSnap = getDrawAxisSnap(
        [
          {
            position:
              end.x >= start.x
                ? finalBounds.x + finalBounds.width
                : finalBounds.x,
            influence: 1,
          },
          { position: finalBounds.x + finalBounds.width / 2, influence: 0.5 },
        ],
        stops.x,
        threshold,
      );
      const ySnap = getDrawAxisSnap(
        [
          {
            position:
              end.y >= start.y
                ? finalBounds.y + finalBounds.height
                : finalBounds.y,
            influence: 1,
          },
          { position: finalBounds.y + finalBounds.height / 2, influence: 0.5 },
        ],
        stops.y,
        threshold,
      );
      const guides: { axis: "x" | "y"; position: number }[] = [];
      if (xSnap) guides.push({ axis: "x", position: xSnap.position });
      if (ySnap) guides.push({ axis: "y", position: ySnap.position });
      updateComposeDrawSnapGuides(guides);
      return {
        x: end.x + (xSnap?.endOffset ?? 0),
        y: end.y + (ySnap?.endOffset ?? 0),
      };
    },
    [
      part,
      displayFramePreviewScale,
      cameraPreviewScale,
      updateComposeDrawSnapGuides,
    ],
  );

  const addNullObjectToFrameCenter = useCallback(() => {
    if (!part) return;
    const size = 80;
    const id = `null-${Date.now().toString(36)}`;
    const object: FrameObject = {
      id,
      name: "Null object",
      type: "null",
      selector: `[data-object-id='${id}']`,
      bounds: {
        x: Math.round((FRAME_WIDTH - size) / 2),
        y: Math.round((FRAME_HEIGHT - size) / 2),
        width: size,
        height: size,
      },
      style: { background: "transparent" },
    };
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      objects: [...composition.objects, object],
    }));
    pendingComposeSelectionObjectIdsRef.current = [object.id];
    persistComposeSelection([object.id]);
    activeToolRef.current = null;
    setActiveTool(null);
  }, [
    part,
    updateCompositionForTimelinePart,
    pendingComposeSelectionObjectIdsRef,
    persistComposeSelection,
    activeToolRef,
    setActiveTool,
  ]);

  const createTextObjectAtPoint = useCallback(
    (point: Point) => {
      if (!part) return;
      const width = 440;
      const height = 120;
      const id = `text-${Date.now().toString(36)}`;
      const object: FrameObject = {
        id,
        name: "Text",
        type: "text",
        selector: `[data-object-id='${id}']`,
        bounds: {
          x: Math.round(point.x),
          y: Math.round(point.y),
          width,
          height,
        },
        content: "Text",
        style: {
          color: "#ffffff",
          fontSize: 72,
          fontWeight: 400,
          lineHeight: 1.1,
        },
      };
      updateCompositionForTimelinePart(part.id, (composition) => ({
        ...composition,
        objects: [...composition.objects, object],
      }));
      pendingComposeSelectionObjectIdsRef.current = [object.id];
      persistComposeSelection([object.id]);
      setEditingTextObjectId(object.id);
    },
    [
      part,
      updateCompositionForTimelinePart,
      pendingComposeSelectionObjectIdsRef,
      persistComposeSelection,
      setEditingTextObjectId,
    ],
  );

  const commitPathDraftObject = useCallback(
    (draft: PathDraft) => {
      if (!part || draft.segments.length === 0) return;
      const { bounds, path } = getPenPathData(draft.segments, draft.closed);
      const id = `${draft.tool}-${Date.now().toString(36)}`;
      const end = getLastPathPoint(draft);
      const object: FrameObject = {
        id,
        name: getDrawToolName(draft.tool),
        type: "svg",
        selector: `[data-object-id='${id}']`,
        bounds,
        content: getSvgDrawContent(
          draft.tool,
          draft.start,
          end,
          undefined,
          path,
          bounds,
        ),
        style: {
          background: "transparent",
          overflow: "visible",
          clipperPath: JSON.stringify({
            tool: draft.tool,
            segments: draft.segments,
            closed: draft.closed,
          }),
        },
      };
      updateCompositionForTimelinePart(part.id, (composition) => ({
        ...composition,
        objects: [...composition.objects, object],
      }));
      pendingComposeSelectionObjectIdsRef.current = [object.id];
      persistComposeSelection([object.id]);
      if (draft.tool === "textPath") setEditingTextObjectId(object.id);
      activeToolRef.current = null;
      setActiveTool(null);
    },
    [
      part,
      updateCompositionForTimelinePart,
      pendingComposeSelectionObjectIdsRef,
      persistComposeSelection,
      setEditingTextObjectId,
      activeToolRef,
      setActiveTool,
    ],
  );

  const updatePathObjectControl = useCallback(
    (
      objectId: string,
      segmentIndex: number,
      control: "start" | "end" | "c1" | "c2",
      point: Point,
      options?: {
        history?: boolean;
        syncSources?: boolean;
        coalesceHistory?: boolean;
      },
    ) => {
      updateObjectById(
        objectId,
        (object) => {
          const pathStyle = parseClipperPathStyle(object.style.clipperPath);
          if (!pathStyle) return object;
          const segments = denormalizePathSegments(pathStyle, object.bounds);
          const segment = segments[segmentIndex];
          if (!segment) return object;
          if (control === "start" && segmentIndex === 0) {
            segment.start = point;
            if (pathStyle.closed && segments.length > 1)
              segments[segments.length - 1].end = point;
          } else if (control === "end") {
            segment.end = point;
            if (segments[segmentIndex + 1])
              segments[segmentIndex + 1].start = point;
            else if (pathStyle.closed && segmentIndex === segments.length - 1)
              segments[0].start = point;
          } else if (control === "c1" || control === "c2") {
            segment.kind = "curve";
            segment[control] = point;
            if (!segment.c1) segment.c1 = segment.start;
            if (!segment.c2) segment.c2 = segment.end;
          }
          const { bounds, path } = getPenPathData(
            segments,
            Boolean(pathStyle.closed),
          );
          const end = segments[segments.length - 1]?.end ?? segment.end;
          return {
            ...object,
            bounds,
            content: getSvgDrawContent(
              pathStyle.tool,
              segments[0]?.start ?? point,
              end,
              undefined,
              path,
              bounds,
            ),
            style: {
              ...object.style,
              clipperPath: JSON.stringify({ ...pathStyle, segments }),
            },
          };
        },
        options,
      );
    },
    [updateObjectById],
  );

  const deletePathObjectJoint = useCallback(
    (
      objectId: string,
      segmentIndex: number,
      control: "start" | "end" | "c1" | "c2",
    ) => {
      updateObjectById(objectId, (object) => {
        const pathStyle = parseClipperPathStyle(object.style.clipperPath);
        if (!pathStyle) return object;
        const segments = denormalizePathSegments(pathStyle, object.bounds);
        const nextSegments = removePathJoint(
          segments,
          segmentIndex,
          control,
          Boolean(pathStyle.closed),
        );
        if (
          nextSegments === segments ||
          nextSegments.length === segments.length
        )
          return object;
        const closed = Boolean(pathStyle.closed) && nextSegments.length > 1;
        const pathObjectUpdate = buildPathObjectUpdate(
          nextSegments,
          pathStyle.tool,
          closed,
        );
        return {
          ...object,
          bounds: pathObjectUpdate.bounds,
          content: pathObjectUpdate.content,
          style: { ...object.style, clipperPath: pathObjectUpdate.clipperPath },
        };
      });
    },
    [updateObjectById],
  );

  const updateTextPathOffset = useCallback(
    (objectId: string, offset: number, options?: { history?: boolean }) => {
      updateObjectById(
        objectId,
        (object) => {
          if (!isTextPathObject(object) || !object.content) return object;
          return {
            ...object,
            content: updateTextPathOffsetInContent(object.content, offset),
          };
        },
        options,
      );
    },
    [updateObjectById],
  );

  const handleObjectCornerRadiusChange = useCallback(
    (objectId: string, radius: number) => {
      updateObjectById(objectId, (object) => {
        const {
          borderTopLeftRadius,
          borderTopRightRadius,
          borderBottomRightRadius,
          borderBottomLeftRadius,
          ...style
        } = object.style;
        void borderTopLeftRadius;
        void borderTopRightRadius;
        void borderBottomRightRadius;
        void borderBottomLeftRadius;
        const nextStyle = { ...style };
        if (radius > 0) nextStyle.borderRadius = radius;
        else delete nextStyle.borderRadius;
        return { ...object, style: nextStyle };
      });
    },
    [updateObjectById],
  );

  const handleTextEditEnd = useCallback(
    () => setEditingTextObjectId(null),
    [setEditingTextObjectId],
  );

  const handlePathControlPointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      objectId: string,
      segmentIndex: number,
      control: "start" | "end" | "c1" | "c2",
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const frameElement = frameViewportRef.current;
      if (!frameElement) return;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const startClientPoint = { x: event.clientX, y: event.clientY };
      let latestPoint = framePointFromClient(event.nativeEvent, frameElement);
      let frameId = 0;
      let moved = false;
      const flushPreview = () => {
        frameId = 0;
        flushSync(() => {
          updatePathObjectControl(
            objectId,
            segmentIndex,
            control,
            latestPoint,
            { history: false },
          );
        });
      };
      const move = (nativeEvent: PointerEvent) => {
        const deltaX = nativeEvent.clientX - startClientPoint.x;
        const deltaY = nativeEvent.clientY - startClientPoint.y;
        if (Math.hypot(deltaX, deltaY) > 3) moved = true;
        if (!moved) return;
        latestPoint = framePointFromClient(nativeEvent, frameElement);
        if (!frameId) frameId = requestAnimationFrame(flushPreview);
      };
      const up = (nativeEvent: PointerEvent) => {
        if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = 0;
        }
        if (!moved && (control === "start" || control === "end")) {
          deletePathObjectJoint(objectId, segmentIndex, control);
        } else {
          updatePathObjectControl(
            objectId,
            segmentIndex,
            control,
            framePointFromClient(nativeEvent, frameElement),
            { history: true },
          );
        }
        target.releasePointerCapture(event.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [frameViewportRef, updatePathObjectControl, deletePathObjectJoint],
  );

  const handleShapeToolPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): boolean => {
      const tool = activeToolRef.current;
      if (!tool) return false;
      if (event.button !== 0) return false;
      const el = event.currentTarget;
      const rawPoint = framePointFromClient(event.nativeEvent, el);
      if (tool === "text") {
        const hitElement = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-object-id]",
        );
        const hitObjectId = hitElement?.dataset.objectId;
        if (hitObjectId && part) {
          const allObjects = [...part.background.elements, ...part.objects];
          const hitObject = allObjects.find((o) => o.id === hitObjectId);
          if (
            hitObject &&
            (hitObject.type === "text" || isTextPathObject(hitObject))
          ) {
            startTextObjectEdit(
              event as unknown as React.MouseEvent<HTMLDivElement>,
              hitObject,
            );
            return true;
          }
        }
        createTextObjectAtPoint(rawPoint);
        return true;
      }
      if (isBezierDrawTool(tool)) {
        const draft =
          pathDraftRef.current?.tool === tool
            ? pathDraftRef.current
            : {
                tool,
                start: rawPoint,
                segments: [],
                pointerId: null,
                downPoint: null,
                current: null,
                outHandle: null,
                previewPoint: null,
                anchor: null,
                closed: false,
                disconnected: false,
              };
        const point = getPathDraftSnapPoint(draft, rawPoint);
        if (draft.segments.length === 0 && !draft.anchor) draft.anchor = point;
        if (draft.disconnected) {
          draft.anchor = point;
          draft.outHandle = null;
        }
        draft.pointerId = event.pointerId;
        draft.downPoint = point;
        draft.current = null;
        draft.previewPoint = point;
        pathDraftRef.current = draft;
        el.setPointerCapture(event.pointerId);
        return true;
      }
      shapeDrawStartRef.current = {
        x: rawPoint.x,
        y: rawPoint.y,
        pointerId: event.pointerId,
        points: [rawPoint],
      };
      el.setPointerCapture(event.pointerId);
      return true;
    },
    [
      activeToolRef,
      part,
      startTextObjectEdit,
      createTextObjectAtPoint,
      pathDraftRef,
      shapeDrawStartRef,
    ],
  );

  const handleShapeToolPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): boolean => {
      const start = shapeDrawStartRef.current;
      const tool = activeToolRef.current;
      if (!tool) return false;
      const el = event.currentTarget;
      const rawEnd = framePointFromClient(event.nativeEvent, el);
      const draft = pathDraftRef.current;
      const end =
        draft && isBezierDrawTool(tool)
          ? getPathDraftSnapPoint(draft, rawEnd)
          : rawEnd;

      if (!draft && isBezierDrawTool(tool)) {
        shapeDrawPreviewRef.current = {
          bounds: getDirectedDrawBounds([end]),
          start: end,
          end,
          path: "",
          joints: [end],
        };
        if (!shapeDrawPreviewFrameRef.current) {
          shapeDrawPreviewFrameRef.current = requestAnimationFrame(() => {
            shapeDrawPreviewFrameRef.current = 0;
            setShapeDrawPreview(shapeDrawPreviewRef.current);
          });
        }
        return true;
      }

      if (draft && draft.pointerId === null && isBezierDrawTool(tool)) {
        draft.previewPoint = end;
        const previewSegments = getDraftPreviewSegments(draft);
        const handles = draft.outHandle
          ? [{ anchor: getLastPathPoint(draft), handle: draft.outHandle }]
          : [];
        const joints = getDraftJoints(draft, previewSegments);
        if (
          joints.length > 0 ||
          previewSegments.length > 0 ||
          handles.length > 0
        ) {
          const { bounds, path } = getPenPreviewData(
            previewSegments,
            handles,
            joints,
            draft.closed,
          );
          shapeDrawPreviewRef.current = {
            bounds,
            start: draft.start,
            end,
            path,
            joints,
            handles: handles.length > 0 ? handles : undefined,
          };
          if (!shapeDrawPreviewFrameRef.current) {
            shapeDrawPreviewFrameRef.current = requestAnimationFrame(() => {
              shapeDrawPreviewFrameRef.current = 0;
              setShapeDrawPreview(shapeDrawPreviewRef.current);
            });
          }
        }
        return true;
      }

      if (draft?.pointerId === event.pointerId && isBezierDrawTool(tool)) {
        const segmentStart = getLastPathPoint(draft);
        const downPoint = draft.downPoint ?? segmentStart;
        const draggedHandle =
          getPointDistance(rawEnd, downPoint) >= 3 ? rawEnd : null;
        const incomingHandle = draggedHandle
          ? getMirroredPoint(downPoint, draggedHandle)
          : null;
        draft.current =
          getPointDistance(segmentStart, downPoint) >= 0.5
            ? createPathSegment(
                segmentStart,
                downPoint,
                draft.outHandle,
                incomingHandle,
              )
            : null;
        draft.previewPoint = downPoint;
        const previewSegments = draft.current
          ? [...draft.segments, draft.current]
          : draft.segments;
        const handles = [
          ...(draft.current?.c1
            ? [{ anchor: segmentStart, handle: draft.current.c1 }]
            : []),
          ...(draft.current?.c2
            ? [{ anchor: downPoint, handle: draft.current.c2 }]
            : []),
          ...(incomingHandle && !draft.current
            ? [{ anchor: downPoint, handle: incomingHandle }]
            : []),
          ...(draggedHandle
            ? [{ anchor: downPoint, handle: draggedHandle }]
            : []),
        ];
        const joints = getDraftJoints(draft, previewSegments);
        if (
          previewSegments.length === 0 &&
          handles.length === 0 &&
          joints.length === 0
        )
          return true;
        const { bounds, path } = getPenPreviewData(
          previewSegments,
          handles,
          joints,
          draft.closed,
        );
        shapeDrawPreviewRef.current = {
          bounds,
          start: draft.start,
          end: downPoint,
          path,
          joints,
          handles: handles.length > 0 ? handles : undefined,
        };
        if (!shapeDrawPreviewFrameRef.current) {
          shapeDrawPreviewFrameRef.current = requestAnimationFrame(() => {
            shapeDrawPreviewFrameRef.current = 0;
            setShapeDrawPreview(shapeDrawPreviewRef.current);
          });
        }
        return true;
      }

      if (!start || start.pointerId !== event.pointerId) return false;
      const shouldSnapDraw = event.metaKey || event.ctrlKey;
      const drawEnd =
        shouldSnapDraw && !isPathDrawTool(tool)
          ? getShapeDrawSnapEnd(start, end, event.shiftKey)
          : end;
      if (!shouldSnapDraw || isPathDrawTool(tool)) clearComposeDrawSnapGuides();
      if (tool === "pencil") {
        const lastPoint = start.points[start.points.length - 1] ?? start;
        const distance = Math.hypot(
          drawEnd.x - lastPoint.x,
          drawEnd.y - lastPoint.y,
        );
        if (distance >= 2) start.points.push(drawEnd);
      }
      const drawData = isPathDrawTool(tool)
        ? getPathDrawData(tool, start, drawEnd, start.points)
        : null;
      const bounds =
        drawData?.bounds ?? computeShapeDrawBox(start, drawEnd, event.shiftKey);
      shapeDrawPreviewRef.current = {
        bounds,
        start,
        end: drawEnd,
        points: tool === "pencil" ? [...start.points] : undefined,
        path: tool === "pencil" ? drawData?.path : undefined,
      };
      if (!shapeDrawPreviewFrameRef.current) {
        shapeDrawPreviewFrameRef.current = requestAnimationFrame(() => {
          shapeDrawPreviewFrameRef.current = 0;
          setShapeDrawPreview(shapeDrawPreviewRef.current);
        });
      }
      return true;
    },
    [
      shapeDrawStartRef,
      activeToolRef,
      pathDraftRef,
      shapeDrawPreviewRef,
      shapeDrawPreviewFrameRef,
      setShapeDrawPreview,
      getShapeDrawSnapEnd,
      clearComposeDrawSnapGuides,
    ],
  );

  const handleShapeToolPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): boolean => {
      const tool = activeToolRef.current;
      const draft = pathDraftRef.current;

      if (
        tool &&
        draft?.pointerId === event.pointerId &&
        isBezierDrawTool(tool)
      ) {
        const el = event.currentTarget;
        const rawEnd = framePointFromClient(event.nativeEvent, el);
        const segmentStart = getLastPathPoint(draft);
        const downPoint = draft.downPoint ?? segmentStart;
        const draggedHandle =
          getPointDistance(rawEnd, downPoint) >= 3 ? rawEnd : null;
        const incomingHandle = draggedHandle
          ? getMirroredPoint(downPoint, draggedHandle)
          : null;
        const disconnectedStart = draft.disconnected;
        const segment =
          draft.current ??
          (!disconnectedStart &&
          getPointDistance(segmentStart, downPoint) >= 0.5
            ? createPathSegment(
                segmentStart,
                downPoint,
                draft.outHandle,
                incomingHandle,
              )
            : null);
        const closing =
          draft.segments.length >= 2 &&
          getPointDistance(downPoint, draft.start) <= 8;
        if (segment && getPointDistance(segment.end, segment.start) >= 3) {
          draft.segments.push(
            closing
              ? {
                  ...segment,
                  end: draft.start,
                  c2: incomingHandle ?? draft.start,
                }
              : segment,
          );
        }
        draft.anchor = downPoint;
        draft.outHandle = draggedHandle;
        draft.previewPoint = closing ? null : downPoint;
        draft.closed = closing;
        draft.disconnected = false;
        draft.pointerId = null;
        draft.downPoint = null;
        draft.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        const shouldCommit =
          event.detail >= 2 || (event.nativeEvent as PointerEvent).detail >= 2;
        if (shouldCommit && draft.segments.length > 0) {
          commitPathDraftObject(draft);
          pathDraftRef.current = null;
          shapeDrawPreviewRef.current = null;
          setShapeDrawPreview(null);
        } else if (draft.segments.length > 0) {
          const previewSegments = getDraftPreviewSegments(draft);
          const handles = draft.outHandle
            ? [{ anchor: getLastPathPoint(draft), handle: draft.outHandle }]
            : [];
          const joints = getDraftJoints(draft, previewSegments);
          const { bounds, path } = getPenPreviewData(
            previewSegments,
            handles,
            joints,
            draft.closed,
          );
          shapeDrawPreviewRef.current = {
            bounds,
            start: draft.start,
            end: draft.previewPoint ?? getLastPathPoint(draft),
            path,
            joints,
            handles: handles.length > 0 ? handles : undefined,
          };
          setShapeDrawPreview(shapeDrawPreviewRef.current);
        }
        return true;
      }

      const start = shapeDrawStartRef.current;
      if (!tool || !start || start.pointerId !== event.pointerId) return false;
      shapeDrawStartRef.current = null;
      pathDraftRef.current = null;
      shapeDrawPreviewRef.current = null;
      const shouldSnapDraw = event.metaKey || event.ctrlKey;
      if (shapeDrawPreviewFrameRef.current) {
        cancelAnimationFrame(shapeDrawPreviewFrameRef.current);
        shapeDrawPreviewFrameRef.current = 0;
      }
      setShapeDrawPreview(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);

      const el = event.currentTarget;
      const rawEnd = framePointFromClient(event.nativeEvent, el);
      const end =
        shouldSnapDraw && !isPathDrawTool(tool)
          ? getShapeDrawSnapEnd(start, rawEnd, event.shiftKey)
          : rawEnd;
      clearComposeDrawSnapGuides();
      const minSize = 10;
      if (tool === "pencil") start.points.push(end);
      const points = tool === "pencil" ? start.points : [start, end];
      const { x, y, width, height } = isPathDrawTool(tool)
        ? getPathDrawData(tool, start, end, points).bounds
        : computeShapeDrawBox(start, end, event.shiftKey);
      if (width < minSize && height < minSize) return true;

      const isEllipse = tool === "ellipse";
      const isText = tool === "text";
      const isNullObject = tool === "null";
      const isSvg = isSvgDrawTool(tool);
      const isPattern2d = tool === "pattern2d";
      const id = `${tool}-${Date.now().toString(36)}`;
      const object: FrameObject = {
        id,
        name: getDrawToolName(tool),
        type: isText
          ? "text"
          : isNullObject
            ? "null"
            : isSvg
              ? "svg"
              : isPattern2d
                ? "pattern2d"
                : "rect",
        selector: `[data-object-id='${id}']`,
        bounds: {
          x,
          y,
          width: Math.max(width, minSize),
          height: Math.max(height, minSize),
        },
        content: isText ? "Text" : undefined,
        style: isText
          ? {
              color: "#ffffff",
              fontSize: Math.max(
                16,
                Math.round(Math.max(height, minSize) * 0.6),
              ),
              fontWeight: 400,
              lineHeight: 1.1,
            }
          : isNullObject
            ? { backgroundColor: "transparent" }
            : isSvg
              ? { backgroundColor: "transparent", overflow: "visible" }
              : isPattern2d
                ? { backgroundColor: "transparent", overflow: "hidden" }
                : {
                    backgroundColor: "#D5D5D5",
                    ...(isEllipse ? { borderRadius: 9999 } : {}),
                    ...(tool === "polygon"
                      ? {
                          clipPath:
                            "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
                        }
                      : {}),
                    ...(tool === "star"
                      ? {
                          clipPath:
                            "polygon(50% 0%, 61% 35%, 98% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 2% 35%, 39% 35%)",
                        }
                      : {}),
                  },
      };
      if (isSvg) object.content = getSvgDrawContent(tool, start, end, points);
      if (isPattern2d) {
        object.props = {
          preset: "polkaDots",
          seed: 1,
          ...getPattern2dDefaults("polkaDots"),
        };
      }
      if (part) {
        updateCompositionForTimelinePart(part.id, (composition) => ({
          ...composition,
          objects: [...composition.objects, object],
        }));
        pendingComposeSelectionObjectIdsRef.current = [object.id];
        persistComposeSelection([object.id]);
        activeToolRef.current = null;
        setActiveTool(null);
      }
      return true;
    },
    [
      activeToolRef,
      pathDraftRef,
      shapeDrawStartRef,
      shapeDrawPreviewRef,
      shapeDrawPreviewFrameRef,
      setShapeDrawPreview,
      getShapeDrawSnapEnd,
      clearComposeDrawSnapGuides,
      commitPathDraftObject,
      part,
      updateCompositionForTimelinePart,
      pendingComposeSelectionObjectIdsRef,
      persistComposeSelection,
      activeToolRef,
      setActiveTool,
    ],
  );

  return {
    addNullObjectToFrameCenter,
    createTextObjectAtPoint,
    handleShapeToolPointerDown,
    handleShapeToolPointerMove,
    handleShapeToolPointerUp,
    handlePathControlPointerDown,
    wrappedOnFramePointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (handleShapeToolPointerDown(event)) return;
      onFramePointerDown(event);
    },
    wrappedOnFramePointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (handleShapeToolPointerMove(event)) return;
      onFramePointerMove(event);
    },
    wrappedOnFramePointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      if (handleShapeToolPointerUp(event)) return;
      onFramePointerUp(event);
    },
    wrappedOnFramePointerCancel: (
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      shapeDrawStartRef.current = null;
      pathDraftRef.current = null;
      shapeDrawPreviewRef.current = null;
      if (shapeDrawPreviewFrameRef.current) {
        cancelAnimationFrame(shapeDrawPreviewFrameRef.current);
        shapeDrawPreviewFrameRef.current = 0;
      }
      setShapeDrawPreview(null);
      onFramePointerCancel(event);
    },
    wrappedOnFramePointerLeave: (event: React.PointerEvent<HTMLDivElement>) => {
      shapeDrawPreviewRef.current = null;
      if (shapeDrawPreviewFrameRef.current) {
        cancelAnimationFrame(shapeDrawPreviewFrameRef.current);
        shapeDrawPreviewFrameRef.current = 0;
      }
      setShapeDrawPreview(null);
      onFramePointerMove(event);
    },
    handleObjectCornerRadiusChange,
    handleTextEditEnd,
    updateTextPathOffset,
    commitPathDraftObject,
    updatePathObjectControl,
    deletePathObjectJoint,
    clearComposeDrawSnapGuides,
    getShapeDrawSnapEnd,
  };
}
