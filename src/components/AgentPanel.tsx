import {
  Component as ReactComponent,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Copy, Pause, Play } from "lucide-react";
import { buttonBase } from "../app/config";
import { clipperHost, type TemplateBundle } from "../app/clipperHost";
import { compositionFromSource } from "../core/compositionSource";
import type { Part } from "../core/types";
import { FramePreview } from "./preview/FramePreview";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const defaultSkill = {
  name: "Clipper composition",
  location: ".agents/skills/clipper-hi-composition/SKILL.md",
  description:
    "Create Clipper TypeScript compositions with paper editorial hi-style motion.",
  source: `---
name: clipper-hi-composition
description: Create Clipper composition source files matching hi project editorial paper motion style.
user-invocable: true
---

# Clipper Hi Composition Style

Inspect clipper/projects/hi/file-manager/compositions before writing.
Use @clipper/composition-api TypeScript sources, not normalized JSON.
Use 1920x1080 paper editorial frame, central WebLayer stage, Text typography overlays, deterministic SVG/CSS motion, and npm run typecheck verification.
`,
};

const templatePreviewBase = (template: TemplateBundle): Part => ({
  id: template.id,
  filePath: template.entry,
  duration: 1,
  frame: { width: 1920, height: 1080, style: { background: "#07080b" } },
  background: {
    id: "background",
    name: template.title,
    style: { background: "#07080b" },
    elements: [],
  },
  objects: [],
  snapshot: [],
  motionMarkers: [],
});

export function AgentPanel({
  part,
  projectDirectory,
  onReloadProject,
}: {
  part: Part;
  projectDirectory?: string;
  sourceStatus: string;
  agentContext: unknown;
  onReloadProject?: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<TemplateBundle[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [skillCopied, setSkillCopied] = useState(false);
  const copiedResetRef = useRef<number | null>(null);
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ??
    templates[0];

  useEffect(() => {
    let cancelled = false;
    void clipperHost
      .listTemplates()
      .then((loadedTemplates) => {
        if (cancelled) return;
        setTemplates(loadedTemplates);
        setTemplatesError(null);
        setSelectedTemplateId((id) =>
          loadedTemplates.some((template) => template.id === id)
            ? id
            : (loadedTemplates[0]?.id ?? ""),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setTemplates([]);
        setTemplatesError(errorMessage(error));
        setSelectedTemplateId("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (copiedResetRef.current !== null) {
        window.clearTimeout(copiedResetRef.current);
      }
    },
    [],
  );

  async function handleCopySkill() {
    await clipperHost.copyText(defaultSkill.source);
    setSkillCopied(true);
    if (copiedResetRef.current !== null) {
      window.clearTimeout(copiedResetRef.current);
    }
    copiedResetRef.current = window.setTimeout(() => {
      setSkillCopied(false);
      copiedResetRef.current = null;
    }, 1400);
  }

  return (
    <div className="grid gap-4">
      <section>
        <div className="overflow-hidden rounded-2xl border border-[#242832] bg-[#121316]">
          <div className="flex items-center justify-between border-b border-[#242832] px-4 py-3 text-[#a7a9b2]">
            <div className="flex min-w-0 items-center gap-2 font-mono text-sm">
              <span className="grid size-4 place-items-center rounded-full border border-[#777a84] text-[10px] font-bold">
                S
              </span>
              <span className="truncate">SKILL.md</span>
            </div>
            <button
              className={`grid size-8 shrink-0 place-items-center rounded-lg transition active:scale-95 ${skillCopied ? "bg-[#1e3a2d] text-[#86efac]" : "text-[#b8bac4] hover:bg-[#20232b] hover:text-white"}`}
              aria-label={skillCopied ? "Copied skill" : "Copy skill"}
              type="button"
              onClick={() => void handleCopySkill()}
            >
              <span
                className={`transition duration-200 ${skillCopied ? "scale-110" : "scale-100"}`}
              >
                {skillCopied ? <Check size={15} /> : <Copy size={15} />}
              </span>
            </button>
          </div>
          <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-6 text-[#d9dbe3]">
            {defaultSkill.source.trim()}
          </pre>
        </div>
      </section>

      <section>
        <button
          className={`${buttonBase} justify-self-start`}
          type="button"
          onClick={() => setTemplatesOpen(true)}
        >
          Browse templates
        </button>
      </section>

      <TemplateDialog
        loadError={templatesError}
        open={templatesOpen}
        selectedTemplate={selectedTemplate}
        selectedTemplateId={selectedTemplateId}
        templates={templates}
        onOpenChange={setTemplatesOpen}
        onSelectTemplate={setSelectedTemplateId}
        currentFilePath={part.filePath}
        projectDirectory={projectDirectory}
        onReloadProject={onReloadProject}
      />
    </div>
  );
}

function TemplateDialog({
  loadError,
  open,
  selectedTemplate,
  selectedTemplateId,
  templates,
  currentFilePath,
  projectDirectory,
  onOpenChange,
  onSelectTemplate,
  onReloadProject,
}: {
  loadError: string | null;
  open: boolean;
  selectedTemplate: TemplateBundle | undefined;
  selectedTemplateId: string;
  templates: TemplateBundle[];
  currentFilePath: string;
  projectDirectory?: string;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (id: string) => void;
  onReloadProject?: () => Promise<void>;
}) {
  const [previewPart, setPreviewPart] = useState<Part | undefined>();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingSource, setSavingSource] = useState(false);

  useEffect(() => {
    setSaveError(null);
    let cancelled = false;
    async function loadPreview() {
      if (!selectedTemplate) {
        setPreviewPart(undefined);
        setPreviewError(loadError);
        return;
      }
      setPreviewPart(undefined);
      setPreviewError(null);
      const entrySource = selectedTemplate.files[selectedTemplate.entry];
      if (entrySource === undefined)
        throw new Error(
          `Template entry file missing: ${selectedTemplate.entry}`,
        );
      const part = await compositionFromSource(
        templatePreviewBase(selectedTemplate),
        entrySource,
        (relativePath) => {
          const sourcePath = relativePath.startsWith("source/")
            ? relativePath
            : `source/${relativePath}`;
          const content = selectedTemplate.files[sourcePath];
          if (content === undefined)
            throw new Error(`Template source file missing: ${relativePath}`);
          return Promise.resolve(content);
        },
      );
      if (!cancelled) setPreviewPart(part);
    }
    void loadPreview().catch((error) => {
      if (!cancelled) {
        setPreviewPart(undefined);
        setPreviewError(errorMessage(error));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadError, selectedTemplate]);

  useEffect(() => {
    if (open) setSaveError(null);
  }, [open]);

  async function saveSource() {
    if (!selectedTemplate || savingSource) return;
    setSaveError(null);
    setSavingSource(true);
    try {
      const projectRoot = getProjectTemplateSourceRoot(
        currentFilePath,
        projectDirectory,
      );
      const folderPath = await nextAvailableTemplateFolder(
        projectRoot,
        selectedTemplate.slug,
      );
      await clipperHost.createDirectory(folderPath);
      await Promise.all(
        Object.entries(selectedTemplate.files).map(([fileName, content]) =>
          clipperHost.writeTextFile(
            `${folderPath}/${fileName.replace(/^source\//, "")}`,
            content,
          ),
        ),
      );
      await onReloadProject?.();
      setSaveError(null);
      onOpenChange(false);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSavingSource(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(720px,calc(100vh-56px))] w-[min(1120px,calc(100vw-42px))] gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] bg-[#101116]">
          <aside className="border-r border-[#2d313b] bg-[#15171e] p-3">
            <DialogHeader className="mb-3">
              <DialogTitle>Templates</DialogTitle>
            </DialogHeader>
            {loadError ? (
              <div className="mb-3 rounded-xl border border-[#3b2a2a] bg-[#1a0f10] p-3 text-xs leading-5 text-[#ffb4b4]">
                {loadError}
              </div>
            ) : null}
            <div className="grid gap-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  className={`grid gap-1 rounded-xl border px-3 py-3 text-left transition ${selectedTemplateId === template.id ? "border-[var(--clipper-accent)] bg-[#0f1117] text-white" : "border-[#2d313b] bg-[#171920] text-[#9297a3] hover:bg-[#1e222c] hover:text-[#dfe2ea]"}`}
                  onClick={() => onSelectTemplate(template.id)}
                >
                  <span className="text-sm font-extrabold">
                    {template.title}
                  </span>
                  {template.author.github ? (
                    <span className="text-xs font-medium leading-4 text-[#6f7684]">
                      {template.title} • {template.author.github}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </aside>
          <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-5">
            <div>
              <h2 className="text-lg font-extrabold text-white">
                {selectedTemplate?.title}
              </h2>
            </div>
            <div className="grid min-h-0 place-items-center">
              <TemplateLivePreview
                autoPlay={open}
                error={previewError}
                part={previewPart}
                resetKey={`${open}:${selectedTemplateId}`}
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              {saveError ? (
                <div className="max-w-[520px] rounded-lg border border-[#3b2a2a] bg-[#1a0f10] px-3 py-2 text-xs leading-5 text-[#ffb4b4]">
                  {saveError}
                </div>
              ) : null}
              <button
                className="justify-self-end rounded-[9px] border border-[var(--clipper-accent)] bg-[var(--clipper-accent)] px-4 py-2 text-sm font-extrabold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)] disabled:cursor-not-allowed disabled:opacity-55"
                type="button"
                disabled={!selectedTemplate || savingSource}
                onClick={() => void saveSource()}
              >
                {savingSource ? "Saving..." : "Save Source"}
              </button>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateLivePreview({
  autoPlay,
  error,
  part,
  resetKey,
}: {
  autoPlay: boolean;
  error: string | null;
  part: Part | undefined;
  resetKey: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const frameViewportRef = useRef<HTMLDivElement | null>(null);
  const dragSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.25);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setScale(Math.min(rect.width / 1920, rect.height / 1080));
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!part) return;
    setPreviewTime(0);
    setIsPlaying(autoPlay);
  }, [autoPlay, part?.id, part?.duration, resetKey]);

  useEffect(() => {
    if (!isPlaying || !part) return;
    const duration = part.duration;
    let frame = 0;
    let lastTime = performance.now();
    function tick(now: number) {
      const elapsed = (now - lastTime) / 1000;
      lastTime = now;
      setPreviewTime((time) => {
        const nextTime = Math.min(time + elapsed, duration);
        if (nextTime >= duration) setIsPlaying(false);
        return nextTime;
      });
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, part]);

  if (error)
    return (
      <TemplatePreviewErrorFrame
        message={error}
        title="Template preview failed"
      />
    );
  if (!part)
    return (
      <div className="aspect-video border border-[#2d313b] bg-[#07080b]" />
    );

  function togglePlayback() {
    if (!part) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    setPreviewTime((time) => (time >= part.duration ? 0 : time));
    setIsPlaying(true);
  }

  return (
    <div
      ref={containerRef}
      className="group relative aspect-video w-full overflow-hidden border border-[#2d313b] bg-[#07080b]"
    >
      <div className="grid h-full w-full place-items-center">
        <TemplatePreviewErrorBoundary resetKey={resetKey}>
          <FramePreview
            cameraRef={cameraRef}
            dragBox={null}
            dragSelectionBoxRef={dragSelectionBoxRef}
            framePickPoint={null}
            focusPicking={false}
            trackerPicking={false}
            canSelectObjects={false}
            cameraTransform={{
              x: 0,
              y: 0,
              z: 0,
              scale: 1,
              rotation: 0,
              rotateX: 0,
              rotateY: 0,
              perspective: 1800,
              motionBlur: 0,
            }}
            frameViewportRef={frameViewportRef}
            frameScale={scale}
            isPlaying={isPlaying}
            part={part}
            partStart={0}
            adjustmentLayers={[]}
            playbackClock={null}
            previewTime={previewTime}
            sceneTime={previewTime}
            timelineMode="composition"
            motionLayers={[]}
            hiddenMotionLayerIds={new Set()}
            pickingTranslationPosition={false}
            pickingZoomFocus={false}
            selectedObjects={[]}
            marqueeDragging={false}
            editingTextObjectId={null}
            onFramePointerCancel={() => {}}
            onFramePointerDown={() => {}}
            onFramePointerDownCapture={() => {}}
            onFramePointerMove={() => {}}
            onFramePointerLeave={() => {}}
            onFramePointerUp={() => {}}
            onObjectPointerDown={() => {}}
            onObjectResizePointerDown={() => {}}
            onTextEditCommit={() => {}}
            onTextObjectDoubleClick={() => {}}
            onTrackerTargetPick={() => {}}
          />
        </TemplatePreviewErrorBoundary>
      </div>
      <div className="absolute inset-x-4 bottom-3 flex translate-y-2 items-center gap-3 rounded-full border border-white/10 bg-[#10131b]/80 px-3 py-2 text-[11px] text-[#cfd2db] opacity-0 backdrop-blur transition group-hover:translate-y-0 group-hover:opacity-100">
        <button
          className="grid size-7 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          type="button"
          onClick={togglePlayback}
          aria-label={
            isPlaying ? "Pause template preview" : "Play template preview"
          }
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span className="w-9 text-right tabular-nums">
          {formatTime(previewTime)}
        </span>
        <input
          className="min-w-0 flex-1 accent-[var(--clipper-accent)]"
          min={0}
          max={part.duration}
          step={0.01}
          type="range"
          value={previewTime}
          onChange={(event) =>
            setPreviewTime(Math.min(Number(event.target.value), part.duration))
          }
        />
        <span className="w-7 tabular-nums">{part.duration.toFixed(0)}s</span>
      </div>
    </div>
  );
}

class TemplatePreviewErrorBoundary extends ReactComponent<
  { children: ReactNode; resetKey: string },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: errorMessage(error) };
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error)
      this.setState({ error: null });
  }

  componentDidCatch(error: unknown) {
    console.error("Template preview render failed", error);
  }

  render() {
    if (this.state.error)
      return (
        <TemplatePreviewErrorFrame
          message={this.state.error}
          title="Template render failed"
        />
      );
    return this.props.children;
  }
}

function TemplatePreviewErrorFrame({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <div className="grid aspect-video w-full place-items-center border border-[#3b2a2a] bg-[#12090b] p-6 text-center">
      <div className="max-w-[560px]">
        <div className="text-sm font-extrabold text-[#ffb4b4]">{title}</div>
        <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap break-words text-left text-xs leading-5 text-[#f2c6c6]">
          {message}
        </pre>
      </div>
    </div>
  );
}

function formatTime(time: number) {
  const seconds = Math.max(0, Math.floor(time));
  return `0:${String(seconds).padStart(2, "0")}`;
}

function getProjectTemplateSourceRoot(
  filePath: string,
  projectDirectory?: string,
) {
  if (projectDirectory)
    return `${normalizeClipperPath(projectDirectory)}/file-manager`;
  const relativePath = normalizeClipperPath(filePath);
  const index = relativePath.indexOf("/file-manager/");
  if (index < 0) {
    throw new Error(
      "Cannot find project file-manager for current composition.",
    );
  }
  return `${relativePath.slice(0, index)}/file-manager`;
}

function normalizeClipperPath(filePath: string) {
  const normalized = filePath.split("\\").join("/");
  const clipperIndex = normalized.indexOf("clipper/");
  if (clipperIndex >= 0) return normalized.slice(clipperIndex);
  return normalized.startsWith("/")
    ? normalized.replace(/^\/+/, "")
    : `clipper/${normalized}`;
}

async function nextAvailableTemplateFolder(projectRoot: string, slug: string) {
  const entries = await clipperHost.listDirectory(projectRoot);
  const names = new Set(entries.map((entry) => entry.name));
  let candidate = slug;
  let index = 2;
  while (names.has(candidate)) {
    candidate = `${slug}-${index}`;
    index += 1;
  }
  return `${projectRoot}/${candidate}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
