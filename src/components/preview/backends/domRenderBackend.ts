import { createElement } from "react";
import { DomBackend } from "./DomBackend";
import type {
  CompositionRenderInput,
  CompositionRenderResult,
  RenderBackend,
  RenderBackendCapabilities,
} from "./types";
import type { CompositionBackendProps } from "./CompositionBackend";

const capabilities: RenderBackendCapabilities = {
  kind: "dom",
  supportsRasterCache: false,
  supportsPostProcess: false,
};

export function createDomRenderBackend(): RenderBackend {
  return {
    capabilities,
    renderComposition(input: CompositionRenderInput): CompositionRenderResult {
      const dom = input.dom;
      if (!dom) return { rendered: false };
      const props: CompositionBackendProps = {
        ...dom,
        part: input.composition,
        localTime: input.localTime,
        duration: input.duration,
      };
      return { node: createElement(DomBackend, props), rendered: true };
    },
    destroy() {},
  };
}
