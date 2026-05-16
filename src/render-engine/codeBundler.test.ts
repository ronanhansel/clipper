import { describe, expect, it } from "vitest";
import {
  buildReactDomShimSource,
  buildReactJsxDevRuntimeShimSource,
  buildReactJsxRuntimeShimSource,
  buildReactShimSource,
  codeBundlerHostGlobalKey,
} from "./codeBundlerExternals";

describe("codeBundler externals shim builders", () => {
  it("uses the documented global bridge key", () => {
    expect(codeBundlerHostGlobalKey).toBe("__clipperCodeBundlerHost");
  });

  it("react shim references the global bridge and throws when missing", () => {
    const source = buildReactShimSource();
    expect(source).toContain(`globalThis["${codeBundlerHostGlobalKey}"]`);
    expect(source).toContain(
      'throw new Error("Clipper code bundler host bridge missing.")',
    );
    expect(source).toContain("const ns = bridge.react;");
    expect(source).toContain("export default ns.default ?? ns;");
  });

  it("react shim re-exports the hooks code objects rely on", () => {
    const source = buildReactShimSource();
    for (const name of [
      "useState",
      "useEffect",
      "useMemo",
      "useCallback",
      "useRef",
      "createElement",
      "Fragment",
      "memo",
      "forwardRef",
      "createContext",
      "useContext",
    ]) {
      expect(source).toContain(`export const ${name} = ns.${name};`);
    }
  });

  it("react-dom shim binds to the reactDom bridge slot", () => {
    const source = buildReactDomShimSource();
    expect(source).toContain(`globalThis["${codeBundlerHostGlobalKey}"]`);
    expect(source).toContain("const ns = bridge.reactDom;");
    expect(source).toContain("export const createPortal = ns.createPortal;");
    expect(source).toContain("export const flushSync = ns.flushSync;");
  });

  it("react/jsx-runtime shim re-exports jsx, jsxs, Fragment", () => {
    const source = buildReactJsxRuntimeShimSource();
    expect(source).toContain("const ns = bridge.reactJsxRuntime;");
    expect(source).toContain("export const jsx = ns.jsx;");
    expect(source).toContain("export const jsxs = ns.jsxs;");
    expect(source).toContain("export const Fragment = ns.Fragment;");
  });

  it("react/jsx-dev-runtime shim re-exports jsxDEV, Fragment", () => {
    const source = buildReactJsxDevRuntimeShimSource();
    expect(source).toContain("const ns = bridge.reactJsxDevRuntime;");
    expect(source).toContain("export const jsxDEV = ns.jsxDEV;");
    expect(source).toContain("export const Fragment = ns.Fragment;");
  });
});
