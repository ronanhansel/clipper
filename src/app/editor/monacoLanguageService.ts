import { compositionApiSource } from "../../core/compositionApiSource";

export function getEditorLanguageFromName(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "ts" || extension === "tsx") return "typescript";
  if (extension === "js" || extension === "jsx") return "javascript";
  if (extension === "css") return "css";
  if (extension === "json") return "json";
  if (extension === "md") return "markdown";
  if (extension === "html") return "html";
  return "plaintext";
}

export function normalizeEditorLanguage(language: string | undefined): string {
  if (!language) return "";
  if (language === "typescriptreact") return "typescript";
  if (language === "javascriptreact") return "javascript";
  return language;
}

const unsupportedEditorExtensions = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "avi",
  "mkv",
  "mp3",
  "wav",
  "aiff",
  "flac",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "zip",
]);

export function isUnsupportedEditorFile(filePath: string): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return unsupportedEditorExtensions.has(extension);
}

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

export const reactRuntimeDeclarationSource = `declare namespace JSX {
  interface Element {
    type: unknown;
    props: unknown;
    key: string | number | null;
  }
  interface ElementClass {
    render: () => unknown;
  }
  interface ElementAttributesProperty {
    props: object;
  }
  interface ElementChildrenAttribute {
    children: object;
  }
  interface IntrinsicAttributes {
    key?: string | number | null;
  }
  interface IntrinsicClassAttributes<T> {
    ref?: unknown;
  }
  interface IntrinsicElements {
    [tagName: string]: any;
  }
}

declare namespace React {
  type Key = string | number;
  type ReactNode =
    | ReactElement
    | string
    | number
    | boolean
    | null
    | undefined
    | Iterable<ReactNode>;
  interface ReactElement<P = any, T = any> {
    type: T;
    props: P;
    key: Key | null;
  }
  type FC<P = {}> = (props: P & { children?: ReactNode }) => ReactNode;
  type FunctionComponent<P = {}> = FC<P>;
  type Ref<T> = ((value: T | null) => void) | { current: T | null } | null;
  type CSSProperties = { [key: string]: string | number | undefined };
  type Dispatch<A> = (value: A) => void;
  type SetStateAction<S> = S | ((previous: S) => S);
  type DependencyList = ReadonlyArray<unknown>;
  type EffectCallback = () => void | (() => void);
  interface MutableRefObject<T> {
    current: T;
  }
  interface RefObject<T> {
    readonly current: T | null;
  }
  interface Context<T> {
    Provider: FC<{ value: T; children?: ReactNode }>;
    Consumer: FC<{ children: (value: T) => ReactNode }>;
  }
}

declare module "react" {
  export type Key = React.Key;
  export type ReactNode = React.ReactNode;
  export type ReactElement<P = any, T = any> = React.ReactElement<P, T>;
  export type FC<P = {}> = React.FC<P>;
  export type FunctionComponent<P = {}> = React.FunctionComponent<P>;
  export type Ref<T> = React.Ref<T>;
  export type CSSProperties = React.CSSProperties;
  export type Dispatch<A> = React.Dispatch<A>;
  export type SetStateAction<S> = React.SetStateAction<S>;
  export type DependencyList = React.DependencyList;
  export type EffectCallback = React.EffectCallback;
  export type MutableRefObject<T> = React.MutableRefObject<T>;
  export type RefObject<T> = React.RefObject<T>;
  export type Context<T> = React.Context<T>;

  export function useState<S>(
    initial: S | (() => S),
  ): [S, React.Dispatch<React.SetStateAction<S>>];
  export function useEffect(
    effect: React.EffectCallback,
    deps?: React.DependencyList,
  ): void;
  export function useLayoutEffect(
    effect: React.EffectCallback,
    deps?: React.DependencyList,
  ): void;
  export function useMemo<T>(factory: () => T, deps: React.DependencyList): T;
  export function useCallback<T extends (...args: any[]) => any>(
    callback: T,
    deps: React.DependencyList,
  ): T;
  export function useRef<T>(initial: T): React.MutableRefObject<T>;
  export function useReducer<S, A>(
    reducer: (state: S, action: A) => S,
    initial: S,
  ): [S, React.Dispatch<A>];
  export function useContext<T>(context: React.Context<T>): T;
  export function useId(): string;
  export function useTransition(): [boolean, (callback: () => void) => void];
  export function useDeferredValue<T>(value: T): T;
  export function useSyncExternalStore<T>(
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => T,
  ): T;

  export function createContext<T>(defaultValue: T): React.Context<T>;
  export function createElement(
    type: any,
    props?: any,
    ...children: any[]
  ): React.ReactElement;
  export function memo<P>(component: React.FC<P>): React.FC<P>;
  export function forwardRef<T, P>(
    render: (props: P, ref: React.Ref<T>) => React.ReactNode,
  ): React.FC<P>;

  export const Fragment: any;
  export const StrictMode: React.FC<{ children?: React.ReactNode }>;
  export const Suspense: React.FC<{
    children?: React.ReactNode;
    fallback?: React.ReactNode;
  }>;

  export function lazy<T>(loader: () => Promise<{ default: T }>): T;
  export function startTransition(callback: () => void): void;
  export function isValidElement(value: any): boolean;
  export function cloneElement(
    element: React.ReactElement,
    props?: any,
    ...children: any[]
  ): React.ReactElement;

  const React: {
    createElement: typeof createElement;
    Fragment: typeof Fragment;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: any;
  export function jsx(
    type: any,
    props: any,
    key?: string | number,
  ): React.ReactElement;
  export function jsxs(
    type: any,
    props: any,
    key?: string | number,
  ): React.ReactElement;
}

declare module "react/jsx-dev-runtime" {
  export const Fragment: any;
  export function jsxDEV(
    type: any,
    props: any,
    key?: string | number,
    isStaticChildren?: boolean,
    source?: any,
    self?: any,
  ): React.ReactElement;
}

declare module "react-dom" {
  export function createPortal(
    children: React.ReactNode,
    container: Element,
  ): React.ReactElement;
  export function flushSync<T>(callback: () => T): T;
}

declare module "react-dom/client" {
  export function createRoot(container: Element): {
    render: (children: React.ReactNode) => void;
    unmount: () => void;
  };
}
`;

export const codeObjectDeclarationSource = `declare global {
  /** Arguments passed to a Clipper code object on every frame. */
  interface CodeComponentArgs {
    /** Scene time in seconds, sourced from the player clock. */
    time: number;
    /** User-supplied props from the inspector. Source key is stripped. */
    props: Record<string, unknown>;
    /** Object bounds in canvas pixels. */
    size: { width: number; height: number };
  }

  type CodeComponent = (args: CodeComponentArgs) => unknown;

  /** Field types accepted in a propsSchema declaration. */
  type CodePropField =
    | {
        type: "string";
        default?: string;
        label?: string;
        placeholder?: string;
        multiline?: boolean;
      }
    | {
        type: "number";
        default?: number;
        label?: string;
        min?: number;
        max?: number;
        step?: number;
      }
    | { type: "boolean"; default?: boolean; label?: string }
    | { type: "color"; default?: string; label?: string }
    | {
        type: "select";
        options: readonly { value: string; label?: string }[];
        default?: string;
        label?: string;
      };

  type CodePropsSchema = Record<string, CodePropField>;
}

export {};
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
    jsxImportSource: "react",
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.Bundler,
    baseUrl: "file:///",
    paths: { "@clipper/*": ["clipper/projects/*"] },
    strict: true,
    noImplicitAny: false,
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
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    reactRuntimeDeclarationSource,
    "file:///clipper/projects/react-runtime.d.ts",
  );
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    codeObjectDeclarationSource,
    "file:///clipper/projects/code-object.d.ts",
  );
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

type MonacoEditorInstance = {
  getModel: () => unknown;
};

const jsxHighlighterThemeCss = `
.monaco-editor .JSXElement.JSXIdentifier,
.monaco-editor .JSXOpeningElement.JSXIdentifier,
.monaco-editor .JSXClosingElement.JSXIdentifier { color: #9bdcff !important; font-weight: normal !important; }
.monaco-editor .JSXElement.JSXBracket,
.monaco-editor .JSXOpeningElement.JSXBracket,
.monaco-editor .JSXClosingElement.JSXBracket,
.monaco-editor .JSXOpeningFragment.JSXBracket,
.monaco-editor .JSXClosingFragment.JSXBracket,
.monaco-editor .JSXExpressionContainer.JSXBracket,
.monaco-editor .JSXSpreadAttribute.JSXBracket,
.monaco-editor .JSXSpreadChild.JSXBracket { color: #8c929f !important; font-weight: normal !important; }
.monaco-editor .JSXElement.JSXText { color: inherit !important; }
.monaco-editor .JSXAttribute.JSXIdentifier { color: #f0b35c !important; }
`;

let jsxHighlighterThemeInstalled = false;
function installJsxHighlighterTheme() {
  if (jsxHighlighterThemeInstalled) return;
  jsxHighlighterThemeInstalled = true;
  const style = document.createElement("style");
  style.dataset.clipperJsxHighlighter = "theme";
  style.appendChild(document.createTextNode(jsxHighlighterThemeCss));
  document.head.appendChild(style);
}

function unwrapDefault<T>(mod: unknown, namedExport?: string): T {
  let value: unknown = mod;
  for (let i = 0; i < 3; i++) {
    if (typeof value === "function") return value as T;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (namedExport && typeof record[namedExport] === "function") {
        return record[namedExport] as T;
      }
      if ("default" in record) {
        value = record.default;
        continue;
      }
      if (namedExport && namedExport in record) {
        return record[namedExport] as T;
      }
    }
    break;
  }
  return value as T;
}

export function attachJsxHighlighter(
  monaco: unknown,
  editor: MonacoEditorInstance,
): { dispose: () => void } {
  let active = true;
  let innerDispose: (() => void) | null = null;

  void (async () => {
    try {
      const [parserModule, babelTraverseModule, jsxModule] = await Promise.all([
        import("@babel/parser"),
        import("@babel/traverse"),
        import("monaco-jsx-highlighter"),
      ]);
      if (!active) return;
      installJsxHighlighterTheme();
      const parse = unwrapDefault<(code: string, options: unknown) => unknown>(
        parserModule,
        "parse",
      );
      const traverseFn = unwrapDefault<unknown>(babelTraverseModule);
      const Ctor = unwrapDefault<
        new (
          monaco: unknown,
          parse: unknown,
          traverse: unknown,
          editor: unknown,
        ) => {
          highlightOnDidChangeModelContent: (debounceMs?: number) => () => void;
          highlightCode: () => void;
        }
      >(jsxModule);
      const babelParse = (code: string) =>
        parse(code, {
          sourceType: "module",
          errorRecovery: true,
          plugins: ["jsx", "typescript"],
        });
      const highlighter = new Ctor(monaco, babelParse, traverseFn, editor);
      innerDispose = highlighter.highlightOnDidChangeModelContent(100);
      try {
        highlighter.highlightCode();
      } catch (error) {
        console.error("Initial JSX highlight failed", error);
      }
    } catch (error) {
      console.error("Failed to attach JSX highlighter", error);
    }
  })();

  return {
    dispose: () => {
      active = false;
      innerDispose?.();
      innerDispose = null;
    },
  };
}
