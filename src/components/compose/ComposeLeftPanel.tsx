import { memo } from "react";
import { Bin, type BinProps } from "../Bin";

type ComposeLeftPanelProps = {
  binProps: BinProps;
};

export function ComposeLeftPanel(props: ComposeLeftPanelProps) {
  return <MemoizedComposeLeftPanel {...props} />;
}

const MemoizedComposeLeftPanel = memo(function ComposeLeftPanelContent({
  binProps,
}: ComposeLeftPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 overflow-hidden">
        <Bin {...binProps} />
      </div>
    </div>
  );
});
