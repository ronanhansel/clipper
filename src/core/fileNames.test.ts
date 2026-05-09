import { describe, it, expect } from "vitest";
import {
  getDisplayName,
  getDragPreviewDisplayName,
  getFileType,
  reconstructFileName,
  isSemanticFile,
  nextNumberedSemanticName,
} from "./fileNames";

describe("fileNames helpers", () => {
  describe("getDisplayName", () => {
    it("should strip .composition.ts", () => {
      expect(getDisplayName("intro.composition.ts")).toBe("intro");
    });

    it("should strip .composition.json", () => {
      expect(getDisplayName("intro.composition.json")).toBe("intro");
    });

    it("should strip .timeline.ts", () => {
      expect(getDisplayName("main.timeline.ts")).toBe("main");
    });

    it("should strip .timeline.json", () => {
      expect(getDisplayName("main.timeline.json")).toBe("main");
    });

    it("should leave misc files alone", () => {
      expect(getDisplayName("README.md")).toBe("README.md");
      expect(getDisplayName("data.json")).toBe("data.json");
      expect(getDisplayName("script.ts")).toBe("script.ts");
    });
  });

  describe("getFileType", () => {
    it("should detect compositions", () => {
      expect(getFileType("intro.composition.ts", false)).toBe("composition");
      expect(getFileType("intro.composition.json", false)).toBe("composition");
    });

    it("should detect timelines", () => {
      expect(getFileType("main.timeline.ts", false)).toBe("timeline");
      expect(getFileType("main.timeline.json", false)).toBe("timeline");
    });

    it("should detect folders", () => {
      expect(getFileType("compositions", true)).toBe("folder");
    });

    it("should detect misc files as 'file'", () => {
      expect(getFileType("README.md", false)).toBe("file");
    });

    it("should respect isCompositionContent for legacy files", () => {
      expect(getFileType("intro.ts", false, true)).toBe("composition");
    });
  });

  describe("getDragPreviewDisplayName", () => {
    it("strips semantic suffixes from drag preview labels", () => {
      expect(getDragPreviewDisplayName("intro.composition.ts")).toBe("intro");
      expect(getDragPreviewDisplayName("main.timeline.json")).toBe("main");
      expect(getDragPreviewDisplayName("intro.composition")).toBe("intro");
      expect(getDragPreviewDisplayName("main.timeline")).toBe("main");
    });

    it("uses the basename for paths and leaves normal extensions intact", () => {
      expect(getDragPreviewDisplayName("/tmp/project/intro.composition")).toBe(
        "intro",
      );
      expect(getDragPreviewDisplayName("/tmp/project/README.md")).toBe(
        "README.md",
      );
    });
  });

  describe("reconstructFileName", () => {
    it("should add .composition.ts if original had it", () => {
      expect(reconstructFileName("hero", "intro.composition.ts")).toBe(
        "hero.composition.ts",
      );
    });

    it("should add .timeline.json if original had it", () => {
      expect(reconstructFileName("outro", "main.timeline.json")).toBe(
        "outro.timeline.json",
      );
    });

    it("should leave misc files alone", () => {
      expect(reconstructFileName("docs", "README.md")).toBe("docs");
      // Note: reconstructFileName returns the new name as is if no semantic suffix found.
      // The caller (like OsFileManager) handles adding the extension for non-semantic files if needed,
      // but usually for non-semantic files we display the full name anyway.
    });
  });

  describe("isSemanticFile", () => {
    it("should return true for semantic files", () => {
      expect(isSemanticFile("a.composition.ts")).toBe(true);
      expect(isSemanticFile("a.timeline.json")).toBe(true);
    });

    it("should return false for others", () => {
      expect(isSemanticFile("a.ts")).toBe(false);
      expect(isSemanticFile("a.json")).toBe(false);
    });
  });

  describe("nextNumberedSemanticName", () => {
    it("should return base name if not taken", () => {
      expect(nextNumberedSemanticName("untitled", ".composition.ts", [])).toBe(
        "untitled.composition.ts",
      );
    });

    it("should return numbered name if taken", () => {
      expect(
        nextNumberedSemanticName("untitled", ".composition.ts", [
          "untitled.composition.ts",
        ]),
      ).toBe("untitled 2.composition.ts");
      expect(
        nextNumberedSemanticName("untitled", ".composition.ts", [
          "untitled.composition.ts",
          "untitled 2.composition.ts",
        ]),
      ).toBe("untitled 3.composition.ts");
    });
  });
});
