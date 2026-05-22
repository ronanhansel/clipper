import type * as esbuildModule from "esbuild-wasm";
import {
  buildReactDomShimSource,
  buildReactJsxDevRuntimeShimSource,
  buildReactJsxRuntimeShimSource,
  buildReactShimSource,
  ensureCodeBundlerHostBridge,
} from "./codeBundlerExternals";

export type CodeBundleSuccess = {
  ok: true;
  hash: string;
  code: string;
};

export type CodeBundleFailure = {
  ok: false;
  message: string;
  location?: { file: string; line: number; column: number };
};

export type CodeBundleResult = CodeBundleSuccess | CodeBundleFailure;

export type ResolvedAsset = {
  absolutePath: string;
  source: string;
  loader: "tsx" | "ts" | "jsx" | "js";
};

export type AssetResolver = (
  importPath: string,
  importer: string | null,
) => Promise<ResolvedAsset | null>;

type EsbuildRuntimeState = {
  modulePromise: Promise<typeof esbuildModule> | null;
  initializePromise: Promise<void> | null;
};

const ESBUILD_RUNTIME_STATE_KEY = "__clipperEsbuildRuntimeState";

type EsbuildRuntimeGlobal = typeof globalThis & {
  [ESBUILD_RUNTIME_STATE_KEY]?: EsbuildRuntimeState;
};

function getEsbuildRuntimeState(): EsbuildRuntimeState {
  const runtimeGlobal = globalThis as EsbuildRuntimeGlobal;
  if (!runtimeGlobal[ESBUILD_RUNTIME_STATE_KEY]) {
    runtimeGlobal[ESBUILD_RUNTIME_STATE_KEY] = {
      modulePromise: null,
      initializePromise: null,
    };
  }
  return runtimeGlobal[ESBUILD_RUNTIME_STATE_KEY];
}

function isDuplicateInitializeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Cannot call "initialize" more than once')
  );
}

async function loadEsbuild(): Promise<typeof esbuildModule> {
  const state = getEsbuildRuntimeState();
  if (!state.modulePromise)
    state.modulePromise =
      import("esbuild-wasm/esm/browser.js") as unknown as Promise<
        typeof esbuildModule
      >;
  return state.modulePromise;
}

async function ensureEsbuildInitialized(): Promise<void> {
  const state = getEsbuildRuntimeState();
  if (state.initializePromise) return state.initializePromise;

  state.initializePromise = loadEsbuild().then((esbuild) =>
    esbuild.initialize({
      wasmURL: new URL(
        "../../node_modules/esbuild-wasm/esbuild.wasm",
        import.meta.url,
      ).toString(),
    }),
  );
  state.initializePromise = state.initializePromise.catch((error) => {
    if (isDuplicateInitializeError(error)) return;
    state.initializePromise = null;
    throw error;
  });
  return state.initializePromise;
}

const reactShimNamespace = "clipper-react-shim";
const codeAssetNamespace = "clipper-code-asset";

const reactShimEntryPath = "/__clipper-react";
const reactDomShimEntryPath = "/__clipper-react-dom";
const reactJsxRuntimeShimEntryPath = "/__clipper-react-jsx-runtime";
const reactJsxDevRuntimeShimEntryPath = "/__clipper-react-jsx-dev-runtime";

const externalShimMap: Record<string, { path: string; source: string }> = {
  react: { path: reactShimEntryPath, source: "" },
  "react-dom": { path: reactDomShimEntryPath, source: "" },
  "react-dom/client": { path: reactDomShimEntryPath, source: "" },
  "react/jsx-runtime": {
    path: reactJsxRuntimeShimEntryPath,
    source: "",
  },
  "react/jsx-dev-runtime": {
    path: reactJsxDevRuntimeShimEntryPath,
    source: "",
  },
};

function getReactShimSource(path: string): string {
  if (path === reactShimEntryPath) return buildReactShimSource();
  if (path === reactDomShimEntryPath) return buildReactDomShimSource();
  if (path === reactJsxRuntimeShimEntryPath)
    return buildReactJsxRuntimeShimSource();
  if (path === reactJsxDevRuntimeShimEntryPath)
    return buildReactJsxDevRuntimeShimSource();
  return "";
}

export async function bundleCodeAsset(
  entry: ResolvedAsset,
  resolveImport: AssetResolver,
): Promise<CodeBundleResult> {
  await ensureCodeBundlerHostBridge();
  const esbuild = await loadEsbuild();
  await ensureEsbuildInitialized();

  const entryStdinPath = entry.absolutePath;
  try {
    const result = await esbuild.build({
      stdin: {
        contents: entry.source,
        sourcefile: entryStdinPath,
        loader: entry.loader,
        resolveDir: posixDirname(entryStdinPath),
      },
      bundle: true,
      format: "esm",
      jsx: "automatic",
      jsxImportSource: "react",
      target: ["es2022"],
      sourcemap: "inline",
      logLevel: "silent",
      write: false,
      treeShaking: true,
      minify: false,
      platform: "browser",
      plugins: [createCodeBundlerPlugin(resolveImport)],
    });

    const output = result.outputFiles?.[0]?.text ?? "";
    const hash = await sha256Hex(output);
    return { ok: true, hash, code: output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bundle failed.";
    const location = extractEsbuildLocation(error);
    return { ok: false, message, location };
  }
}

function createCodeBundlerPlugin(
  resolveImport: AssetResolver,
): esbuildModule.Plugin {
  return {
    name: "clipper-code-bundler",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === "entry-point") return null;

        const externalShim = externalShimMap[args.path];
        if (externalShim)
          return { path: externalShim.path, namespace: reactShimNamespace };

        const importerNamespace = args.namespace;
        const importerPath =
          importerNamespace === codeAssetNamespace ? args.importer : null;

        const resolved = await resolveImport(args.path, importerPath);
        if (resolved)
          return {
            path: resolved.absolutePath,
            namespace: codeAssetNamespace,
            pluginData: { resolved },
          };
        return null;
      });

      build.onLoad({ filter: /.*/, namespace: reactShimNamespace }, (args) => ({
        contents: getReactShimSource(args.path),
        loader: "js",
      }));

      build.onLoad({ filter: /.*/, namespace: codeAssetNamespace }, (args) => {
        const resolved = args.pluginData?.resolved as ResolvedAsset | undefined;
        if (!resolved) return null;
        return {
          contents: resolved.source,
          loader: resolved.loader,
          resolveDir: posixDirname(resolved.absolutePath),
        };
      });
    },
  };
}

function posixDirname(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  if (idx < 0) return "";
  return filePath.slice(0, idx) || "/";
}

function extractEsbuildLocation(
  error: unknown,
): CodeBundleFailure["location"] | undefined {
  if (!error || typeof error !== "object") return undefined;
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const first = errors[0] as {
    location?: { file?: string; line?: number; column?: number };
  };
  const location = first.location;
  if (!location || typeof location.file !== "string") return undefined;
  return {
    file: location.file,
    line: typeof location.line === "number" ? location.line : 0,
    column: typeof location.column === "number" ? location.column : 0,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const cryptoSource = (
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  ) as Crypto | undefined;
  if (cryptoSource?.subtle) {
    const buffer = new TextEncoder().encode(input);
    const digest = await cryptoSource.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return hashFnv1a(input);
}

function hashFnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
