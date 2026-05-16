export const codeBundlerHostGlobalKey = "__clipperCodeBundlerHost";

export type CodeBundlerHostBridge = {
  react: unknown;
  reactDom: unknown;
  reactJsxRuntime: unknown;
  reactJsxDevRuntime: unknown;
};

declare global {
  interface Window {
    [codeBundlerHostGlobalKey]?: CodeBundlerHostBridge;
  }
}

export async function ensureCodeBundlerHostBridge(): Promise<void> {
  if (typeof globalThis === "undefined") return;
  const target = globalThis as typeof globalThis & {
    [codeBundlerHostGlobalKey]?: CodeBundlerHostBridge;
  };
  if (target[codeBundlerHostGlobalKey]) return;

  const [react, reactDom, reactJsxRuntime, reactJsxDevRuntime] =
    await Promise.all([
      import("react"),
      import("react-dom"),
      import("react/jsx-runtime"),
      import("react/jsx-dev-runtime").catch(() => null),
    ]);

  target[codeBundlerHostGlobalKey] = {
    react,
    reactDom,
    reactJsxRuntime,
    reactJsxDevRuntime: reactJsxDevRuntime ?? reactJsxRuntime,
  };
}

const reactExportNames = [
  "Children",
  "Component",
  "Fragment",
  "PureComponent",
  "StrictMode",
  "Suspense",
  "cloneElement",
  "createContext",
  "createElement",
  "createRef",
  "forwardRef",
  "isValidElement",
  "lazy",
  "memo",
  "startTransition",
  "useCallback",
  "useContext",
  "useDebugValue",
  "useDeferredValue",
  "useEffect",
  "useId",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useMemo",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
  "version",
];

const reactDomExportNames = [
  "createPortal",
  "flushSync",
  "preconnect",
  "prefetchDNS",
  "preinit",
  "preinitModule",
  "preload",
  "preloadModule",
  "version",
];

const jsxRuntimeExportNames = ["jsx", "jsxs", "Fragment"];
const jsxDevRuntimeExportNames = ["jsxDEV", "Fragment"];

export function buildReactShimSource(): string {
  return buildShimFor("react", reactExportNames);
}

export function buildReactDomShimSource(): string {
  return buildShimFor("reactDom", reactDomExportNames);
}

export function buildReactJsxRuntimeShimSource(): string {
  return buildShimFor("reactJsxRuntime", jsxRuntimeExportNames);
}

export function buildReactJsxDevRuntimeShimSource(): string {
  return buildShimFor("reactJsxDevRuntime", jsxDevRuntimeExportNames);
}

function buildShimFor(
  bridgeKey: keyof CodeBundlerHostBridge,
  exportNames: string[],
): string {
  const namedExports = exportNames
    .map((name) => `export const ${name} = ns.${name};`)
    .join("\n");
  return [
    `const bridge = globalThis["${codeBundlerHostGlobalKey}"];`,
    `if (!bridge) throw new Error("Clipper code bundler host bridge missing.");`,
    `const ns = bridge.${bridgeKey};`,
    `export default ns.default ?? ns;`,
    namedExports,
  ].join("\n");
}
