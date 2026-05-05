import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { configureMonacoTypeScriptLanguageService, textImportDeclarationSource } from "./monacoLanguageService";

function createProgramDiagnostics(files: Record<string, string>) {
  const options: ts.CompilerOptions = { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, noLib: true, strict: true, target: ts.ScriptTarget.ES2022 };
  const host = ts.createCompilerHost(options);
  host.fileExists = (filePath) => files[filePath] !== undefined;
  host.readFile = (filePath) => files[filePath];
  host.directoryExists = (directoryPath) => Object.keys(files).some((filePath) => filePath.startsWith(`${directoryPath}/`));
  host.getDirectories = () => [];
  host.getSourceFile = (filePath, languageVersion) => files[filePath] === undefined ? undefined : ts.createSourceFile(filePath, files[filePath], languageVersion, true);
  const program = ts.createProgram(["/project/composition.ts", "/project/text-imports.d.ts"], options, host);
  return ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.code !== 2318).map((diagnostic) => ({ code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") }));
}

describe("monaco language service", () => {
  it("registers plain text import declarations for editor diagnostics", () => {
    const addExtraLib = vi.fn();
    const setCompilerOptions = vi.fn();
    const setDiagnosticsOptions = vi.fn();
    const monaco = {
      languages: {
        typescript: {
          JsxEmit: { ReactJSX: "ReactJSX" },
          ModuleKind: { ESNext: "ESNext" },
          ModuleResolutionKind: { Bundler: "Bundler" },
          ScriptTarget: { ES2022: "ES2022" },
          typescriptDefaults: { addExtraLib, setCompilerOptions, setDiagnosticsOptions },
        },
      },
    };

    configureMonacoTypeScriptLanguageService(monaco);

    expect(setCompilerOptions).toHaveBeenCalledWith(expect.objectContaining({ allowArbitraryExtensions: true, moduleResolution: "Bundler" }));
    expect(addExtraLib).toHaveBeenCalledWith(textImportDeclarationSource, "file:///clipper/projects/text-imports.d.ts");
    expect(setDiagnosticsOptions).toHaveBeenCalledWith({ noSemanticValidation: false, noSyntaxValidation: false });
  });

  it("accepts relative CSS and HTML imports without hiding unrelated missing imports", () => {
    const diagnostics = createProgramDiagnostics({
      "/project/composition.ts": `
        import "./light-warp-reflections.css";
        import markup from "./cosmic-hair.html";
        import missing from "./missing-module";
        markup;
        missing;
      `,
      "/project/text-imports.d.ts": textImportDeclarationSource,
    });

    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("light-warp-reflections.css"))).toBe(false);
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("cosmic-hair.html"))).toBe(false);
    expect(diagnostics).toEqual([expect.objectContaining({ code: 2307, message: expect.stringContaining("./missing-module") })]);
  });
});
