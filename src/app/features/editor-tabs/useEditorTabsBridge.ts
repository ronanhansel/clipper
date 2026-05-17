import { useEffect, type MutableRefObject } from "react";
import toast from "react-hot-toast";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import type {
  CompositionClip,
  EditorSessionState,
  PersistedEditorTab,
  ProjectManifest,
  Scene,
} from "../../../core/types";
import type {
  EditorPaneDocument,
  EditorPaneTab,
} from "../../../components/EditorPane";
import { resolveCanonicalComposition } from "../file-manager/compositionIdentity";
import {
  findBinItem,
  normalizeProjectBin,
} from "../file-manager/projectBinMutations";
import {
  commitEditorDocumentSource,
  getEditorLanguage,
  isUnsupportedEditorFile,
  resolveEditorDocument,
} from "../editor/editorDocuments";
import { useEditorTabsState, type EditorTab } from "../../state/editorStore";
import type { ProjectDocumentController } from "../../project/useProjectDocumentController";
import type { Mode } from "../../types";

type UseEditorTabsBridgeOptions = {
  project: ProjectManifest;
  projectRef: MutableRefObject<ProjectManifest>;
  scene: Scene;
  compositionLibrary: CompositionClip[];
  updateMode: (mode: Mode) => void;
  updateEditorState: ProjectDocumentController["updateEditorState"];
  updateProject: ProjectDocumentController["updateProject"];
};

export function useEditorTabsBridge({
  project,
  projectRef,
  scene,
  compositionLibrary,
  updateMode,
  updateEditorState,
  updateProject,
}: UseEditorTabsBridgeOptions) {
  const {
    editorTabs,
    activeEditorTabId,
    openEditorTab,
    openTemporaryEditorTab,
    pinEditorTab,
    selectEditorTab,
    closeEditorTab,
    restoreClosedEditorTab,
  } = useEditorTabsState();

  useEffect(() => {
    const editorSession = toPersistedEditorSession(
      editorTabs,
      activeEditorTabId,
    );
    if (
      JSON.stringify(project.editorState?.editorSession) ===
      JSON.stringify(editorSession)
    )
      return;
    updateEditorState((state) => ({ ...state, editorSession }), {
      history: false,
    });
  }, [
    activeEditorTabId,
    editorTabs,
    project.editorState?.editorSession,
    updateEditorState,
  ]);

  const activeEditorTab =
    editorTabs.find((tab) => tab.id === activeEditorTabId) ?? null;
  const resolvedEditorDocument = activeEditorTab
    ? resolveEditorDocument(
        project,
        activeEditorTab.id,
        activeEditorTab.isComposition ? "composition" : undefined,
      )
    : null;
  const activeEditorProjectDocument =
    resolvedEditorDocument?.kind === "internal-file" ||
    resolvedEditorDocument?.kind === "composition"
      ? resolvedEditorDocument
      : null;
  const activeEditorDocument: EditorPaneDocument | null = activeEditorTab
    ? resolvedEditorDocument
      ? {
          id: resolvedEditorDocument.id,
          filePath: resolvedEditorDocument.title,
          title: resolvedEditorDocument.title,
          source:
            resolvedEditorDocument.kind === "unsupported"
              ? ""
              : resolvedEditorDocument.source,
          language:
            resolvedEditorDocument.kind === "unsupported"
              ? "plaintext"
              : resolvedEditorDocument.language,
          unsupportedReason:
            resolvedEditorDocument.kind === "unsupported"
              ? resolvedEditorDocument.reason
              : undefined,
          fileRemoved: false,
        }
      : {
          id: activeEditorTab.id,
          filePath: activeEditorTab.filePath,
          title: activeEditorTab.filePath,
          source: "",
          language: "plaintext",
          fileRemoved: true,
        }
    : null;
  const editorPaneTabs: EditorPaneTab[] = editorTabs.map((tab) => {
    const resolved = resolveEditorDocument(
      project,
      tab.id,
      tab.isComposition ? "composition" : undefined,
    );
    return {
      id: tab.id,
      filePath: resolved?.title ?? tab.filePath,
      isComposition: tab.isComposition,
      isPinned: tab.isPinned,
      fileRemoved: resolved === null,
    };
  });
  const activeEditorViewportState = activeEditorDocument
    ? (project.editorState?.editor?.[activeEditorDocument.id] ??
      project.editorState?.code?.[activeEditorDocument.id])
    : undefined;

  function handleSelectComposition(_compositionId: string) {
    // Compositions are only added to the timeline via drag-and-drop.
    // Clicking a composition in the bin does not insert it.
  }

  function openCompositionInEditor(
    compositionId: string,
    options?: { temporary?: boolean },
  ) {
    const composition = resolveCanonicalComposition(
      compositionLibrary,
      scene.compositions,
      compositionId,
    );
    if (!composition) return;
    const tab = {
      id: composition.id,
      filePath: composition.filePath,
      language: getEditorLanguage(composition.filePath),
      isComposition: true,
    };
    if (options?.temporary) openTemporaryEditorTab(tab);
    else openEditorTab(tab);
    updateMode("editor");
  }

  async function openProjectFileInEditor(
    filePath: string,
    options?: {
      isComposition?: boolean;
      isTimeline?: boolean;
      temporary?: boolean;
    },
  ) {
    updateMode("editor");
    if (options?.isComposition) {
      const composition = compositionLibrary.find(
        (item) =>
          item.id === filePath ||
          item.filePath === filePath ||
          item.filePath.endsWith(`/${filePath}`),
      );
      if (composition) {
        const tab = {
          id: composition.id,
          filePath: composition.filePath,
          language: getEditorLanguage(composition.filePath),
          isComposition: true,
        };
        if (options.temporary) openTemporaryEditorTab(tab);
        else openEditorTab(tab);
        return;
      }
      toast.error("Composition could not be resolved from project state.");
      return;
    }

    const openTab = options?.temporary ? openTemporaryEditorTab : openEditorTab;
    const binItem = findBinItem(
      normalizeProjectBin(projectRef.current),
      filePath,
    );
    if (binItem?.kind === "internal-file" || binItem?.kind === "timeline") {
      openTab({
        id: binItem.id,
        filePath: binItem.name,
        language:
          binItem.kind === "timeline" ? "json" : (binItem as any).language,
      });
      return;
    }

    if (filePath.startsWith("/")) {
      toast.error(
        "External proxy files are not editable in the Clipper editor.",
      );
      return;
    }

    if (isUnsupportedEditorFile(filePath)) {
      openTab({
        id: filePath,
        filePath,
        language: "plaintext",
        unsupportedReason:
          "Clipper can only edit text-based project files in the editor. This file cannot be rendered or edited inline.",
      });
      return;
    }
    toast.error("File could not be resolved from project state.");
  }

  function commitActiveEditorSource(source: string): Promise<void> {
    if (!activeEditorDocument) return Promise.resolve();
    pinEditorTab(activeEditorDocument.id);
    if (!activeEditorProjectDocument) return Promise.resolve();
    const result = commitEditorDocumentSource(
      projectRef.current,
      activeEditorProjectDocument,
      source,
    );
    if (result.error) return Promise.reject(new Error(result.error));
    updateProject(result.project, { history: false });
    return Promise.resolve();
  }

  function restoreRemovedEditorTabFile(tabId: string) {
    const tab = editorTabs.find((t) => t.id === tabId);
    if (!tab) return;

    updateProject((current) => {
      const bin = normalizeProjectBin(current);
      if (findBinItem(bin, tabId)) return current;

      if (tab.isComposition) {
        const compositionId = tabId;
        const composition: CompositionClip = {
          id: compositionId,
          filePath: tab.filePath,
          duration: 3,
          frame: {
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
            style: {},
          },
          background: {
            id: "background",
            name: "Background",
            style: {},
            elements: [],
          },
          objects: [],
          snapshot: [],
          motionMarkers: [],
        };
        const binItem = {
          id: `bin_comp_${compositionId}`,
          kind: "composition" as const,
          name: tab.filePath.replace(/\.composition\.json$/i, ""),
          compositionId,
        };
        return {
          ...current,
          bin: [...bin, binItem],
          compositionLibrary: [
            ...(current.compositionLibrary ?? []),
            composition,
          ],
        };
      }

      const newBinItem = {
        id: tabId,
        kind: "internal-file" as const,
        name: tab.filePath,
        language: "plaintext",
        source: "",
      };
      return {
        ...current,
        bin: [...bin, newBinItem],
      };
    });
  }

  return {
    editorTabs,
    activeEditorTabId,
    closeEditorTab,
    selectEditorTab,
    pinEditorTab,
    restoreClosedEditorTab,
    activeEditorDocument,
    editorPaneTabs,
    activeEditorViewportState,
    openCompositionInEditor,
    openProjectFileInEditor,
    handleSelectComposition,
    commitActiveEditorSource,
    restoreRemovedEditorTabFile,
  };
}

function toPersistedEditorSession(
  editorTabs: EditorTab[],
  activeEditorTabId: string | null,
): EditorSessionState {
  const pinnedTabs = editorTabs.filter((tab) => tab.isPinned);
  const activePinnedTabId =
    activeEditorTabId && pinnedTabs.some((tab) => tab.id === activeEditorTabId)
      ? activeEditorTabId
      : (pinnedTabs[0]?.id ?? null);
  const session: EditorSessionState = {
    tabs: pinnedTabs.map((tab) => ({
      id: tab.id,
      filePath: tab.filePath,
      language: tab.language,
      ...(tab.unsupportedReason
        ? { unsupportedReason: tab.unsupportedReason }
        : {}),
      ...(tab.isComposition ? { isComposition: true } : {}),
      isPinned: true,
    })) satisfies PersistedEditorTab[],
  };
  if (activePinnedTabId) session.activeTabId = activePinnedTabId;
  return session;
}
