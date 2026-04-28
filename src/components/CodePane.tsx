import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import compositionApiSource from "../../clipper/projects/composition-api.ts?raw";
import { monacoOptions } from "../app/config";
import type { CodeViewportState, Part } from "../core/types";

type MonacoEditor = Parameters<OnMount>[0];
type MonacoViewState = NonNullable<ReturnType<MonacoEditor["saveViewState"]>>;

const codeViewportStateCache = new Map<string, CodeViewportState>();
const codeMonacoViewStateCache = new Map<string, MonacoViewState>();

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

export function CodePane({ part, source: externalSource, viewportState, active = true, onSaveAll, onSourceChange, onViewportStateChange }: { part: Part; source: string | undefined; viewportState?: CodeViewportState; active?: boolean; onSaveAll: () => Promise<void>; onSourceChange: (source: string) => Promise<void>; onViewportStateChange: (sourceId: string, state: CodeViewportState) => void }) {
  const [source, setSource] = useState(externalSource ?? "");
  const [error, setError] = useState("");
  const sourceId = part.id;
  const saveAllRef = useRef<() => Promise<void>>(onSaveAll);
  const applySourceChangeRef = useRef(onSourceChange);
  const editorRef = useRef<MonacoEditor | null>(null);
  const restoreScrollFrameRef = useRef(0);
  const saveScrollFrameRef = useRef(0);
  const restoreScrollTimersRef = useRef<number[]>([]);
  const viewportStateChangeRef = useRef(onViewportStateChange);
  const sourceIdRef = useRef(sourceId);
  const activeRef = useRef(active);
  const latestViewportStateRef = useRef<CodeViewportState>(codeViewportStateCache.get(sourceId) ?? viewportState ?? { scrollLeft: 0, scrollTop: 0 });

  useEffect(() => {
    saveAllRef.current = onSaveAll;
  }, [onSaveAll]);

  useEffect(() => {
    applySourceChangeRef.current = onSourceChange;
  }, [onSourceChange]);

  useEffect(() => {
    viewportStateChangeRef.current = onViewportStateChange;
  }, [onViewportStateChange]);

  useEffect(() => {
    sourceIdRef.current = sourceId;
    latestViewportStateRef.current = codeViewportStateCache.get(sourceId) ?? viewportState ?? { scrollLeft: 0, scrollTop: 0 };
  }, [sourceId, viewportState]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => () => {
    const viewState = editorRef.current?.saveViewState();
    if (viewState) codeMonacoViewStateCache.set(sourceIdRef.current, viewState);
    codeViewportStateCache.set(sourceIdRef.current, latestViewportStateRef.current);
    viewportStateChangeRef.current(sourceIdRef.current, latestViewportStateRef.current);
    window.cancelAnimationFrame(restoreScrollFrameRef.current);
    window.cancelAnimationFrame(saveScrollFrameRef.current);
    restoreScrollTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function restoreScrollPosition() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.layout();
    const viewState = codeMonacoViewStateCache.get(sourceIdRef.current);
    if (viewState) editor.restoreViewState(viewState);
    editor.setScrollPosition(latestViewportStateRef.current);
  }

  useEffect(() => {
    latestViewportStateRef.current = codeViewportStateCache.get(sourceId) ?? viewportState ?? { scrollLeft: 0, scrollTop: 0 };
    window.cancelAnimationFrame(restoreScrollFrameRef.current);
    restoreScrollTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    restoreScrollTimersRef.current = [];
    restoreScrollPosition();
    restoreScrollFrameRef.current = requestAnimationFrame(() => {
      restoreScrollPosition();
      restoreScrollTimersRef.current = [
        window.setTimeout(restoreScrollPosition, 0),
        window.setTimeout(restoreScrollPosition, 50),
        window.setTimeout(restoreScrollPosition, 150),
      ];
    });
  }, [active, sourceId, viewportState]);

  const configureMonaco: BeforeMount = (monaco) => {
    const { accent, alpha: accentAlpha } = getClipperAccent();

    monaco.editor.defineTheme("clipper-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "69707f", fontStyle: "italic" },
        { token: "keyword", foreground: "61c7ff" },
        { token: "number", foreground: "f0b35c" },
        { token: "string", foreground: "93e6b4" },
        { token: "type", foreground: "9bdcff" },
        { token: "delimiter.bracket", foreground: "d9dbe1" },
        { token: "invalid", foreground: "ffb4b4", background: "1a1d26" },
        { token: "invalid.illegal", foreground: "ffb4b4", background: "1a1d26" },
        { token: "invalid.deprecated", foreground: "c8ccd6", background: "1a1d26" },
      ],
      colors: {
        "editor.background": "#12141a",
        "editor.foreground": accent,
        "editor.lineHighlightBackground": "#1a1d26",
        "editor.lineHighlightBorder": "#20232c",
        "editor.selectionBackground": "#263142cc",
        "editor.inactiveSelectionBackground": "#20232c99",
        "editor.selectionHighlightBackground": "#2d3a4c66",
        "editorCursor.foreground": accent,
        "editorError.background": "#00000000",
        "editorError.foreground": "#ff8f8f",
        "editorWarning.background": "#00000000",
        "editorWarning.foreground": "#d9a35f",
        "editorLineNumber.foreground": "#4a5060",
        "editorLineNumber.activeForeground": "#d9dbe1",
        "editorIndentGuide.background1": "#20232c",
        "editorIndentGuide.activeBackground1": "#3b4150",
        "editorBracketHighlight.foreground1": "#9bdcff",
        "editorBracketHighlight.foreground2": "#d9a35f",
        "editorBracketHighlight.foreground3": "#a7d39d",
        "editorBracketHighlight.foreground4": "#b7a7e8",
        "editorBracketHighlight.foreground5": "#80b8e8",
        "editorBracketHighlight.foreground6": "#c8ccd6",
        "editorBracketMatch.background": "#26314299",
        "editorBracketMatch.border": "#80b8e8",
        "editorGutter.background": "#151821",
        "editorWidget.background": "#11141a",
        "editorWidget.border": "#2d313b",
        "editorSuggestWidget.background": "#11141a",
        "editorSuggestWidget.border": "#2d313b",
        "editorSuggestWidget.foreground": "#dfe2ea",
        "editorSuggestWidget.highlightForeground": accent,
        "editorSuggestWidget.selectedBackground": "#20232c",
        "editorHoverWidget.background": "#11141a",
        "editorHoverWidget.border": "#2d313b",
        "scrollbarSlider.background": "#9b9da747",
        "scrollbarSlider.hoverBackground": "#d9dbe15c",
        "scrollbarSlider.activeBackground": accentAlpha(0.4),
      },
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.Bundler,
      baseUrl: "file:///",
      paths: { "@clipper/*": ["clipper/projects/*"] },
      strict: true,
      target: monaco.languages.typescript.ScriptTarget.ES2022,
    });
    monaco.languages.typescript.typescriptDefaults.addExtraLib(compositionApiSource, "file:///clipper/projects/composition-api.ts");
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
  };

  useEffect(() => {
    setError("");
    setSource(externalSource ?? "");
  }, [externalSource, sourceId]);

  function updateSource(nextSource: string) {
    setSource(nextSource);
    applySourceChangeRef.current(nextSource).then(() => setError("")).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : "Unable to apply code changes.");
    });
  }

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveAllRef.current();
    });
    editor.onDidScrollChange(() => {
      if (!activeRef.current) return;
      latestViewportStateRef.current = {
        scrollLeft: Math.max(Math.round(editor.getScrollLeft()), 0),
        scrollTop: Math.max(Math.round(editor.getScrollTop()), 0),
      };
      const viewState = editor.saveViewState();
      if (viewState) codeMonacoViewStateCache.set(sourceIdRef.current, viewState);
      codeViewportStateCache.set(sourceIdRef.current, latestViewportStateRef.current);
      if (saveScrollFrameRef.current) return;
      saveScrollFrameRef.current = requestAnimationFrame(() => {
        saveScrollFrameRef.current = 0;
        viewportStateChangeRef.current(sourceIdRef.current, latestViewportStateRef.current);
      });
    });
    editor.onDidContentSizeChange(() => {
      if (activeRef.current) restoreScrollPosition();
    });
    editor.onDidChangeCursorPosition(() => {
      const viewState = editor.saveViewState();
      if (viewState) codeMonacoViewStateCache.set(sourceIdRef.current, viewState);
    });
    restoreScrollPosition();
  };

  const gridTemplateRows = `auto minmax(0,1fr)${error ? " auto" : ""}`;

  return <div className="grid h-full min-h-0 w-full overflow-hidden bg-[#12141a]" style={{ gridTemplateRows }}><div className="flex min-w-0 items-center gap-2 border-b border-[#2d313b] bg-[#171920] px-3.5 py-3 text-xs"><span className="font-extrabold text-[var(--clipper-accent)]">Project code</span><span className="text-[#565b66]">/</span><span className="min-w-0 truncate text-[#dfe2ea]">{part.name}</span></div><div className="min-h-0 border-y border-[#20232c] bg-[#12141a] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"><Editor beforeMount={configureMonaco} language="typescript" onMount={onEditorMount} options={monacoOptions} path={`file:///clipper/project/compositions/${part.id}.ts`} theme="clipper-dark" value={source} onChange={(value) => updateSource(value ?? "")} /></div>{error ? <div className="border-t border-[#3b2a2a] bg-[#1a0f10] px-3.5 py-2 text-xs text-[#ffb4b4] break-words">{error}</div> : null}</div>;
}
