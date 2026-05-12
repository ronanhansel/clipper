/// <reference types="node" />

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const forbiddenTerms = [
  ["composition", "3d"].join(""),
  ["Composition", "3D"].join(""),
  ["composition", "3d", "Graph"].join(""),
  ["bg", "Graph"].join(""),
  ["bg", "Solid"].join(""),
  ["bg", "Gradient"].join(""),
  ["bg", "Pattern"].join(""),
  ["bg", "Paper"].join(""),
  ["bg", "Three", "Code"].join(""),
  ["three", "Backgrounds"].join(""),
  ["Web", "Gl", "Pipeline"].join(""),
  [".composition", "3d", ".json"].join(""),
];

describe("removed graph paths", () => {
  it("keeps deleted non-2D graph symbols out of source and docs", () => {
    const matches: string[] = [];
    for (const filePath of walk([
      join(repoRoot, "src"),
      join(repoRoot, "docs"),
    ])) {
      if (filePath.endsWith("noLegacyGraphPaths.test.ts")) continue;
      const source = readFileSync(filePath, "utf8");
      for (const term of forbiddenTerms) {
        if (source.includes(term))
          matches.push(`${relative(repoRoot, filePath)}: ${term}`);
      }
    }

    expect(matches).toEqual([]);
  });
});

function walk(paths: string[]): string[] {
  return paths.flatMap((path) => {
    const stat = statSync(path);
    if (stat.isDirectory())
      return readdirSync(path).flatMap((entry) => walk([join(path, entry)]));
    return path;
  });
}
