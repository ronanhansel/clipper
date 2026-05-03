import { buildLinearTimeline } from "../../core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type FrameObject, type Scene } from "../../core/types";

type FastCanvasRenderOptions = {
  canvas: HTMLCanvasElement;
  scene: Scene;
  sceneTime: number;
};

export function renderSceneToFastCanvas({ canvas, scene, sceneTime }: FastCanvasRenderOptions) {
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Fast canvas export could not acquire a 2D context.");

  const part = getActiveFastCanvasPart(scene, sceneTime);
  paintBackground(context, part?.frame.style.background ?? "#000000");
  if (!part) return;

  paintBackgroundLayer(context, part.background);
  for (const object of part.objects) paintObject(context, object);
}

export function getActiveFastCanvasPart(scene: Scene, sceneTime: number) {
  return buildLinearTimeline(scene).find((part) => sceneTime >= part.start && sceneTime < part.end) ?? null;
}

function paintBackground(context: CanvasRenderingContext2D, background: unknown) {
  context.save();
  context.fillStyle = typeof background === "string" || typeof background === "number" ? String(background) : "#000000";
  context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.restore();
}

function paintBackgroundLayer(context: CanvasRenderingContext2D, background: CompositionClip["background"]) {
  if (background.hidden) return;
  paintBackground(context, background.style.background ?? "transparent");
  for (const object of background.elements) paintObject(context, object);
}

function paintObject(context: CanvasRenderingContext2D, object: FrameObject) {
  if (object.hidden) return;
  context.save();
  context.globalAlpha = getNumber(object.style.opacity, 1);
  if (object.type === "text") paintText(context, object);
  else paintRect(context, object);
  context.restore();
}

function paintRect(context: CanvasRenderingContext2D, object: FrameObject) {
  const { x, y, width, height } = object.bounds;
  const radius = getNumber(object.style.borderRadius, 0);
  context.fillStyle = getPaint(object.style.background ?? object.style.backgroundColor ?? "transparent");
  if (radius > 0) roundedRect(context, x, y, width, height, radius);
  else context.beginPath(), context.rect(x, y, width, height);
  context.fill();
}

function paintText(context: CanvasRenderingContext2D, object: FrameObject) {
  const { x, y, width } = object.bounds;
  const fontSize = getNumber(object.style.fontSize, 48);
  const fontFamily = String(object.style.fontFamily ?? "Inter, Arial, sans-serif");
  const fontWeight = String(object.style.fontWeight ?? 600);
  const lineHeight = getNumber(object.style.lineHeight, fontSize * 1.2);
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  context.fillStyle = getPaint(object.style.color ?? "#ffffff");
  context.textBaseline = "top";
  wrapText(context, object.content ?? object.richText?.map((segment) => segment.text).join("") ?? "", x, y, width, lineHeight);
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  let line = "";
  let lineY = y;
  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (line && context.measureText(nextLine).width > maxWidth) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = nextLine;
    }
  }
  if (line) context.fillText(line, x, lineY);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getPaint(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "transparent");
}
