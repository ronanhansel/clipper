export type LiveDomPostProcessCapability = {
  supported: boolean;
  reason:
    | "available"
    | "missing-source"
    | "missing-layout-subtree"
    | "missing-paint"
    | "missing-draw-element-image";
  layoutSubtree:
    | "layoutSubtree"
    | "layoutsubtree"
    | "style.layoutSubtree"
    | "style.layoutsubtree"
    | "canvas.layoutSubtree"
    | "canvas.layoutsubtree"
    | "canvas.style.layoutSubtree"
    | "canvas.style.layoutsubtree"
    | null;
  paint:
    | "requestPaint"
    | "paint"
    | "onpaint"
    | "canvas.requestPaint"
    | "canvas.paint"
    | "canvas.onpaint"
    | null;
  drawElementImage: "context" | null;
};

export type LiveDomPostProcessPreflight = Omit<
  LiveDomPostProcessCapability,
  "drawElementImage"
>;

type LiveDomSourceElement = Element & {
  layoutSubtree?: unknown;
  layoutsubtree?: unknown;
  requestPaint?: unknown;
  paint?: unknown;
  onpaint?: unknown;
  style?: CSSStyleDeclaration & {
    layoutSubtree?: string;
    layoutsubtree?: string;
  };
};

type LiveDomCanvas = HTMLCanvasElement & LiveDomSourceElement;

type LiveDomCanvasRenderingContext2D = CanvasRenderingContext2D & {
  drawElementImage?: unknown;
};

export function getLiveDomPostProcessCapability(input: {
  sourceElement: Element | null | undefined;
  canvas?: HTMLCanvasElement | null;
}): LiveDomPostProcessCapability {
  const preflight = getLiveDomPostProcessPreflight(input);
  if (!preflight.supported) return { ...preflight, drawElementImage: null };

  const capture = getDrawElementImageFeature(input.canvas);
  if (!capture)
    return capability(
      false,
      "missing-draw-element-image",
      preflight.layoutSubtree,
      preflight.paint,
    );

  return { ...preflight, drawElementImage: capture.kind };
}

export function getLiveDomPostProcessPreflight(input: {
  sourceElement: Element | null | undefined;
  canvas?: HTMLCanvasElement | null;
}): LiveDomPostProcessPreflight {
  if (!input.sourceElement) return preflight(false, "missing-source");

  const source = input.sourceElement as LiveDomSourceElement;
  const canvas = input.canvas as LiveDomCanvas | null | undefined;
  const layoutSubtree = getLayoutSubtreeFeature(source, canvas);
  if (!layoutSubtree) return preflight(false, "missing-layout-subtree");

  return {
    supported: true,
    reason: "available",
    layoutSubtree,
    paint: getPaintFeature(source, canvas),
  };
}

export function prepareLiveDomPostProcessSource(
  sourceElement: Element,
  canvas: HTMLCanvasElement,
) {
  const source = sourceElement as LiveDomSourceElement;
  const liveCanvas = canvas as LiveDomCanvas;
  const layoutSubtree = getLayoutSubtreeFeature(source, liveCanvas);
  try {
    if (layoutSubtree === "layoutSubtree" && source.layoutSubtree !== true)
      source.layoutSubtree = true;
    else if (layoutSubtree === "layoutsubtree" && source.layoutsubtree !== true)
      source.layoutsubtree = true;
    else if (
      layoutSubtree === "style.layoutSubtree" &&
      source.style &&
      source.style.layoutSubtree !== "paint"
    )
      source.style.layoutSubtree = "paint";
    else if (
      layoutSubtree === "style.layoutsubtree" &&
      source.style &&
      source.style.layoutsubtree !== "paint"
    )
      source.style.layoutsubtree = "paint";
    else if (
      layoutSubtree === "canvas.layoutSubtree" &&
      liveCanvas.layoutSubtree !== true
    )
      liveCanvas.layoutSubtree = true;
    else if (
      layoutSubtree === "canvas.layoutsubtree" &&
      liveCanvas.layoutsubtree !== true
    )
      liveCanvas.layoutsubtree = true;
    else if (
      layoutSubtree === "canvas.style.layoutSubtree" &&
      liveCanvas.style?.layoutSubtree !== "paint"
    )
      liveCanvas.style.layoutSubtree = "paint";
    else if (
      layoutSubtree === "canvas.style.layoutsubtree" &&
      liveCanvas.style?.layoutsubtree !== "paint"
    )
      liveCanvas.style.layoutsubtree = "paint";
  } catch {
    /* Experimental API shape varies across Canary builds. */
  }

  invokePaint(source, liveCanvas);
}

export function captureLiveDomElementToCanvas(
  sourceElement: Element,
  sourceCanvas: HTMLCanvasElement | null | undefined,
  captureCanvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const captureSource = sourceCanvas ?? captureCanvas;
  const capture = getDrawElementImageFeature(captureSource);
  if (!capture) return false;
  captureCanvas.width = width;
  captureCanvas.height = height;
  try {
    capture.context.clearRect(0, 0, width, height);
    capture.call(sourceElement, 0, 0, width, height);
    if (captureSource !== captureCanvas)
      copyCaptureCanvas(captureSource, captureCanvas, width, height);
    return true;
  } catch {
    return false;
  }
}

export class LiveDomCapabilityProbe {
  private drawElementImageKind:
    | LiveDomPostProcessCapability["drawElementImage"]
    | undefined;

  getCapability(input: {
    sourceElement: Element | null | undefined;
    canvas?: HTMLCanvasElement | null;
  }): LiveDomPostProcessCapability {
    const preflight = getLiveDomPostProcessPreflight(input);
    if (!preflight.supported) return { ...preflight, drawElementImage: null };

    if (this.drawElementImageKind !== undefined) {
      return this.drawElementImageKind
        ? { ...preflight, drawElementImage: this.drawElementImageKind }
        : capability(
            false,
            "missing-draw-element-image",
            preflight.layoutSubtree,
            preflight.paint,
          );
    }

    const capture = getDrawElementImageFeature(input.canvas);
    this.drawElementImageKind = capture?.kind ?? null;
    if (!this.drawElementImageKind)
      return capability(
        false,
        "missing-draw-element-image",
        preflight.layoutSubtree,
        preflight.paint,
      );
    return { ...preflight, drawElementImage: this.drawElementImageKind };
  }

  clear() {
    this.drawElementImageKind = undefined;
  }
}

function capability(
  supported: boolean,
  reason: LiveDomPostProcessCapability["reason"],
  layoutSubtree: LiveDomPostProcessCapability["layoutSubtree"] = null,
  paint: LiveDomPostProcessCapability["paint"] = null,
): LiveDomPostProcessCapability {
  return { supported, reason, layoutSubtree, paint, drawElementImage: null };
}

function preflight(
  supported: boolean,
  reason: LiveDomPostProcessCapability["reason"],
  layoutSubtree: LiveDomPostProcessCapability["layoutSubtree"] = null,
  paint: LiveDomPostProcessCapability["paint"] = null,
): LiveDomPostProcessPreflight {
  return { supported, reason, layoutSubtree, paint };
}

function getLayoutSubtreeFeature(
  source: LiveDomSourceElement,
  canvas: LiveDomCanvas | null | undefined,
): LiveDomPostProcessCapability["layoutSubtree"] {
  if ("layoutSubtree" in (canvas ?? {})) return "canvas.layoutSubtree";
  if ("layoutsubtree" in (canvas ?? {})) return "canvas.layoutsubtree";
  if (canvas?.style && "layoutSubtree" in canvas.style)
    return "canvas.style.layoutSubtree";
  if (canvas?.style && "layoutsubtree" in canvas.style)
    return "canvas.style.layoutsubtree";
  if ("layoutSubtree" in source) return "layoutSubtree";
  if ("layoutsubtree" in source) return "layoutsubtree";
  if (source.style && "layoutSubtree" in source.style)
    return "style.layoutSubtree";
  if (source.style && "layoutsubtree" in source.style)
    return "style.layoutsubtree";
  return null;
}

function getPaintFeature(
  source: LiveDomSourceElement,
  canvas: LiveDomCanvas | null | undefined,
): LiveDomPostProcessCapability["paint"] {
  if (typeof source.requestPaint === "function") return "requestPaint";
  if (typeof source.paint === "function") return "paint";
  if ("onpaint" in source) return "onpaint";
  if (typeof canvas?.requestPaint === "function") return "canvas.requestPaint";
  if (typeof canvas?.paint === "function") return "canvas.paint";
  if (canvas && "onpaint" in canvas) return "canvas.onpaint";
  return null;
}

function invokePaint(source: LiveDomSourceElement, canvas: LiveDomCanvas) {
  const paint = getPaintFeature(source, canvas);
  try {
    if (paint === "requestPaint") (source.requestPaint as () => void)();
    else if (paint === "paint") (source.paint as () => void)();
    else if (paint === "onpaint" && typeof source.onpaint === "function")
      (source.onpaint as () => void)();
    else if (paint === "canvas.requestPaint")
      (canvas.requestPaint as () => void)();
    else if (paint === "canvas.paint") (canvas.paint as () => void)();
    else if (paint === "canvas.onpaint" && typeof canvas.onpaint === "function")
      (canvas.onpaint as () => void)();
  } catch {
    /* Experimental paint invalidation should not break fallback preview. */
  }
}

function getDrawElementImageFeature(
  canvas: HTMLCanvasElement | null | undefined,
): {
  kind: "context";
  context: LiveDomCanvasRenderingContext2D;
  call: (
    element: Element,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => unknown;
} | null {
  const context = canvas?.getContext("2d") as
    | LiveDomCanvasRenderingContext2D
    | null
    | undefined;
  if (!context || typeof context.drawElementImage !== "function") return null;
  return {
    kind: "context",
    context,
    call: context.drawElementImage.bind(context) as (
      element: Element,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => unknown,
  };
}

function copyCaptureCanvas(
  sourceCanvas: HTMLCanvasElement,
  captureCanvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const context = captureCanvas.getContext("2d");
  if (!context) throw new Error("Missing live DOM capture canvas context");
  context.clearRect(0, 0, width, height);
  context.drawImage(sourceCanvas, 0, 0, width, height);
}
