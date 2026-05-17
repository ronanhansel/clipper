import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type PropsWithChildren,
} from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { TimelineMode } from "../../core/types";

export type PreviewRenderState = {
  timelineMode: TimelineMode;
  renderMode: "preview" | "export";
  isPlaying: boolean;
  canSelect: boolean;
  frameScale: number;
  animationsEnabled: boolean;
};

type PreviewRenderStore = PreviewRenderState & {
  setState: (state: Partial<PreviewRenderState>) => void;
};

const PreviewRenderStoreContext =
  createContext<StoreApi<PreviewRenderStore> | null>(null);

function createPreviewRenderStore(
  initial: PreviewRenderState,
): StoreApi<PreviewRenderStore> {
  return createStore<PreviewRenderStore>((set) => ({
    ...initial,
    setState: (patch) =>
      set((current) => {
        const next: Partial<PreviewRenderState> = {};
        for (const key in patch) {
          const k = key as keyof PreviewRenderState;
          if (!Object.is(current[k], patch[k])) {
            (next as Record<string, unknown>)[k] = patch[k];
          }
        }
        return next;
      }),
  }));
}

export function PreviewRenderProvider({
  children,
  initial,
}: PropsWithChildren<{ initial: PreviewRenderState }>) {
  const storeRef = useRef<StoreApi<PreviewRenderStore> | null>(null);
  if (!storeRef.current) storeRef.current = createPreviewRenderStore(initial);

  useLayoutEffect(() => {
    storeRef.current?.getState().setState(initial);
  }, [initial]);

  return (
    <PreviewRenderStoreContext.Provider value={storeRef.current}>
      {children}
    </PreviewRenderStoreContext.Provider>
  );
}

export function usePreviewRenderStore<T>(
  selector: (store: PreviewRenderState) => T,
): T {
  const store = useContext(PreviewRenderStoreContext);
  if (!store)
    throw new Error(
      "usePreviewRenderStore must be used within PreviewRenderProvider",
    );
  return useStore(store, selector);
}
