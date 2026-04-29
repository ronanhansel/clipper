import { createContext, useContext, useLayoutEffect, useRef, type PropsWithChildren } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { TimelinePanel, type TimelinePanelProps } from "../../../components/timeline/TimelinePanel";

type TimelineStore = {
  panelProps: TimelinePanelProps;
  setPanelProps: (panelProps: TimelinePanelProps) => void;
};

const TimelineStoreContext = createContext<StoreApi<TimelineStore> | null>(null);

function createTimelineStore(panelProps: TimelinePanelProps) {
  return createStore<TimelineStore>((set) => ({
    panelProps,
    setPanelProps: (nextPanelProps) => set({ panelProps: nextPanelProps }),
  }));
}

export function TimelineProvider({ children, panelProps }: PropsWithChildren<{ panelProps: TimelinePanelProps }>) {
  const storeRef = useRef<StoreApi<TimelineStore> | null>(null);
  if (!storeRef.current) storeRef.current = createTimelineStore(panelProps);

  useLayoutEffect(() => {
    storeRef.current?.getState().setPanelProps(panelProps);
  }, [panelProps]);

  return <TimelineStoreContext.Provider value={storeRef.current}>{children}</TimelineStoreContext.Provider>;
}

export function useTimelineStore<T>(selector: (store: TimelineStore) => T) {
  const store = useContext(TimelineStoreContext);
  if (!store) throw new Error("useTimelineStore must be used within TimelineProvider");
  return useStore(store, selector);
}

export function ConnectedTimelinePanel() {
  const panelProps = useTimelineStore(useShallow((store) => store.panelProps));
  return <TimelinePanel {...panelProps} />;
}
