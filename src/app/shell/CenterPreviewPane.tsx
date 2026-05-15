import { memo, useState, type ComponentProps } from "react";
import { PlaybackBar, type PlaybackBarProps } from "./PlaybackBar";
import { PreviewColumn } from "./PreviewColumn";

type CenterPreviewPaneProps = Omit<
  ComponentProps<typeof PreviewColumn>,
  "children" | "onPointerEnter" | "onPointerLeave"
> & {
  playbackBarProps: Omit<PlaybackBarProps, "previewColumnHovered">;
};

export const CenterPreviewPane = memo(function CenterPreviewPane({
  playbackBarProps,
  ...previewColumnProps
}: CenterPreviewPaneProps) {
  const [previewColumnHovered, setPreviewColumnHovered] = useState(false);

  return (
    <PreviewColumn
      {...previewColumnProps}
      onPointerEnter={() => setPreviewColumnHovered(true)}
      onPointerLeave={() => setPreviewColumnHovered(false)}
    >
      <PlaybackBar
        {...playbackBarProps}
        previewColumnHovered={previewColumnHovered}
      />
    </PreviewColumn>
  );
});
