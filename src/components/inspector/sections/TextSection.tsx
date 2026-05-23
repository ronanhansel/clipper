import { useCallback } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react";
import { mutedCaps } from "../../../app/config";
import { graphicTextDefaults } from "../../../core/graphics/inspectorSettings";
import { Textarea } from "../../ui/textarea";
import { useObjectInspector } from "../objectInspectorContext";
import { FontSelector, type FontOption } from "./FontSelector";
import {
  TextAnimatorsSection,
  TextBoxLayoutIcon,
  VerticalAlignIcon,
} from "./TextAnimatorsSection";
import { FillSection } from "./FillSection";
import { StyleColorSection } from "./StyleColorSection";

/**
 * Text-only inspector content: content textarea, colour, fill, font selector,
 * size/weight/line-height/letter-spacing, formatting/alignment buttons, vertical
 * alignment, text-box layout, and the animator section.
 */
export function TextSection() {
  const {
    object,
    updateTextContent,
    updateStyleValue,
    updateStyleNumber,
    previewStyleNumber,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    toggleStrikethrough,
    hasTextDecoration,
    textButtonClass,
    onChange,
    keyframeValue,
    keyframeAtCurrentTime,
    toggleKeyframe,
    commitKeyframedValue,
    renderKeyframedInput,
  } = useObjectInspector();

  const fontFamily = String(
    keyframeValue(
      "fontFamily",
      String(object.style.fontFamily ?? graphicTextDefaults.fontFamily),
    ),
  );
  const fontSource =
    typeof object.style.fontSource === "string" ? object.style.fontSource : "";
  const fontSize = Number(
    keyframeValue(
      "fontSize",
      Number(object.style.fontSize ?? graphicTextDefaults.fontSize),
    ),
  );
  const fontWeight = Number(
    keyframeValue(
      "fontWeight",
      Number(object.style.fontWeight ?? graphicTextDefaults.fontWeight),
    ),
  );
  const fontStyle = String(
    object.style.fontStyle ?? graphicTextDefaults.fontStyle,
  );
  const lineHeight = Number(
    keyframeValue(
      "lineHeight",
      Number(object.style.lineHeight ?? graphicTextDefaults.lineHeight),
    ),
  );
  const letterSpacing = Number(
    keyframeValue(
      "letterSpacing",
      Number(object.style.letterSpacing ?? graphicTextDefaults.letterSpacing),
    ),
  );
  const textAlign = String(
    object.style.textAlign ?? graphicTextDefaults.textAlign,
  );
  const verticalAlign = String(
    object.style.verticalAlign ?? graphicTextDefaults.verticalAlign,
  );
  const textBoxLayout = String(
    object.style.textBoxLayout ?? graphicTextDefaults.textBoxLayout,
  );

  const fontFamilyHasKeyframe = Boolean(keyframeAtCurrentTime("fontFamily"));

  function commitFontFamily(value: string, option?: FontOption) {
    onChange((current) => ({
      ...current,
      style: {
        ...current.style,
        fontSource: option?.source ?? "",
      },
    }));
    commitKeyframedValue(
      "fontFamily",
      value,
      (next) => updateStyleValue("fontFamily", next),
      "text",
    );
  }

  const resolveFontSource = useCallback(
    (option: FontOption) => {
      onChange((current) => {
        if (current.style.fontSource === option.source) return current;
        return {
          ...current,
          style: {
            ...current.style,
            fontSource: option.source ?? "",
          },
        };
      });
    },
    [onChange],
  );

  return (
    <>
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Content
        <Textarea
          className="min-h-[104px] resize-y"
          value={object.content ?? ""}
          onChange={(event) => updateTextContent(event.target.value)}
        />
      </label>
      <StyleColorSection />
      <FillSection />
      <FontSelector
        value={fontFamily}
        fontSource={fontSource}
        hasKeyframe={fontFamilyHasKeyframe}
        onToggleKeyframe={() => toggleKeyframe("fontFamily", fontFamily)}
        onChange={commitFontFamily}
        onResolveFontSource={resolveFontSource}
      />
      <div className="grid grid-cols-2 gap-2">
        {renderKeyframedInput({
          label: "Size",
          animationKey: "fontSize",
          value: fontSize,
          type: "number",
          min: 1,
          onCommit: (value) => updateStyleNumber("fontSize", value),
          onPreviewNumber: (value) => previewStyleNumber("fontSize", value),
        })}
        {renderKeyframedInput({
          label: "Weight",
          animationKey: "fontWeight",
          value: fontWeight,
          type: "number",
          min: 100,
          max: 1000,
          step: 10,
          onCommit: (value) => updateStyleNumber("fontWeight", value),
          onPreviewNumber: (value) => previewStyleNumber("fontWeight", value),
        })}
        {renderKeyframedInput({
          label: "Line Height",
          animationKey: "lineHeight",
          value: lineHeight,
          type: "number",
          min: 0.1,
          step: 0.05,
          onCommit: (value) => updateStyleNumber("lineHeight", value),
          onPreviewNumber: (value) => previewStyleNumber("lineHeight", value),
        })}
        {renderKeyframedInput({
          label: "Char Spacing",
          animationKey: "letterSpacing",
          value: letterSpacing,
          type: "number",
          step: 0.1,
          onCommit: (value) => updateStyleNumber("letterSpacing", value),
          onPreviewNumber: (value) =>
            previewStyleNumber("letterSpacing", value),
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <span className={mutedCaps}>Formatting</span>
        <span className={mutedCaps}>Alignment</span>
        <div className="grid grid-cols-4 gap-1.5" aria-label="Text style">
          <button
            className={textButtonClass(fontWeight >= 700)}
            aria-label="Bold"
            aria-pressed={fontWeight >= 700}
            title="Bold"
            onClick={toggleBold}
          >
            <Bold size={16} />
          </button>
          <button
            className={textButtonClass(fontStyle === "italic")}
            aria-label="Italic"
            aria-pressed={fontStyle === "italic"}
            title="Italic"
            onClick={toggleItalic}
          >
            <Italic size={16} />
          </button>
          <button
            className={textButtonClass(hasTextDecoration("underline"))}
            aria-label="Underline"
            aria-pressed={hasTextDecoration("underline")}
            title="Underline"
            onClick={toggleUnderline}
          >
            <Underline size={16} />
          </button>
          <button
            className={textButtonClass(hasTextDecoration("line-through"))}
            aria-label="Strikethrough"
            aria-pressed={hasTextDecoration("line-through")}
            title="Strikethrough"
            onClick={toggleStrikethrough}
          >
            <Strikethrough size={16} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5" aria-label="Text alignment">
          <button
            className={textButtonClass(textAlign === "left")}
            aria-label="Align left"
            aria-pressed={textAlign === "left"}
            title="Align left"
            onClick={() => updateStyleValue("textAlign", "left")}
          >
            <AlignLeft size={16} />
          </button>
          <button
            className={textButtonClass(textAlign === "center")}
            aria-label="Align center"
            aria-pressed={textAlign === "center"}
            title="Align center"
            onClick={() => updateStyleValue("textAlign", "center")}
          >
            <AlignCenter size={16} />
          </button>
          <button
            className={textButtonClass(textAlign === "right")}
            aria-label="Align right"
            aria-pressed={textAlign === "right"}
            title="Align right"
            onClick={() => updateStyleValue("textAlign", "right")}
          >
            <AlignRight size={16} />
          </button>
          <button
            className={textButtonClass(textAlign === "justify")}
            aria-label="Justify"
            aria-pressed={textAlign === "justify"}
            title="Justify"
            onClick={() => updateStyleValue("textAlign", "justify")}
          >
            <AlignJustify size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <span className={mutedCaps}>Vertical Alignment</span>
        <span className={mutedCaps}>Layout</span>
        <div
          className="grid grid-cols-3 gap-1.5"
          aria-label="Text vertical alignment"
        >
          <button
            className={textButtonClass(verticalAlign === "top")}
            aria-label="Align top"
            aria-pressed={verticalAlign === "top"}
            title="Align top"
            onClick={() => updateStyleValue("verticalAlign", "top")}
          >
            <VerticalAlignIcon align="top" />
          </button>
          <button
            className={textButtonClass(verticalAlign === "middle")}
            aria-label="Align middle"
            aria-pressed={verticalAlign === "middle"}
            title="Align middle"
            onClick={() => updateStyleValue("verticalAlign", "middle")}
          >
            <VerticalAlignIcon align="middle" />
          </button>
          <button
            className={textButtonClass(verticalAlign === "bottom")}
            aria-label="Align bottom"
            aria-pressed={verticalAlign === "bottom"}
            title="Align bottom"
            onClick={() => updateStyleValue("verticalAlign", "bottom")}
          >
            <VerticalAlignIcon align="bottom" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5" aria-label="Text box layout">
          <button
            className={textButtonClass(textBoxLayout === "overflow")}
            aria-label="Fixed width, overflow"
            aria-pressed={textBoxLayout === "overflow"}
            title="Fixed width, overflow"
            onClick={() => updateStyleValue("textBoxLayout", "overflow")}
          >
            <TextBoxLayoutIcon mode="overflow" />
          </button>
          <button
            className={textButtonClass(textBoxLayout === "auto-height")}
            aria-label="Fixed width, auto height"
            aria-pressed={textBoxLayout === "auto-height"}
            title="Fixed width, auto height"
            onClick={() => updateStyleValue("textBoxLayout", "auto-height")}
          >
            <TextBoxLayoutIcon mode="auto-height" />
          </button>
          <button
            className={textButtonClass(textBoxLayout === "fixed")}
            aria-label="Fixed width and height"
            aria-pressed={textBoxLayout === "fixed"}
            title="Fixed width and height"
            onClick={() => updateStyleValue("textBoxLayout", "fixed")}
          >
            <TextBoxLayoutIcon mode="fixed" />
          </button>
        </div>
      </div>
      <TextAnimatorsSection object={object} onChange={onChange} />
    </>
  );
}
