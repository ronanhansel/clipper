import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { compositionApiSource } from "../core/compositionApiSource";
import { clipperHost } from "../app/clipperHost";
import { getDisplayNameFromPath } from "../core/fileNames";
import { getMonacoOptionsForDocument } from "../app/config";
import { configureMonacoTypeScriptLanguageService } from "../app/editor/monacoLanguageService";
import type { CodeViewportState } from "../core/types";

type MonacoEditor = Parameters<OnMount>[0];
type MonacoViewState = NonNullable<ReturnType<MonacoEditor["saveViewState"]>>;

export type EditorPaneDocument = {
  id: string;
  filePath: string;
  source?: string;
  language: string;
  title?: string;
  unsupportedReason?: string;
  showCompositionApiStatus?: boolean;
};

export type EditorPaneTab = {
  id: string;
  filePath: string;
  title?: string;
  unsupportedReason?: string;
  isComposition?: boolean;
  isPinned: boolean;
};

const editorViewportStateCache = new Map<string, CodeViewportState>();
const editorMonacoViewStateCache = new Map<string, MonacoViewState>();

function getClipperCssVariable(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getClipperAccent() {
  const accent = getClipperCssVariable("--clipper-accent");
  const rgb = getClipperCssVariable("--clipper-accent-rgb").split(/\s+/).join(",");

  return {
    accent,
    alpha: (opacity: number) => `rgba(${rgb},${opacity})`,
  };
}

export function EditorPane({ document, tabs, viewportState, active = true, projectDirectory, onCloseTab, onRestoreClosedTab, onSelectTab, onPinTab, onSourceChange, onViewportStateChange }: { document: EditorPaneDocument; tabs: EditorPaneTab[]; viewportState?: CodeViewportState; active?: boolean; projectDirectory?: string; onCloseTab: (tabId: string) => void; onRestoreClosedTab: () => boolean; onSelectTab: (tabId: string) => void; onPinTab: (tabId: string) => void; onSourceChange: (source: string) => Promise<void>; onViewportStateChange: (sourceId: string, state: CodeViewportState) => void }) {
  const [source, setSource] = useState(document.source ?? "");
  const [error, setError] = useState("");
  const [apiMissing, setApiMissing] = useState(false);
  const sourceId = document.id;
  const closeActiveTabRef = useRef<() => void>(() => onCloseTab(document.id));
  const restoreClosedTabRef = useRef(onRestoreClosedTab);
  const applySourceChangeRef = useRef(onSourceChange);
  const editorRef = useRef<MonacoEditor | null>(null);
  const restoreScrollFrameRef = useRef(0);
  const restoreScrollTimersRef = useRef<number[]>([]);
  const viewportStateChangeRef = useRef(onViewportStateChange);
  const sourceIdRef = useRef(sourceId);
  const activeRef = useRef(active);
  const wordWrapRef = useRef<"on" | "off">("off");
  const latestViewportStateRef = useRef<CodeViewportState>(editorViewportStateCache.get(sourceId) ?? viewportState ?? { scrollLeft: 0, scrollTop: 0 });
  const editorOptions = getMonacoOptionsForDocument({ ...document, source });

  useEffect(() => { closeActiveTabRef.current = () => onCloseTab(document.id); }, [document.id, onCloseTab]);
  useEffect(() => { restoreClosedTabRef.current = onRestoreClosedTab; }, [onRestoreClosedTab]);
  useEffect(() => { applySourceChangeRef.current = onSourceChange; }, [onSourceChange]);
  useEffect(() => { viewportStateChangeRef.current = onViewportStateChange; }, [onViewportStateChange]);
  useEffect(() => {
    sourceIdRef.current = sourceId;
    latestViewportStateRef.current = editorViewportStateCache.get(sourceId) ?? viewportState ?? { scrollLeft: 0, scrollTop: 0 };
  }, [sourceId, viewportState]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (!projectDirectory || !document.showCompositionApiStatus) return;
    let cancelled = false;
    async function check() {
      try {
        await clipperHost.readTextFile(`${projectDirectory}/composition-api.ts`);
        if (!cancelled) setApiMissing(false);
      } catch {
        if (!cancelled) setApiMissing(true);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [document.showCompositionApiStatus, projectDirectory]);

  async function restoreCompositionApi() {
    if (!projectDirectory) return;
    try {
      await clipperHost.writeTextFile(`${projectDirectory}/composition-api.ts`, compositionApiSource);
      setApiMissing(false);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Unable to restore composition-api.ts.");
    }
  }

  useEffect(() => () => {
    persistEditorViewportState();
    window.cancelAnimationFrame(restoreScrollFrameRef.current);
    restoreScrollTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => () => persistEditorViewportState(), [sourceId]);

  function persistEditorViewportState() {
    saveMonacoViewState();
    editorViewportStateCache.set(sourceIdRef.current, latestViewportStateRef.current);
    viewportStateChangeRef.current(sourceIdRef.current, latestViewportStateRef.current);
  }

  function saveMonacoViewState() {
    const editor = editorRef.current;
    if (!editor) return;
    const viewState = editor.saveViewState();
    if (viewState) editorMonacoViewStateCache.set(sourceIdRef.current, viewState);
  }

  function restoreScrollPosition() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.layout();
    const viewState = editorMonacoViewStateCache.get(sourceIdRef.current);
    if (viewState) editor.restoreViewState(viewState);
    editor.setScrollPosition(latestViewportStateRef.current);
  }

  useEffect(() => {
    latestViewportStateRef.current = editorViewportStateCache.get(sourceId) ?? viewportState ?? { scrollLeft: 0, scrollTop: 0 };
  }, [sourceId, viewportState]);

  useEffect(() => {
    latestViewportStateRef.current = editorViewportStateCache.get(sourceId) ?? viewportState ?? { scrollLeft: 0, scrollTop: 0 };
    saveMonacoViewState();
    window.cancelAnimationFrame(restoreScrollFrameRef.current);
    restoreScrollTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    restoreScrollTimersRef.current = [];
    restoreScrollPosition();
    restoreScrollFrameRef.current = requestAnimationFrame(() => {
      restoreScrollPosition();
      restoreScrollTimersRef.current = [window.setTimeout(restoreScrollPosition, 0), window.setTimeout(restoreScrollPosition, 50), window.setTimeout(restoreScrollPosition, 150)];
    });
  }, [active, sourceId]);

  const configureMonaco: BeforeMount = (monaco) => {
    const { accent } = getClipperAccent();
    monaco.editor.defineTheme("clipper-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "69707f", fontStyle: "italic" },
        { token: "keyword", foreground: "61c7ff" },
        { token: "number", foreground: "f0b35c" },
        { token: "string", foreground: "93e6b4" },
        { token: "type", foreground: "9bdcff" },
      ],
      colors: {
        "editor.background": "#12141a",
        "editor.foreground": accent,
        "editor.lineHighlightBackground": "#1a1d26",
        "editor.lineHighlightBorder": "#20232c",
        "editor.selectionBackground": "#263142cc",
        "editor.inactiveSelectionBackground": "#20232c99",
        "editorCursor.foreground": accent,
        "editorGutter.background": "#151821",
        "editorWidget.background": "#11141a",
        "editorWidget.border": "#2d313b",
        "scrollbarSlider.background": "#9b9da747",
        "scrollbarSlider.hoverBackground": "#d9dbe15c",
        "scrollbarSlider.activeBackground": "#d9dbe180",
      },
    });
    configureMonacoTypeScriptLanguageService(monaco);
  };

  useEffect(() => {
    setError("");
    setSource(document.source ?? "");
  }, [document.source, sourceId]);

  function updateSource(nextSource: string) {
    setSource(nextSource);
    applySourceChangeRef.current(nextSource).then(() => setError("")).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : "Unable to apply editor changes.");
    });
  }

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => { closeActiveTabRef.current(); });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT, () => { restoreClosedTabRef.current(); });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
      wordWrapRef.current = wordWrapRef.current === "off" ? "on" : "off";
      editor.updateOptions({ wordWrap: wordWrapRef.current });
    });
    editor.onDidScrollChange(() => {
      if (!activeRef.current) return;
      latestViewportStateRef.current = { scrollLeft: Math.max(Math.round(editor.getScrollLeft()), 0), scrollTop: Math.max(Math.round(editor.getScrollTop()), 0) };
      editorViewportStateCache.set(sourceIdRef.current, latestViewportStateRef.current);
    });
    editor.onDidChangeCursorPosition(() => {
      saveMonacoViewState();
    });
    restoreScrollPosition();
  };

  const gridTemplateRows = `auto${apiMissing ? " auto" : ""} minmax(0,1fr)${error ? " auto" : ""}`;
  const title = document.title ?? getDisplayNameFromPath(document.filePath);

  return <div className="grid h-full min-h-0 w-full overflow-hidden bg-[#12141a]" style={{ gridTemplateRows }}><div className="clipper-hidden-scrollbar flex min-w-0 items-end overflow-x-auto border-b border-[#2d313b] bg-[#171920] px-2 pt-2 text-xs" aria-label="Open editor tabs">{tabs.map((tab) => {
    const tabTitle = tab.title ?? getDisplayNameFromPath(tab.filePath);
    const selected = tab.id === document.id;
    return <button key={tab.id} type="button" className={`group flex max-w-[220px] shrink-0 items-center gap-2 rounded-t-[3px] border border-b-0 px-3 py-2 text-left font-bold transition-colors ${selected ? "border-[#2d313b] bg-[#12141a] text-[#dfe2ea]" : "border-transparent bg-transparent text-[#8c929f] hover:bg-[#20232c] hover:text-[#dfe2ea]"}`} title={tab.filePath} onClick={() => onSelectTab(tab.id)} onDoubleClick={() => onPinTab(tab.id)}><span className={`min-w-0 truncate ${tab.isPinned ? "" : "italic"}`}>{tabTitle}</span>{tab.unsupportedReason ? <span className="text-[#f0b35c]">!</span> : null}<span className="rounded-[3px] px-1 text-[#565b66] opacity-70 hover:bg-[#2d313b] hover:text-[#dfe2ea] group-hover:opacity-100" role="button" tabIndex={-1} aria-label={`Close ${tabTitle}`} onClick={(event) => { event.stopPropagation(); onCloseTab(tab.id); }} onDoubleClick={(event) => event.stopPropagation()}>×</span></button>;
  })}</div>
{apiMissing ? <div className="flex items-center justify-between gap-2 border-b border-[#3b2a2a] bg-[#1a0f10] px-3.5 py-2 text-xs text-[#ffb4b4]"><span className="break-words">composition-api.ts is missing from the project. External editors and type-checking will not work.</span><button className="shrink-0 rounded bg-[#2d313b] px-2 py-1 text-[11px] font-bold text-[#dfe2ea] hover:bg-[#3b4150]" type="button" onClick={() => void restoreCompositionApi()}>Restore</button></div> : null}<div className="min-h-0 border-y border-[#20232c] bg-[#12141a] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">{document.unsupportedReason ? <div className="grid h-full place-items-center p-8 text-center"><div className="max-w-[520px] rounded-[18px] border border-[#2d313b] bg-[#171920] p-7 shadow-[0_18px_60px_rgba(0,0,0,0.25)]"><div className="text-sm font-extrabold text-[#dfe2ea]">Unsupported file type</div><div className="mt-2 text-sm leading-6 text-[#8c929f]">{document.unsupportedReason}</div><div className="mt-4 break-all text-xs text-[#565b66]">{document.filePath}</div></div></div> : <Editor beforeMount={configureMonaco} language={document.language} onMount={onEditorMount} options={editorOptions} path={`file:///${document.filePath}`} theme="clipper-dark" value={source} onChange={(value) => updateSource(value ?? "")} />}</div>{error ? <div className="border-t border-[#3b2a2a] bg-[#1a0f10] px-3.5 py-2 text-xs text-[#ffb4b4] break-words">{error}</div> : null}</div>;
}
