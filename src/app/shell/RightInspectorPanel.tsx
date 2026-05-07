import type { ReactNode } from "react";
import { sectionTitle, segmentedTabActive, segmentedTabBase, segmentedTabInactive } from "../config";
import type { RightPanelTab } from "../types";

type RightInspectorPanelProps = {
  activeTab: RightPanelTab;
  children: ReactNode;
  validationErrors: string[];
  onTabChange: (tab: RightPanelTab) => void;
};

const tabs: RightPanelTab[] = ["video", "animation", "agent"];

export function RightInspectorPanel({ activeTab, children, validationErrors, onTabChange }: RightInspectorPanelProps) {
  return (
    <aside className="min-h-0 overflow-auto border-l border-[#2d313b] bg-[#171920] p-4" data-inspector-panel>
      <section className="mb-3 grid gap-2.5">
        <h2 className={sectionTitle}>Inspector</h2>
        <div className="grid grid-cols-3 gap-1">
          {tabs.map((tab) => <button className={`${segmentedTabBase} capitalize ${activeTab === tab ? segmentedTabActive : segmentedTabInactive}`} key={tab} onClick={() => onTabChange(tab)}>{tab}</button>)}
        </div>
      </section>
      <section className="mb-5 grid gap-2.5">{children}</section>
      {validationErrors.length > 0 ? <section className="mb-5 grid gap-2.5 text-[#ffbf66]"><h2 className={sectionTitle}>Validation</h2>{validationErrors.map((error) => <p key={error}>{error}</p>)}</section> : null}
    </aside>
  );
}
