import type { CSSProperties, ReactElement } from "react";
import type { RichTextSegment } from "../core/types";

export function getRenderableTextSegments(
  content: string,
  richText: RichTextSegment[] | undefined,
) {
  if (richText && richText.map((segment) => segment.text).join("") === content)
    return richText;
  return [{ text: content, bold: false, italic: false, underline: false }];
}

export function renderRichTextSegments(
  segments: RichTextSegment[],
  explicitFormatting: boolean,
) {
  const nodes: ReactElement[] = [];
  segments.forEach((segment, segmentIndex) => {
    const parts = segment.text.split("\n");
    parts.forEach((part, partIndex) => {
      if (part)
        nodes.push(
          <span
            key={`${segmentIndex}-${partIndex}-${part}`}
            style={inlineTextSegmentStyle(segment, explicitFormatting)}
          >
            {part}
          </span>,
        );
      if (partIndex < parts.length - 1)
        nodes.push(<br key={`${segmentIndex}-${partIndex}-br`} />);
    });
  });
  return nodes;
}

export function textSegmentsToEditableNodes(
  segments: RichTextSegment[],
  explicitFormatting: boolean,
) {
  const nodes: Node[] = [];
  segments.forEach((segment) => {
    const parts = segment.text.split("\n");
    parts.forEach((part, partIndex) => {
      if (part) {
        const span = document.createElement("span");
        const style = inlineTextSegmentStyle(segment, explicitFormatting);
        if (style.fontWeight) span.style.fontWeight = String(style.fontWeight);
        if (style.fontStyle) span.style.fontStyle = String(style.fontStyle);
        if (style.textDecorationLine)
          span.style.textDecorationLine = String(style.textDecorationLine);
        span.textContent = part;
        nodes.push(span);
      }
      if (partIndex < parts.length - 1)
        nodes.push(document.createElement("br"));
    });
  });
  return nodes.length > 0 ? nodes : [document.createTextNode("")];
}

export function normalizeEditableFormatting(element: HTMLElement) {
  element.querySelectorAll("span, b, strong, i, em, u").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const style = window.getComputedStyle(node);
    node.dataset.clipperBold =
      Number(style.fontWeight) >= 700 ? "true" : "false";
    node.dataset.clipperItalic =
      style.fontStyle === "italic" ? "true" : "false";
    node.dataset.clipperUnderline = style.textDecorationLine.includes(
      "underline",
    )
      ? "true"
      : "false";
  });
}

export function getSelectionFormatState(
  selection: Selection,
  format: "bold" | "italic" | "underline",
) {
  const node = selection.anchorNode;
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (format === "bold") return Number(style.fontWeight) >= 700;
  if (format === "italic") return style.fontStyle === "italic";
  return style.textDecorationLine.includes("underline");
}

export function richTextSegmentsFromElement(
  element: HTMLElement,
  baseStyle: Record<string, string | number>,
) {
  const segments: RichTextSegment[] = [];
  const baseFormat = getBaseRichTextFormat(baseStyle);

  function visit(node: Node, format: Omit<RichTextSegment, "text">) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent)
        segments.push({ text: node.textContent, ...format });
      return;
    }
    if (node.nodeName === "BR") {
      segments.push({ text: "\n", ...format });
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    if (
      (node.nodeName === "DIV" || node.nodeName === "P") &&
      segments.length > 0
    )
      segments.push({ text: "\n", ...format });

    const explicitBold = node.dataset.clipperBold;
    const explicitItalic = node.dataset.clipperItalic;
    const explicitUnderline = node.dataset.clipperUnderline;
    const nextFormat = {
      bold: explicitBold
        ? explicitBold === "true"
        : node.nodeName === "B" || node.nodeName === "STRONG"
          ? true
          : format.bold,
      italic: explicitItalic
        ? explicitItalic === "true"
        : node.nodeName === "I" || node.nodeName === "EM"
          ? true
          : format.italic,
      underline: explicitUnderline
        ? explicitUnderline === "true"
        : node.nodeName === "U"
          ? true
          : format.underline,
    };
    node.childNodes.forEach((child) => visit(child, nextFormat));
  }

  element.childNodes.forEach((node) => visit(node, baseFormat));
  return mergeAdjacentRichTextSegments(segments);
}

function getBaseRichTextFormat(baseStyle: Record<string, string | number>) {
  return {
    bold: Number(baseStyle.fontWeight ?? 400) >= 700,
    italic: String(baseStyle.fontStyle ?? "normal") === "italic",
    underline: String(baseStyle.textDecoration ?? "none")
      .split(" ")
      .includes("underline"),
  };
}

function mergeAdjacentRichTextSegments(segments: RichTextSegment[]) {
  return segments.reduce<RichTextSegment[]>((merged, segment) => {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.bold === segment.bold &&
      previous.italic === segment.italic &&
      previous.underline === segment.underline
    ) {
      previous.text += segment.text;
      return merged;
    }
    merged.push({ ...segment });
    return merged;
  }, []);
}

export function shouldPersistRichText(
  segments: RichTextSegment[],
  baseStyle: Record<string, string | number>,
) {
  const baseFormat = getBaseRichTextFormat(baseStyle);
  return segments.some(
    (segment) =>
      segment.bold !== baseFormat.bold ||
      segment.italic !== baseFormat.italic ||
      segment.underline !== baseFormat.underline,
  );
}

function inlineTextSegmentStyle(
  segment: RichTextSegment,
  explicitFormatting: boolean,
): CSSProperties {
  return {
    fontWeight: segment.bold ? 700 : explicitFormatting ? 400 : undefined,
    fontStyle: segment.italic
      ? "italic"
      : explicitFormatting
        ? "normal"
        : undefined,
    textDecorationLine: segment.underline
      ? "underline"
      : explicitFormatting
        ? "none"
        : undefined,
  };
}
