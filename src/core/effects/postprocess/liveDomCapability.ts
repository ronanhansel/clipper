export const liveDomPostProcessStorageKey = "clipper:experimental-live-dom-postprocess";

export type LiveDomPostProcessCapability = {
  supported: boolean;
  reason: "available" | "not-opted-in" | "missing-source" | "missing-layout-subtree" | "missing-paint" | "missing-tex-element-image";
  layoutSubtree: "layoutSubtree" | "layoutsubtree" | "style.layoutSubtree" | "style.layoutsubtree" | "canvas.layoutSubtree" | "canvas.layoutsubtree" | "canvas.style.layoutSubtree" | "canvas.style.layoutsubtree" | null;
  paint: "requestPaint" | "paint" | "onpaint" | "canvas.requestPaint" | "canvas.paint" | "canvas.onpaint" | null;
  texElementImage2D: "context" | "extension" | null;
};

export type LiveDomPostProcessPreflight = Omit<LiveDomPostProcessCapability, "texElementImage2D">;

type LiveDomSourceElement = Element & {
  layoutSubtree?: unknown;
  layoutsubtree?: unknown;
  requestPaint?: unknown;
  paint?: unknown;
  onpaint?: unknown;
  style?: CSSStyleDeclaration & { layoutSubtree?: string; layoutsubtree?: string };
};

type LiveDomCanvas = HTMLCanvasElement & LiveDomSourceElement;

export type LiveDomWebGlContext = WebGLRenderingContext & {
  texElementImage2D?: unknown;
  getExtension(name: string): unknown;
};

export type LiveDomTextureUploadPlan = {
  source: "sourceElement" | "sourceCanvas";
  signature: "full" | "format" | "target";
};

export function isLiveDomPostProcessPreviewOptedIn(target: Pick<Window, "localStorage"> & { clipper?: { experimentalHtmlCanvasPostProcess?: boolean } } = window) {
  if (target.clipper?.experimentalHtmlCanvasPostProcess) return true;
  try {
    return target.localStorage.getItem(liveDomPostProcessStorageKey) === "1";
  } catch {
    return false;
  }
}

export function getLiveDomPostProcessCapability(input: { optIn: boolean; sourceElement: Element | null | undefined; canvas?: HTMLCanvasElement | null; gl: LiveDomWebGlContext | null | undefined }): LiveDomPostProcessCapability {
  const preflight = getLiveDomPostProcessPreflight(input);
  if (!preflight.supported) return { ...preflight, texElementImage2D: null };

  const textureUploader = getTexElementImage2DFeature(input.gl);
  if (!textureUploader) return capability(false, "missing-tex-element-image", preflight.layoutSubtree, preflight.paint);

  return { ...preflight, texElementImage2D: textureUploader.kind };
}

export function getLiveDomPostProcessPreflight(input: { optIn: boolean; sourceElement: Element | null | undefined; canvas?: HTMLCanvasElement | null }): LiveDomPostProcessPreflight {
  if (!input.optIn) return preflight(false, "not-opted-in");
  if (!input.sourceElement) return preflight(false, "missing-source");

  const source = input.sourceElement as LiveDomSourceElement;
  const canvas = input.canvas as LiveDomCanvas | null | undefined;
  const layoutSubtree = getLayoutSubtreeFeature(source, canvas);
  if (!layoutSubtree) return preflight(false, "missing-layout-subtree");

  return { supported: true, reason: "available", layoutSubtree, paint: getPaintFeature(source, canvas) };
}

export function prepareLiveDomPostProcessSource(sourceElement: Element, canvas: HTMLCanvasElement) {
  const source = sourceElement as LiveDomSourceElement;
  const liveCanvas = canvas as LiveDomCanvas;
  const layoutSubtree = getLayoutSubtreeFeature(source, liveCanvas);
  try {
    if (layoutSubtree === "layoutSubtree" && source.layoutSubtree !== true) source.layoutSubtree = true;
    else if (layoutSubtree === "layoutsubtree" && source.layoutsubtree !== true) source.layoutsubtree = true;
    else if (layoutSubtree === "style.layoutSubtree" && source.style && source.style.layoutSubtree !== "paint") source.style.layoutSubtree = "paint";
    else if (layoutSubtree === "style.layoutsubtree" && source.style && source.style.layoutsubtree !== "paint") source.style.layoutsubtree = "paint";
    else if (layoutSubtree === "canvas.layoutSubtree" && liveCanvas.layoutSubtree !== true) liveCanvas.layoutSubtree = true;
    else if (layoutSubtree === "canvas.layoutsubtree" && liveCanvas.layoutsubtree !== true) liveCanvas.layoutsubtree = true;
    else if (layoutSubtree === "canvas.style.layoutSubtree" && liveCanvas.style?.layoutSubtree !== "paint") liveCanvas.style.layoutSubtree = "paint";
    else if (layoutSubtree === "canvas.style.layoutsubtree" && liveCanvas.style?.layoutsubtree !== "paint") liveCanvas.style.layoutsubtree = "paint";
  } catch {
    /* Experimental API shape varies across Canary builds. */
  }

  invokePaint(source, liveCanvas);
}

export function uploadLiveDomElementToTexture(gl: LiveDomWebGlContext, sourceElement: Element, sourceCanvas?: HTMLCanvasElement | null) {
  return uploadLiveDomElementToTextureWithPlan(gl, sourceElement, sourceCanvas).uploaded;
}

export function uploadLiveDomElementToTextureWithPlan(gl: LiveDomWebGlContext, sourceElement: Element, sourceCanvas?: HTMLCanvasElement | null, preferredPlan: LiveDomTextureUploadPlan | null = null): { uploaded: boolean; plan: LiveDomTextureUploadPlan | null } {
  const uploader = getTexElementImage2DFeature(gl);
  if (!uploader) return { uploaded: false, plan: null };
  return uploadWithFeature(gl, uploader, sourceElement, sourceCanvas, preferredPlan);
}

export class LiveDomCapabilityProbe {
  private textureUploaderKind: LiveDomPostProcessCapability["texElementImage2D"] | undefined;

  getCapability(input: { optIn: boolean; sourceElement: Element | null | undefined; canvas?: HTMLCanvasElement | null; gl: LiveDomWebGlContext | null | undefined }): LiveDomPostProcessCapability {
    const preflight = getLiveDomPostProcessPreflight(input);
    if (!preflight.supported) return { ...preflight, texElementImage2D: null };

    if (this.textureUploaderKind !== undefined) {
      return this.textureUploaderKind ? { ...preflight, texElementImage2D: this.textureUploaderKind } : capability(false, "missing-tex-element-image", preflight.layoutSubtree, preflight.paint);
    }

    const textureUploader = getTexElementImage2DFeature(input.gl);
    this.textureUploaderKind = textureUploader?.kind ?? null;
    if (!this.textureUploaderKind) return capability(false, "missing-tex-element-image", preflight.layoutSubtree, preflight.paint);
    return { ...preflight, texElementImage2D: this.textureUploaderKind };
  }

  clear() {
    this.textureUploaderKind = undefined;
  }
}

export class LiveDomTextureUploader {
  private feature: { kind: "context" | "extension"; call: (...args: unknown[]) => unknown } | null | undefined;
  private plan: LiveDomTextureUploadPlan | null = null;

  upload(gl: LiveDomWebGlContext, sourceElement: Element, sourceCanvas?: HTMLCanvasElement | null) {
    this.feature ??= getTexElementImage2DFeature(gl);
    if (!this.feature) return false;
    const result = uploadWithFeature(gl, this.feature, sourceElement, sourceCanvas, this.plan);
    this.plan = result.plan;
    return result.uploaded;
  }

  clear() {
    this.feature = undefined;
    this.plan = null;
  }
}

function capability(supported: boolean, reason: LiveDomPostProcessCapability["reason"], layoutSubtree: LiveDomPostProcessCapability["layoutSubtree"] = null, paint: LiveDomPostProcessCapability["paint"] = null): LiveDomPostProcessCapability {
  return { supported, reason, layoutSubtree, paint, texElementImage2D: null };
}

function preflight(supported: boolean, reason: LiveDomPostProcessCapability["reason"], layoutSubtree: LiveDomPostProcessCapability["layoutSubtree"] = null, paint: LiveDomPostProcessCapability["paint"] = null): LiveDomPostProcessPreflight {
  return { supported, reason, layoutSubtree, paint };
}

function getLayoutSubtreeFeature(source: LiveDomSourceElement, canvas: LiveDomCanvas | null | undefined): LiveDomPostProcessCapability["layoutSubtree"] {
  if ("layoutSubtree" in (canvas ?? {})) return "canvas.layoutSubtree";
  if ("layoutsubtree" in (canvas ?? {})) return "canvas.layoutsubtree";
  if (canvas?.style && "layoutSubtree" in canvas.style) return "canvas.style.layoutSubtree";
  if (canvas?.style && "layoutsubtree" in canvas.style) return "canvas.style.layoutsubtree";
  if ("layoutSubtree" in source) return "layoutSubtree";
  if ("layoutsubtree" in source) return "layoutsubtree";
  if (source.style && "layoutSubtree" in source.style) return "style.layoutSubtree";
  if (source.style && "layoutsubtree" in source.style) return "style.layoutsubtree";
  return null;
}

function getPaintFeature(source: LiveDomSourceElement, canvas: LiveDomCanvas | null | undefined): LiveDomPostProcessCapability["paint"] {
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
    else if (paint === "onpaint" && typeof source.onpaint === "function") (source.onpaint as () => void)();
    else if (paint === "canvas.requestPaint") (canvas.requestPaint as () => void)();
    else if (paint === "canvas.paint") (canvas.paint as () => void)();
    else if (paint === "canvas.onpaint" && typeof canvas.onpaint === "function") (canvas.onpaint as () => void)();
  } catch {
    /* Experimental paint invalidation should not break fallback preview. */
  }
}

function getTexElementImage2DFeature(gl: LiveDomWebGlContext | null | undefined): { kind: "context" | "extension"; call: (...args: unknown[]) => unknown } | null {
  if (!gl) return null;
  if (typeof gl.texElementImage2D === "function") return { kind: "context", call: (gl.texElementImage2D as (...args: unknown[]) => unknown).bind(gl) };
  for (const name of ["WEBGL_html_canvas_draw_element", "WEBGL_canvas_draw_element", "CHROMIUM_webgl_tex_element_image", "WEBGL_tex_element_image_2d"]) {
    const extension = gl.getExtension(name) as { texElementImage2D?: unknown } | null;
    if (typeof extension?.texElementImage2D === "function") return { kind: "extension", call: (extension.texElementImage2D as (...args: unknown[]) => unknown).bind(extension) };
  }
  return null;
}

function uploadWithFeature(gl: LiveDomWebGlContext, uploader: { call: (...args: unknown[]) => unknown }, sourceElement: Element, sourceCanvas: HTMLCanvasElement | null | undefined, preferredPlan: LiveDomTextureUploadPlan | null): { uploaded: boolean; plan: LiveDomTextureUploadPlan | null } {
  const plans = getUploadPlans(sourceCanvas);
  const orderedPlans = preferredPlan && plans.some((plan) => plan.source === preferredPlan.source && plan.signature === preferredPlan.signature) ? [preferredPlan, ...plans.filter((plan) => plan.source !== preferredPlan.source || plan.signature !== preferredPlan.signature)] : plans;
  for (const plan of orderedPlans) {
    const source = plan.source === "sourceCanvas" ? sourceCanvas : sourceElement;
    if (!source) continue;
    try {
      const result = uploader.call(...getUploadArgs(gl, plan.signature), source);
      if (result !== false) return { uploaded: true, plan };
    } catch {
      /* Try the next known draft signature/source shape. */
    }
  }
  return { uploaded: false, plan: null };
}

function getUploadPlans(sourceCanvas: HTMLCanvasElement | null | undefined): LiveDomTextureUploadPlan[] {
  const sources: LiveDomTextureUploadPlan["source"][] = sourceCanvas ? ["sourceElement", "sourceCanvas"] : ["sourceElement"];
  const signatures: LiveDomTextureUploadPlan["signature"][] = ["full", "format", "target"];
  return sources.flatMap((source) => signatures.map((signature) => ({ source, signature })));
}

function getUploadArgs(gl: LiveDomWebGlContext, signature: LiveDomTextureUploadPlan["signature"]) {
  if (signature === "full") return [gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE];
  if (signature === "format") return [gl.TEXTURE_2D, 0, gl.RGBA];
  return [gl.TEXTURE_2D];
}
