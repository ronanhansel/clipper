import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  Camera as CameraIcon,
  Code as CodeIcon,
  Hand,
  Image as ImageIcon,
  MoveDiagonal2,
  MousePointer2 as PointerIcon,
  PenTool,
  Pencil,
  Type,
  Waypoints,
} from "lucide-react";
import {
  ArrowIcon,
  EllipseIcon,
  LineIcon,
  NullObjectIcon,
  Pattern2DIcon,
  PolygonIcon,
  RectIcon,
  StarIcon,
} from "../../components/ShapeIcons";
import type { ComposeCursorTool } from "../features/compose/composeDrawing";

export type ComposeDrawTool =
  | "rect"
  | "line"
  | "arrow"
  | "ellipse"
  | "polygon"
  | "star"
  | "pen"
  | "pencil"
  | "text"
  | "textPath"
  | "pattern2d"
  | "null"
  | "code";

export type ComposeToolbarProps = {
  activeTool: ComposeDrawTool | null;
  onAddNullObject: () => void;
  onAddCamera: () => void;
  onAddMediaObject: () => void;
  onAddCodeObject: () => void;
  onActiveToolChange: (tool: ComposeDrawTool | null) => void;
  activeCursorTool: ComposeCursorTool;
  onCursorToolChange: (tool: ComposeCursorTool) => void;
  resizeMode: "resize" | "scale";
  onResizeModeChange: (mode: "resize" | "scale") => void;
};

type ToolbarTool = {
  tool: ComposeDrawTool;
  label: string;
  shortcut?: string;
  icon: ReactNode;
};

type CursorToolbarTool = {
  tool: ComposeCursorTool;
  label: string;
  shortcut: string;
  icon: ReactNode;
};

const cursorTools: CursorToolbarTool[] = [
  {
    tool: "select",
    label: "Select",
    shortcut: "V",
    icon: <PointerIcon size={17} />,
  },
  {
    tool: "scale",
    label: "Scale",
    shortcut: "K",
    icon: <MoveDiagonal2 size={15} />,
  },
  {
    tool: "hand",
    label: "Hand",
    shortcut: "H",
    icon: <Hand size={17} />,
  },
];

const shapeTools: ToolbarTool[] = [
  {
    tool: "rect",
    label: "Rectangle",
    shortcut: "R",
    icon: <RectIcon size={17} />,
  },
  { tool: "line", label: "Line", shortcut: "L", icon: <LineIcon size={18} /> },
  {
    tool: "arrow",
    label: "Arrow",
    shortcut: "Shift L",
    icon: <ArrowIcon size={18} />,
  },
  {
    tool: "ellipse",
    label: "Ellipse",
    shortcut: "O",
    icon: <EllipseIcon size={17} />,
  },
  { tool: "polygon", label: "Polygon", icon: <PolygonIcon size={18} /> },
  { tool: "star", label: "Star", icon: <StarIcon size={18} /> },
];

const penTools: ToolbarTool[] = [
  { tool: "pen", label: "Pen", shortcut: "P", icon: <PenTool size={18} /> },
  {
    tool: "pencil",
    label: "Pencil",
    shortcut: "Shift P",
    icon: <Pencil size={18} />,
  },
];

const textTools: ToolbarTool[] = [
  { tool: "text", label: "Text", shortcut: "T", icon: <Type size={19} /> },
  { tool: "textPath", label: "Text on path", icon: <Waypoints size={18} /> },
];

type ObjectAddToolKey = "null" | "camera";

type ObjectAddTool = {
  key: ObjectAddToolKey;
  label: string;
  shortcut?: string;
  icon: ReactNode;
};

const objectAddTools: ObjectAddTool[] = [
  {
    key: "null",
    label: "Null object",
    shortcut: "N",
    icon: <NullObjectIcon size={18} />,
  },
  {
    key: "camera",
    label: "Camera",
    icon: <CameraIcon size={17} />,
  },
];

type GeneratorToolKey = "pattern2d" | "media" | "code";

type GeneratorTool = {
  key: GeneratorToolKey;
  label: string;
  shortcut?: string;
  icon: ReactNode;
};

const generatorTools: GeneratorTool[] = [
  {
    key: "pattern2d",
    label: "2D pattern",
    shortcut: "G",
    icon: <Pattern2DIcon size={18} />,
  },
  {
    key: "media",
    label: "Media",
    icon: <ImageIcon size={17} />,
  },
  {
    key: "code",
    label: "Code",
    icon: <CodeIcon size={17} />,
  },
];

function ShortcutHint({ shortcut }: { shortcut?: string }) {
  if (!shortcut) return <span />;
  return (
    <span className="flex items-center gap-0.5 justify-self-end">
      {shortcut.split(" ").map((key) => (
        <kbd
          key={key}
          className="min-w-4 rounded-[4px] border border-[#343a47] bg-[#1a1e27] px-1 py-0.5 text-center text-[10px] font-bold leading-none text-[#aeb4c3] shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function ComposeToolbar({
  activeTool,
  onAddNullObject,
  onAddCamera,
  onAddMediaObject,
  onAddCodeObject,
  onActiveToolChange,
  activeCursorTool,
  onCursorToolChange,
  onResizeModeChange,
}: ComposeToolbarProps) {
  const [openMenu, setOpenMenu] = useState<
    "shapes" | "pen" | "text" | "object" | "generator" | null
  >(null);
  const [lastShapeTool, setLastShapeTool] = useState<ComposeDrawTool>("rect");
  const [lastPenTool, setLastPenTool] = useState<ComposeDrawTool>("pen");
  const [lastTextTool, setLastTextTool] = useState<ComposeDrawTool>("text");
  const [lastObjectAddTool, setLastObjectAddTool] =
    useState<ObjectAddToolKey>("null");
  const [lastGeneratorTool, setLastGeneratorTool] =
    useState<GeneratorToolKey>("pattern2d");
  const activeShapeTool = shapeTools.find((item) => item.tool === activeTool);
  const activePenTool = penTools.find((item) => item.tool === activeTool);
  const activeTextTool = textTools.find((item) => item.tool === activeTool);
  const currentShapeTool =
    activeShapeTool ?? shapeTools.find((item) => item.tool === lastShapeTool)!;
  const currentPenTool =
    activePenTool ?? penTools.find((item) => item.tool === lastPenTool)!;
  const currentTextTool =
    activeTextTool ?? textTools.find((item) => item.tool === lastTextTool)!;
  const currentObjectAddTool =
    objectAddTools.find((item) => item.key === lastObjectAddTool) ??
    objectAddTools[0];
  const generatorActive = activeTool === "pattern2d";
  const currentGeneratorTool =
    (generatorActive
      ? generatorTools.find((item) => item.key === "pattern2d")
      : generatorTools.find((item) => item.key === lastGeneratorTool)) ??
    generatorTools[0];
  const cursorActive = activeTool === null;

  const toolButtonClass = (active: boolean) =>
    `grid h-8 w-8 place-items-center rounded-[7px] outline-none transition focus-visible:ring-2 focus-visible:ring-[rgb(var(--clipper-accent-rgb)/0.32)] ${active ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)] shadow-[0_0_0_3px_rgb(var(--clipper-accent-rgb)/0.12)]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-white"}`;
  const menuButtonClass = (active: boolean) =>
    `grid h-8 w-4 place-items-center rounded-[6px] outline-none transition focus-visible:ring-2 focus-visible:ring-[rgb(var(--clipper-accent-rgb)/0.32)] ${active ? "bg-[#252a35] text-white" : "text-[#9b9da7] hover:bg-[#20232c] hover:text-white"}`;

  function selectTool(tool: ToolbarTool) {
    if (shapeTools.some((item) => item.tool === tool.tool))
      setLastShapeTool(tool.tool);
    if (penTools.some((item) => item.tool === tool.tool))
      setLastPenTool(tool.tool);
    if (textTools.some((item) => item.tool === tool.tool))
      setLastTextTool(tool.tool);
    onActiveToolChange(tool.tool);
    setOpenMenu(null);
  }

  function selectCursorTool(tool: ComposeCursorTool) {
    onActiveToolChange(null);
    onCursorToolChange(tool);
    if (tool === "select") onResizeModeChange("resize");
    else if (tool === "scale") onResizeModeChange("scale");
    setOpenMenu(null);
  }

  function invokeObjectAddTool(tool: ObjectAddTool) {
    setLastObjectAddTool(tool.key);
    if (tool.key === "null") onAddNullObject();
    else if (tool.key === "camera") onAddCamera();
    setOpenMenu(null);
  }

  function invokeGeneratorTool(tool: GeneratorTool) {
    setLastGeneratorTool(tool.key);
    if (tool.key === "pattern2d") {
      selectTool({
        tool: "pattern2d",
        label: "2D pattern",
        shortcut: "G",
        icon: <Pattern2DIcon size={18} />,
      });
    } else if (tool.key === "code") {
      onAddCodeObject();
      setOpenMenu(null);
    } else if (tool.key === "media") {
      onAddMediaObject();
      setOpenMenu(null);
    }
  }

  function renderMenu(
    menu: "shapes" | "pen" | "text",
    tools: ToolbarTool[],
    widthClass: string,
  ) {
    if (openMenu !== menu) return null;
    return (
      <div
        className={`absolute bottom-full left-0 mb-2 rounded-[10px] border border-[#2d313b] bg-[#11141a] p-1.5 text-[#f7f7f8] shadow-[0_18px_60px_rgba(0,0,0,0.42)] ${widthClass}`}
      >
        <div className="grid gap-0.5">
          {tools.map((item) => (
            <button
              key={item.tool}
              className="grid h-7 grid-cols-[14px_22px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[11px] font-semibold leading-none text-[#dfe2ea] outline-none transition hover:bg-[#20232c] hover:text-white focus-visible:bg-[#20232c] focus-visible:text-white"
              onClick={() => selectTool(item)}
            >
              <span className="grid place-items-center text-[11px] text-[var(--clipper-accent)]">
                {activeTool === item.tool ? "✓" : null}
              </span>
              <span className="grid place-items-center [&_svg]:size-4">
                {item.icon}
              </span>
              <span className="min-w-0 truncate">{item.label}</span>
              <ShortcutHint shortcut={item.shortcut} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderObjectAddMenu() {
    if (openMenu !== "object") return null;
    return (
      <div className="absolute bottom-full left-0 mb-2 w-[196px] rounded-[10px] border border-[#2d313b] bg-[#11141a] p-1.5 text-[#f7f7f8] shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
        <div className="grid gap-0.5">
          {objectAddTools.map((item) => (
            <button
              key={item.key}
              className="grid h-7 grid-cols-[14px_22px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[11px] font-semibold leading-none text-[#dfe2ea] outline-none transition hover:bg-[#20232c] hover:text-white focus-visible:bg-[#20232c] focus-visible:text-white"
              onClick={() => invokeObjectAddTool(item)}
            >
              <span className="grid place-items-center text-[11px] text-[var(--clipper-accent)]">
                {currentObjectAddTool.key === item.key ? "✓" : null}
              </span>
              <span className="grid place-items-center [&_svg]:size-4">
                {item.icon}
              </span>
              <span className="min-w-0 truncate">{item.label}</span>
              <ShortcutHint shortcut={item.shortcut} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderGeneratorMenu() {
    if (openMenu !== "generator") return null;
    return (
      <div className="absolute bottom-full left-0 mb-2 w-[196px] rounded-[10px] border border-[#2d313b] bg-[#11141a] p-1.5 text-[#f7f7f8] shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
        <div className="grid gap-0.5">
          {generatorTools.map((item) => {
            const checked =
              item.key === "pattern2d"
                ? generatorActive
                : currentGeneratorTool.key === item.key && !generatorActive;
            return (
              <button
                key={item.key}
                className="grid h-7 grid-cols-[14px_22px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[11px] font-semibold leading-none text-[#dfe2ea] outline-none transition hover:bg-[#20232c] hover:text-white focus-visible:bg-[#20232c] focus-visible:text-white"
                onClick={() => invokeGeneratorTool(item)}
              >
                <span className="grid place-items-center text-[11px] text-[var(--clipper-accent)]">
                  {checked ? "✓" : null}
                </span>
                <span className="grid place-items-center [&_svg]:size-4">
                  {item.icon}
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
                <ShortcutHint shortcut={item.shortcut} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-[10px] border border-[#2d313b] bg-[#151820]/95 p-1 shadow-[0_14px_38px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
        <div className="relative flex items-center gap-1">
          {cursorTools.map((item) => (
            <button
              key={item.tool}
              className={toolButtonClass(
                cursorActive && activeCursorTool === item.tool,
              )}
              title={`${item.label} (${item.shortcut})`}
              aria-pressed={cursorActive && activeCursorTool === item.tool}
              onClick={() => selectCursorTool(item.tool)}
            >
              {item.icon}
            </button>
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-[#313744]" />
        <div className="relative flex items-center gap-1">
          {renderMenu("shapes", shapeTools, "w-[224px]")}
          <button
            className={toolButtonClass(Boolean(activeShapeTool))}
            title={`Draw ${currentShapeTool.label.toLowerCase()}`}
            aria-pressed={Boolean(activeShapeTool)}
            onClick={() => selectTool(currentShapeTool)}
          >
            {currentShapeTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "shapes")}
            title="Shape tools"
            onClick={() => setOpenMenu(openMenu === "shapes" ? null : "shapes")}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="relative flex items-center gap-1">
          {renderMenu("pen", penTools, "w-[188px]")}
          <button
            className={toolButtonClass(Boolean(activePenTool))}
            title={currentPenTool.label}
            aria-pressed={Boolean(activePenTool)}
            onClick={() => selectTool(currentPenTool)}
          >
            {currentPenTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "pen")}
            title="Pen tools"
            onClick={() => setOpenMenu(openMenu === "pen" ? null : "pen")}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="relative flex items-center gap-1">
          {renderMenu("text", textTools, "w-[196px]")}
          <button
            className={toolButtonClass(Boolean(activeTextTool))}
            title={currentTextTool.label}
            aria-pressed={Boolean(activeTextTool)}
            onClick={() => selectTool(currentTextTool)}
          >
            {currentTextTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "text")}
            title="Text tools"
            onClick={() => setOpenMenu(openMenu === "text" ? null : "text")}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="mx-1 h-6 w-px bg-[#313744]" />
        <div className="relative flex items-center gap-1">
          {renderGeneratorMenu()}
          <button
            className={toolButtonClass(generatorActive)}
            title={currentGeneratorTool.label}
            aria-pressed={generatorActive}
            onClick={() => invokeGeneratorTool(currentGeneratorTool)}
          >
            {currentGeneratorTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "generator")}
            title="Generator tools"
            onClick={() =>
              setOpenMenu(openMenu === "generator" ? null : "generator")
            }
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="relative flex items-center gap-1">
          {renderObjectAddMenu()}
          <button
            className={toolButtonClass(false)}
            title={currentObjectAddTool.label}
            aria-pressed={false}
            onClick={() => invokeObjectAddTool(currentObjectAddTool)}
          >
            {currentObjectAddTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "object")}
            title="Object tools"
            onClick={() => setOpenMenu(openMenu === "object" ? null : "object")}
          >
            <ChevronDown size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
