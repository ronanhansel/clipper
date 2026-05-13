export const graphicDefaultFontFamily =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

type GraphicControlField = {
  key: string;
  label: string;
  type: "number" | "color" | "text";
  defaultValue: string | number;
  min?: number;
  max?: number;
  step?: number;
};

type GraphicControlGroup = {
  id: string;
  label: string;
  columns?: number;
  fields: readonly GraphicControlField[];
};

export const graphicBoundsKeys = ["x", "y", "width", "height"] as const;

export const graphicCornerRadiusFields = [
  ["borderTopLeftRadius", "Top left"],
  ["borderTopRightRadius", "Top right"],
  ["borderBottomRightRadius", "Bottom right"],
  ["borderBottomLeftRadius", "Bottom left"],
] as const;

export const graphicTextDefaults = {
  content: "Text",
  x: 0,
  y: 0,
  width: 320,
  height: 96,
  color: "#ffffff",
  fontFamily: graphicDefaultFontFamily,
  fontSize: 48,
  fontWeight: 700,
  lineHeight: 1.1,
  letterSpacing: 0,
  fontStyle: "normal",
  textDecoration: "none",
  textAlign: "left",
  verticalAlign: "middle",
  textBoxLayout: "fixed",
} as const;

export const graphicRectangleDefaults = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  color: "#ffffff",
  opacity: 1,
  cornerRadius: 0,
} as const;

export const graphicCircleDefaults = {
  x: 0,
  y: 0,
  radius: 50,
  color: "#ffffff",
  opacity: 1,
} as const;

export const graphicHighlightDefaults = {
  padding: 12,
  color: "#facc15",
  opacity: 0.45,
} as const;

const positionFields = [
  { key: "x", label: "x", type: "number", defaultValue: 0 },
  { key: "y", label: "y", type: "number", defaultValue: 0 },
] satisfies readonly GraphicControlField[];

const sizeFields = [
  { key: "width", label: "width", type: "number", defaultValue: 100, min: 0 },
  {
    key: "height",
    label: "height",
    type: "number",
    defaultValue: 100,
    min: 0,
  },
] satisfies readonly GraphicControlField[];

const appearanceFields = [
  {
    key: "color",
    label: "color",
    type: "color",
    defaultValue: graphicRectangleDefaults.color,
  },
  {
    key: "opacity",
    label: "opacity",
    type: "number",
    defaultValue: graphicRectangleDefaults.opacity,
    min: 0,
    max: 1,
    step: 0.01,
  },
] satisfies readonly GraphicControlField[];

export const graphicRectangleControlGroups = [
  {
    id: "geometry-frame",
    label: "Frame",
    columns: 2,
    fields: [...positionFields, ...sizeFields],
  },
  {
    id: "geometry-appearance",
    label: "Appearance",
    fields: [
      ...appearanceFields,
      {
        key: "cornerRadius",
        label: "cornerRadius",
        type: "number",
        defaultValue: graphicRectangleDefaults.cornerRadius,
        min: 0,
      },
    ],
  },
] satisfies readonly GraphicControlGroup[];

export const graphicCircleControlGroups = [
  {
    id: "geometry-frame",
    label: "Frame",
    columns: 2,
    fields: [
      ...positionFields,
      {
        key: "radius",
        label: "radius",
        type: "number",
        defaultValue: graphicCircleDefaults.radius,
        min: 0,
      },
    ],
  },
  {
    id: "geometry-appearance",
    label: "Appearance",
    fields: appearanceFields,
  },
] satisfies readonly GraphicControlGroup[];

export const graphicTextControlGroups = [
  {
    id: "text-content",
    label: "Text",
    fields: [
      {
        key: "content",
        label: "content",
        type: "text",
        defaultValue: graphicTextDefaults.content,
      },
    ],
  },
  {
    id: "text-frame",
    label: "Frame",
    columns: 2,
    fields: [
      {
        key: "x",
        label: "x",
        type: "number",
        defaultValue: graphicTextDefaults.x,
      },
      {
        key: "y",
        label: "y",
        type: "number",
        defaultValue: graphicTextDefaults.y,
      },
      {
        key: "width",
        label: "width",
        type: "number",
        defaultValue: graphicTextDefaults.width,
        min: 1,
      },
      {
        key: "height",
        label: "height",
        type: "number",
        defaultValue: graphicTextDefaults.height,
        min: 1,
      },
    ],
  },
  {
    id: "text-style",
    label: "Style",
    fields: [
      {
        key: "color",
        label: "color",
        type: "color",
        defaultValue: graphicTextDefaults.color,
      },
      {
        key: "fontSize",
        label: "fontSize",
        type: "number",
        defaultValue: graphicTextDefaults.fontSize,
        min: 1,
      },
      {
        key: "fontFamily",
        label: "fontFamily",
        type: "text",
        defaultValue: graphicTextDefaults.fontFamily,
      },
      {
        key: "fontWeight",
        label: "fontWeight",
        type: "number",
        defaultValue: graphicTextDefaults.fontWeight,
        min: 100,
        max: 1000,
        step: 10,
      },
      {
        key: "lineHeight",
        label: "lineHeight",
        type: "number",
        defaultValue: graphicTextDefaults.lineHeight,
        min: 0.1,
        step: 0.05,
      },
      {
        key: "letterSpacing",
        label: "letterSpacing",
        type: "number",
        defaultValue: graphicTextDefaults.letterSpacing,
        step: 0.1,
      },
    ],
  },
] satisfies readonly GraphicControlGroup[];

export const graphicHighlightControlGroups = [
  {
    id: "highlight",
    label: "Highlight",
    fields: [
      {
        key: "padding",
        label: "padding",
        type: "number",
        defaultValue: graphicHighlightDefaults.padding,
        min: 0,
      },
      {
        key: "color",
        label: "color",
        type: "color",
        defaultValue: graphicHighlightDefaults.color,
      },
      {
        key: "opacity",
        label: "opacity",
        type: "number",
        defaultValue: graphicHighlightDefaults.opacity,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },
] satisfies readonly GraphicControlGroup[];

export function graphicControlDefaults(groups: readonly GraphicControlGroup[]) {
  return Object.fromEntries(
    groups.flatMap((group) =>
      group.fields.map((field) => [field.key, field.defaultValue]),
    ),
  );
}
