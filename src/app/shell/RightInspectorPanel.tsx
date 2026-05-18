import { memo, type ReactNode } from "react";
import { sectionTitle } from "../config";

type RightInspectorPanelProps = {
  children: ReactNode;
  validationErrors: string[];
};

export const RightInspectorPanel = memo(function RightInspectorPanel({
  children,
  validationErrors,
}: RightInspectorPanelProps) {
  return (
    <aside
      className="min-h-0 overflow-auto border-l border-[#2d313b] bg-[#171920] p-4"
      data-inspector-panel
    >
      <section className="mb-5 grid gap-2.5">{children}</section>
      {validationErrors.length > 0 ? (
        <section className="mb-5 grid gap-2.5 text-[#ffbf66]">
          <h2 className={sectionTitle}>Validation</h2>
          {validationErrors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </section>
      ) : null}
    </aside>
  );
});
