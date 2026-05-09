import { describe, expect, it } from "vitest";
import {
  applyOsFileOperations,
  applyPendingOsFileMoves,
  createOsCompositionDragDetail,
  preserveStableOsFileMoveIds,
  pruneObservedOsFileOperations,
  reconcilePendingOsFileMoves,
  renderOsFileOperationTree,
  renameOsFileNode,
  resolveOsCompositionDragMetadata,
  resolveOsCompositionId,
  retainUnobservedPendingMoves,
  rollbackFailedOsFileOperations,
  shouldSyncActiveOsFileSelection,
  type OsFileNode,
  type OsFileOperation,
} from "./OsFileManager";

describe("resolveOsCompositionDragMetadata", () => {
  it("uses loaded composition duration and state for drag previews", () => {
    const metadata = resolveOsCompositionDragMetadata(
      [
        {
          id: "composition-title",
          filePath: "compositions/title.composition.ts",
          duration: 12,
          objects: [
            {
              id: "text",
              name: "Text",
              type: "text",
              selector: "#text",
              bounds: { x: 0, y: 0, width: 100, height: 40 },
              style: {},
            },
          ],
          background: { id: "bg", name: "Background", style: {}, elements: [] },
          sourceMissing: true,
        },
      ],
      "compositions/title.composition.ts",
    );

    expect(metadata).toEqual({
      duration: 12,
      isEmpty: false,
      filePath: "compositions/title.composition.ts",
      sourceMissing: true,
    });
  });

  it("falls back to default composition preview metadata when unloaded", () => {
    expect(
      resolveOsCompositionDragMetadata(
        [],
        "compositions/missing.composition.ts",
      ),
    ).toEqual({
      duration: 5,
      isEmpty: true,
      filePath: undefined,
      sourceMissing: false,
    });
  });
});

describe("resolveOsCompositionId", () => {
  it("resolves an OS file path to the manifest-owned stable id", () => {
    expect(
      resolveOsCompositionId(
        [
          {
            id: "composition-b",
            filePath: "compositions/renamed/B.composition.ts",
          },
        ],
        "/project/file-manager/compositions/renamed/B.composition.ts",
        "/project",
      ),
    ).toBe("composition-b");
  });

  it("does not manufacture ids from paths when a manifest record is missing", () => {
    expect(
      resolveOsCompositionId(
        [],
        "/project/file-manager/compositions/B.composition.ts",
        "/project",
      ),
    ).toBeNull();
  });
});

describe("createOsCompositionDragDetail", () => {
  it("emits stable ids for OS file-manager pointer drag payloads", () => {
    const detail = createOsCompositionDragDetail(
      [
        {
          id: "composition-b",
          filePath: "compositions/folder/B.composition.ts",
          duration: 7,
          objects: [],
          background: { id: "bg", name: "Background", style: {}, elements: [] },
        },
      ],
      "/project/file-manager/compositions/folder/B.composition.ts",
      "B.composition.ts",
      "/project",
      "move",
      { x: 12, y: 24 },
      true,
    );

    expect(detail).toMatchObject({
      compositionId: "composition-b",
      duration: 7,
      phase: "move",
      shiftKey: true,
    });
  });
});

describe("shouldSyncActiveOsFileSelection", () => {
  it("does not reselect the active timeline after the user selects another file", () => {
    expect(
      shouldSyncActiveOsFileSelection(
        ["os-file:/project/notes.txt"],
        { key: "timeline:main.timeline.json", nodeId: "timeline-node" },
        "timeline:main.timeline.json",
        "timeline-node",
      ),
    ).toBe(false);
  });

  it("syncs when the active timeline changes", () => {
    expect(
      shouldSyncActiveOsFileSelection(
        ["os-file:/project/notes.txt"],
        { key: "timeline:main.timeline.json", nodeId: "timeline-node" },
        "timeline:second.timeline.json",
        "second-timeline-node",
      ),
    ).toBe(true);
  });

  it("restores the active item when tree reconciliation clears selection", () => {
    expect(
      shouldSyncActiveOsFileSelection(
        [],
        { key: "timeline:main.timeline.json", nodeId: "timeline-node" },
        "timeline:main.timeline.json",
        "timeline-node",
      ),
    ).toBe(true);
  });
});

describe("renameOsFileNode", () => {
  it("keeps renamed file node stable id while path and name change", () => {
    const nodes: OsFileNode[] = [
      {
        id: "stable-file",
        path: "/project/file-manager/compositions/A.composition.ts",
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];

    expect(
      renameOsFileNode(
        nodes,
        "/project/file-manager/compositions/A.composition.ts",
        "B.composition.ts",
      ),
    ).toEqual([
      {
        id: "stable-file",
        path: "/project/file-manager/compositions/B.composition.ts",
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
  });

  it("renames folder descendants without double-remapping child paths", () => {
    const nodes: OsFileNode[] = [
      {
        id: "stable-folder",
        path: "/project/file-manager/compositions/old",
        name: "old",
        isDirectory: true,
        children: [
          {
            id: "stable-child",
            path: "/project/file-manager/compositions/old/A.composition.ts",
            name: "A.composition.ts",
            isDirectory: false,
            isComposition: true,
          },
        ],
      },
    ];

    const [folder] = renameOsFileNode(
      nodes,
      "/project/file-manager/compositions/old",
      "new",
    );

    expect(folder).toMatchObject({
      id: "stable-folder",
      path: "/project/file-manager/compositions/new",
      name: "new",
    });
    expect(folder.children?.[0]).toMatchObject({
      id: "stable-child",
      path: "/project/file-manager/compositions/new/A.composition.ts",
      name: "A.composition.ts",
    });
  });

  it("preserves descendant stable ids for canonical reload after folder rename", () => {
    const oldPath = "/project/file-manager/compositions/old";
    const newPath = "/project/file-manager/compositions/new";
    const childOldPath = `${oldPath}/A.composition.ts`;
    const childNewPath = `${newPath}/A.composition.ts`;
    const idByPath = new Map<string, string>();
    const beforeRename: OsFileNode[] = [
      {
        id: "stable-folder",
        path: oldPath,
        name: "old",
        isDirectory: true,
        children: [
          {
            id: "stable-child",
            path: childOldPath,
            name: "A.composition.ts",
            isDirectory: false,
            isComposition: true,
          },
        ],
      },
    ];

    preserveStableOsFileMoveIds(idByPath, beforeRename, oldPath, newPath);
    const canonicalReload: OsFileNode[] = [
      {
        id: idByPath.get(newPath) ?? "new-folder-id",
        path: newPath,
        name: "new",
        isDirectory: true,
        children: [
          {
            id: idByPath.get(childNewPath) ?? "new-child-id",
            path: childNewPath,
            name: "A.composition.ts",
            isDirectory: false,
            isComposition: true,
          },
        ],
      },
    ];

    expect(canonicalReload[0].id).toBe("stable-folder");
    expect(canonicalReload[0].children?.[0].id).toBe("stable-child");
  });
});

describe("OS file optimistic rename refresh", () => {
  it("keeps an optimistic renamed node when a refresh still contains the old path", () => {
    const nodes: OsFileNode[] = [
      {
        id: "stable-file",
        path: "/project/file-manager/compositions/A.composition.ts",
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const moves = [
      {
        oldPath: "/project/file-manager/compositions/A.composition.ts",
        newPath: "/project/file-manager/compositions/B.composition.ts",
      },
    ];

    expect(applyPendingOsFileMoves(nodes, moves)).toEqual([
      {
        id: "stable-file",
        path: "/project/file-manager/compositions/B.composition.ts",
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
    expect(retainUnobservedPendingMoves(nodes, moves)).toEqual(moves);
  });

  it("clears an optimistic rename once refreshed data observes the new path", () => {
    const nodes: OsFileNode[] = [
      {
        id: "/project/file-manager/compositions/B.composition.ts",
        path: "/project/file-manager/compositions/B.composition.ts",
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const moves = [
      {
        oldPath: "/project/file-manager/compositions/A.composition.ts",
        newPath: "/project/file-manager/compositions/B.composition.ts",
      },
    ];

    expect(retainUnobservedPendingMoves(nodes, moves)).toEqual([]);
  });

  it("keeps consecutive rename state when watcher refreshes still lag behind both renames", () => {
    const renameAB = {
      oldPath: "/project/file-manager/compositions/A.composition.ts",
      newPath: "/project/file-manager/compositions/B.composition.ts",
      state: "settling" as const,
    };
    const renameBC = {
      oldPath: "/project/file-manager/compositions/B.composition.ts",
      newPath: "/project/file-manager/compositions/C.composition.ts",
      state: "in-flight" as const,
    };
    const staleARefresh: OsFileNode[] = [
      {
        id: "stable-file",
        path: "/project/file-manager/compositions/A.composition.ts",
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const staleBRefresh: OsFileNode[] = [
      {
        id: "stable-file",
        path: "/project/file-manager/compositions/B.composition.ts",
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];

    expect(
      applyPendingOsFileMoves(staleARefresh, [renameAB, renameBC]),
    ).toEqual([
      {
        id: "stable-file",
        path: "/project/file-manager/compositions/C.composition.ts",
        name: "C.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
    expect(
      reconcilePendingOsFileMoves(staleARefresh, [renameAB, renameBC]),
    ).toEqual([renameAB, renameBC]);
    expect(applyPendingOsFileMoves(staleBRefresh, [renameBC])).toEqual([
      {
        id: "stable-file",
        path: "/project/file-manager/compositions/C.composition.ts",
        name: "C.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
  });

  it("uses the first optimistic rename path as the second rename source and leaves the tree at the second name", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathB = "/project/file-manager/compositions/B.composition.ts";
    const pathC = "/project/file-manager/compositions/C.composition.ts";
    const initial: OsFileNode[] = [
      {
        id: "stable-file",
        path: pathA,
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];

    const afterFirstRename = renameOsFileNode(
      initial,
      pathA,
      "B.composition.ts",
    );
    const secondSource = afterFirstRename.find(
      (node) => node.id === "stable-file",
    );
    const afterSecondRename = renameOsFileNode(
      afterFirstRename,
      secondSource?.path ?? "",
      "C.composition.ts",
    );

    expect(afterFirstRename[0].id).toBe("stable-file");
    expect(secondSource?.path).toBe(pathB);
    expect(afterSecondRename).toEqual([
      {
        id: "stable-file",
        path: pathC,
        name: "C.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
    expect(afterSecondRename[0].id).toBe("stable-file");
  });

  it("records B to C as the second rename source while preserving row id", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathB = "/project/file-manager/compositions/B.composition.ts";
    const pathC = "/project/file-manager/compositions/C.composition.ts";
    const afterFirstRename = renameOsFileNode(
      [
        {
          id: "stable-file",
          path: pathA,
          name: "A.composition.ts",
          isDirectory: false,
          isComposition: true,
        },
      ],
      pathA,
      "B.composition.ts",
    );
    const secondSource = afterFirstRename[0].path;
    const afterSecondRename = renameOsFileNode(
      afterFirstRename,
      secondSource,
      "C.composition.ts",
    );

    expect(secondSource).toBe(pathB);
    expect({ oldPath: secondSource, newPath: pathC }).toEqual({
      oldPath: pathB,
      newPath: pathC,
    });
    expect(afterSecondRename[0]).toMatchObject({
      id: "stable-file",
      path: pathC,
      name: "C.composition.ts",
    });
  });

  it("keeps settling moves only until refreshed data observes the new path", () => {
    const move = {
      oldPath: "/project/file-manager/compositions/A.composition.ts",
      newPath: "/project/file-manager/compositions/B.composition.ts",
      state: "settling" as const,
    };

    expect(
      reconcilePendingOsFileMoves(
        [
          {
            id: "/project/file-manager/compositions/A.composition.ts",
            path: "/project/file-manager/compositions/A.composition.ts",
            name: "A.composition.ts",
            isDirectory: false,
            isComposition: true,
          },
        ],
        [move],
      ),
    ).toEqual([move]);

    expect(
      reconcilePendingOsFileMoves(
        [
          {
            id: "/project/file-manager/compositions/B.composition.ts",
            path: "/project/file-manager/compositions/B.composition.ts",
            name: "B.composition.ts",
            isDirectory: false,
            isComposition: true,
          },
        ],
        [move],
      ),
    ).toEqual([]);
  });

  it("keeps folder rename descendants optimistic until the canonical folder is observed", () => {
    const move = {
      oldPath: "/project/file-manager/compositions/old",
      newPath: "/project/file-manager/compositions/new",
      state: "settling" as const,
    };
    const oldNodes: OsFileNode[] = [
      {
        id: "/project/file-manager/compositions/old",
        path: "/project/file-manager/compositions/old",
        name: "old",
        isDirectory: true,
        children: [
          {
            id: "/project/file-manager/compositions/old/A.composition.ts",
            path: "/project/file-manager/compositions/old/A.composition.ts",
            name: "A.composition.ts",
            isDirectory: false,
            isComposition: true,
          },
        ],
      },
    ];

    expect(applyPendingOsFileMoves(oldNodes, [move])[0]).toMatchObject({
      id: "/project/file-manager/compositions/old",
      path: "/project/file-manager/compositions/new",
      name: "new",
    });
    expect(reconcilePendingOsFileMoves(oldNodes, [move])).toEqual([move]);
    expect(
      reconcilePendingOsFileMoves(
        [
          {
            id: "/project/file-manager/compositions/new",
            path: "/project/file-manager/compositions/new",
            name: "new",
            isDirectory: true,
            children: [
              {
                id: "/project/file-manager/compositions/new/A.composition.ts",
                path: "/project/file-manager/compositions/new/A.composition.ts",
                name: "A.composition.ts",
                isDirectory: false,
                isComposition: true,
              },
            ],
          },
        ],
        [move],
      ),
    ).toEqual([]);
  });
});

describe("OS file operation queue overlays", () => {
  const command = {
    label: "test",
    execute: async () => {},
    undo: async () => {},
    redo: async () => {},
  };

  function renameOperation(
    id: number,
    oldPath: string,
    newName: string,
    status: OsFileOperation["status"] = "queued",
  ): OsFileOperation {
    const newPath = `${oldPath.slice(0, oldPath.lastIndexOf("/"))}/${newName}`;
    return {
      id,
      kind: "rename",
      status,
      command,
      pathMoves: [{ oldPath, newPath }],
      apply: (nodes) => renameOsFileNode(nodes, oldPath, newName),
      isObserved: (nodes) =>
        Boolean(nodes.find((node) => node.path === newPath)) &&
        !Boolean(nodes.find((node) => node.path === oldPath)),
    };
  }

  it("rebases stale watcher refreshes through repeated A to B to C renames", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathB = "/project/file-manager/compositions/B.composition.ts";
    const pathC = "/project/file-manager/compositions/C.composition.ts";
    const staleA: OsFileNode[] = [
      {
        id: pathA,
        path: pathA,
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const staleB: OsFileNode[] = [
      {
        id: pathB,
        path: pathB,
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const operations = [
      renameOperation(1, pathA, "B.composition.ts", "succeeded"),
      renameOperation(2, pathB, "C.composition.ts", "running"),
    ];

    expect(applyOsFileOperations(staleA, operations)).toEqual([
      {
        id: pathA,
        path: pathC,
        name: "C.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
    expect(applyOsFileOperations(staleB, [operations[1]])).toEqual([
      {
        id: pathB,
        path: pathC,
        name: "C.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
  });

  it("renders the optimistic tree immediately after enqueue from queue state", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathB = "/project/file-manager/compositions/B.composition.ts";
    const base: OsFileNode[] = [
      {
        id: pathA,
        path: pathA,
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const operations = [renameOperation(1, pathA, "B.composition.ts")];

    expect(renderOsFileOperationTree(base, operations)).toEqual([
      {
        id: pathA,
        path: pathB,
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
  });

  it("retains a succeeded rename overlay until the base tree observes the target path", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathB = "/project/file-manager/compositions/B.composition.ts";
    const staleBase: OsFileNode[] = [
      {
        id: pathA,
        path: pathA,
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const observedBase: OsFileNode[] = [
      {
        id: pathA,
        path: pathB,
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const operation = renameOperation(
      1,
      pathA,
      "B.composition.ts",
      "succeeded",
    );

    expect(pruneObservedOsFileOperations(staleBase, [operation])).toEqual([
      operation,
    ]);
    expect(
      renderOsFileOperationTree(
        staleBase,
        pruneObservedOsFileOperations(staleBase, [operation]),
      ),
    ).toEqual(observedBase);
    expect(pruneObservedOsFileOperations(observedBase, [operation])).toEqual(
      [],
    );
  });

  it("renders double rename A to B to C from the queued overlays", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathC = "/project/file-manager/compositions/C.composition.ts";
    const base: OsFileNode[] = [
      {
        id: pathA,
        path: pathA,
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const operations = [
      renameOperation(1, pathA, "B.composition.ts", "succeeded"),
      renameOperation(
        2,
        "/project/file-manager/compositions/B.composition.ts",
        "C.composition.ts",
      ),
    ];

    expect(renderOsFileOperationTree(base, operations)).toEqual([
      {
        id: pathA,
        path: pathC,
        name: "C.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
  });

  it("prunes only succeeded operations observed by the base tree", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathB = "/project/file-manager/compositions/B.composition.ts";
    const pathC = "/project/file-manager/compositions/C.composition.ts";
    const observedB: OsFileNode[] = [
      {
        id: pathB,
        path: pathB,
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const operations = [
      renameOperation(1, pathA, "B.composition.ts", "succeeded"),
      renameOperation(2, pathB, "C.composition.ts", "running"),
    ];

    expect(pruneObservedOsFileOperations(observedB, operations)).toEqual([
      operations[1],
    ]);
    expect(
      applyOsFileOperations(
        observedB,
        pruneObservedOsFileOperations(observedB, operations),
      ),
    ).toEqual([
      {
        id: pathB,
        path: pathC,
        name: "C.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
  });

  it("rolls back a failed operation by removing only that overlay", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathB = "/project/file-manager/compositions/B.composition.ts";
    const base: OsFileNode[] = [
      {
        id: pathA,
        path: pathA,
        name: "A.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ];
    const failed = renameOperation(1, pathA, "B.composition.ts", "running");

    expect(applyOsFileOperations(base, [failed])).toEqual([
      {
        id: pathA,
        path: pathB,
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
    expect(applyOsFileOperations(base, [])).toEqual(base);
  });

  it("rolls back a failed operation and later dependent optimistic operations", () => {
    const pathA = "/project/file-manager/compositions/A.composition.ts";
    const pathB = "/project/file-manager/compositions/B.composition.ts";
    const pathC = "/project/file-manager/compositions/C.composition.ts";
    const pathD = "/project/file-manager/compositions/D.composition.ts";
    const operations = [
      {
        ...renameOperation(1, pathA, "B.composition.ts", "succeeded"),
        projectPathMoves: [
          {
            oldPath: "compositions/A.composition.ts",
            newPath: "compositions/B.composition.ts",
          },
        ],
      },
      {
        ...renameOperation(2, pathB, "C.composition.ts", "running"),
        projectPathMoves: [
          {
            oldPath: "compositions/B.composition.ts",
            newPath: "compositions/C.composition.ts",
          },
        ],
      },
      {
        ...renameOperation(3, pathC, "D.composition.ts", "queued"),
        projectPathMoves: [
          {
            oldPath: "compositions/C.composition.ts",
            newPath: "compositions/D.composition.ts",
          },
        ],
      },
    ];

    const rollback = rollbackFailedOsFileOperations(operations, 2);

    expect(rollback.operations.map((operation) => operation.id)).toEqual([1]);
    expect(
      rollback.rolledBackOperations.map((operation) => operation.id),
    ).toEqual([2, 3]);
    expect(
      applyOsFileOperations(
        [
          {
            id: "stable-file",
            path: pathA,
            name: "A.composition.ts",
            isDirectory: false,
            isComposition: true,
          },
        ],
        rollback.operations,
      ),
    ).toEqual([
      {
        id: "stable-file",
        path: pathB,
        name: "B.composition.ts",
        isDirectory: false,
        isComposition: true,
      },
    ]);
    expect(pathD).toBe("/project/file-manager/compositions/D.composition.ts");
  });
});
