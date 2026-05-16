import { describe, expect, it } from "vitest";
import { getBinItemPath, resolveBinItemByPath } from "./binPathResolver";
import type { ProjectBinItem } from "./types";

const sampleBin: ProjectBinItem[] = [
  {
    id: "folder-paper",
    kind: "folder",
    name: "paper",
    children: [
      {
        id: "file-main",
        kind: "internal-file",
        name: "main.tsx",
        language: "tsx",
        source: "export default () => null;",
      },
      {
        id: "file-particle",
        kind: "internal-file",
        name: "Particle.tsx",
        language: "tsx",
        source: "export const Particle = () => null;",
      },
    ],
  },
  {
    id: "file-widget",
    kind: "external-proxy",
    name: "widget.tsx",
    path: "/abs/path/widget.tsx",
  },
  {
    id: "file-sibling-collision",
    kind: "internal-file",
    name: "duplicate.tsx",
    language: "tsx",
    source: "export default () => null;",
  },
  {
    id: "file-sibling-collision-2",
    kind: "internal-file",
    name: "duplicate.tsx",
    language: "tsx",
    source: "export default () => null;",
  },
];

describe("resolveBinItemByPath", () => {
  it("resolves a top-level external-proxy file", () => {
    const result = resolveBinItemByPath(sampleBin, "widget.tsx");
    expect(result?.id).toBe("file-widget");
  });

  it("resolves a nested internal-file", () => {
    const result = resolveBinItemByPath(sampleBin, "paper/main.tsx");
    expect(result?.id).toBe("file-main");
  });

  it("resolves a sibling internal-file under a folder", () => {
    const result = resolveBinItemByPath(sampleBin, "paper/Particle.tsx");
    expect(result?.id).toBe("file-particle");
  });

  it("returns null for missing paths", () => {
    expect(resolveBinItemByPath(sampleBin, "missing.tsx")).toBeNull();
    expect(resolveBinItemByPath(sampleBin, "paper/missing.tsx")).toBeNull();
    expect(resolveBinItemByPath(sampleBin, "")).toBeNull();
  });

  it("returns null when traversing through a non-folder", () => {
    expect(resolveBinItemByPath(sampleBin, "widget.tsx/oops")).toBeNull();
  });

  it("first match wins on duplicate sibling names", () => {
    const result = resolveBinItemByPath(sampleBin, "duplicate.tsx");
    expect(result?.id).toBe("file-sibling-collision");
  });

  it("ignores leading and trailing slashes", () => {
    expect(resolveBinItemByPath(sampleBin, "/paper/main.tsx")?.id).toBe(
      "file-main",
    );
    expect(resolveBinItemByPath(sampleBin, "paper/main.tsx/")?.id).toBe(
      "file-main",
    );
  });
});

describe("getBinItemPath", () => {
  it("produces top-level path", () => {
    expect(getBinItemPath(sampleBin, "file-widget")).toBe("widget.tsx");
  });

  it("produces nested path", () => {
    expect(getBinItemPath(sampleBin, "file-particle")).toBe(
      "paper/Particle.tsx",
    );
  });

  it("produces folder path", () => {
    expect(getBinItemPath(sampleBin, "folder-paper")).toBe("paper");
  });

  it("returns null for unknown id", () => {
    expect(getBinItemPath(sampleBin, "ghost")).toBeNull();
  });
});
