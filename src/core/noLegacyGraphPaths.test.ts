/// <reference types="node" />

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const srcRoot = join(repoRoot, "src");
const blockedPaths = [
  "src/core/animationGraph",
  "src/core/compositionGraphTransactions.ts",
  "src/core/graphInputExpression.ts",
  "src/core/graphParameterBindings.ts",
  "src/core/graphParameters.ts",
  "src/core/graphSelection.ts",
  "src/core/graphSockets.ts",
  "src/core/effects/builtins/graphRuntime.ts",
  "src/components/timeline/ComposeAnimationGraphPanel.tsx",
  "src/components/timeline/GraphParameterEditor.tsx",
  "src/components/timeline/StrictComposition2dGraphPanel.tsx",
];
const blockedSourceTerms = [
  "animationGraph",
  "compositionGraph",
  "AnimationGraph",
  "GraphPanel",
  "GraphParameter",
  "generatedByGraph",
  "generatedGeometry",
  "graphRuntime",
  "graphSelection",
  "graphParameters",
];

describe("legacy graph cleanup", () => {
  it("keeps graph implementation paths out of src", () => {
    expect(
      blockedPaths.filter((path) => existsSync(join(repoRoot, path))),
    ).toEqual([]);
    expect(
      walkSourceFiles(srcRoot)
        .map((path) => relative(repoRoot, path))
        .filter((path) =>
          path
            .split(/[\\/]/)
            .some(
              (segment) =>
                /graph/i.test(segment) &&
                !/graphics/i.test(segment) &&
                segment !== "noLegacyGraphPaths.test.ts",
            ),
        ),
    ).toEqual([]);
  });

  it("keeps graph-facing source terms out of runtime source", () => {
    const matches: string[] = [];
    for (const filePath of walkSourceFiles(srcRoot)) {
      if (filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx"))
        continue;
      const source = readFileSync(filePath, "utf8");
      for (const term of blockedSourceTerms) {
        if (source.includes(term)) {
          matches.push(`${relative(repoRoot, filePath)}:${term}`);
        }
      }
    }

    expect(matches).toEqual([]);
  });
});

function walkSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  return entries.flatMap((entry: string) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return walkSourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}
