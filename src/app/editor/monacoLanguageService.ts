import { compositionApiSource } from "../../core/compositionApiSource";

export const textImportDeclarationSource = `declare module "*.css" {
  const source: string;
  export default source;
}

declare module "*.html" {
  const source: string;
  export default source;
}

declare module "*.three.js" {
  const source: string;
  export default source;
}

declare module "*.three.ts" {
  const source: string;
  export default source;
}
`;

type MonacoTypeScriptLanguageService = {
  languages: {
    typescript: {
      JsxEmit: { ReactJSX: unknown };
      ModuleKind: { ESNext: unknown };
      ModuleResolutionKind: { Bundler: unknown };
      ScriptTarget: { ES2022: unknown };
      typescriptDefaults: {
        setCompilerOptions: (options: Record<string, unknown>) => void;
        addExtraLib: (content: string, filePath?: string) => unknown;
        setDiagnosticsOptions: (options: {
          noSemanticValidation: boolean;
          noSyntaxValidation: boolean;
        }) => void;
      };
    };
  };
};

export function configureMonacoTypeScriptLanguageService(
  monaco: MonacoTypeScriptLanguageService,
) {
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    allowArbitraryExtensions: true,
    allowNonTsExtensions: true,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.Bundler,
    baseUrl: "file:///",
    paths: { "@clipper/*": ["clipper/projects/*"] },
    strict: true,
    target: monaco.languages.typescript.ScriptTarget.ES2022,
  });
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    compositionApiSource,
    "file:///clipper/projects/composition-api.ts",
  );
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    textImportDeclarationSource,
    "file:///clipper/projects/text-imports.d.ts",
  );
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}
