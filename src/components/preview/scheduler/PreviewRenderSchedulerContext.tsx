import { createContext, useContext, type ReactNode } from "react";
import type { PreviewRenderScheduler } from "./usePreviewRenderScheduler";

const PreviewRenderSchedulerContext =
  createContext<PreviewRenderScheduler | null>(null);

export function PreviewRenderSchedulerProvider({
  children,
  scheduler,
}: {
  children: ReactNode;
  scheduler: PreviewRenderScheduler;
}) {
  return (
    <PreviewRenderSchedulerContext.Provider value={scheduler}>
      {children}
    </PreviewRenderSchedulerContext.Provider>
  );
}

export function useOptionalPreviewRenderScheduler() {
  return useContext(PreviewRenderSchedulerContext);
}
