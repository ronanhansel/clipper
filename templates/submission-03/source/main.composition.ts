import { Component, Composition, WebLayer } from "@clipper/composition-api";
import paperStyles from "./style.css";
import paperHtml from "./index.html";

const PAPER = "#f4efe4";

class FullHeightPaperStage extends Component {
  render() {
    return [
      new WebLayer({
        id: "full-height-paper-study-renderer",
        name: "Full Height Paper Study Renderer",
        bounds: { x: 605, y: 38, width: 710, height: 1004 },
        css: paperStyles,
        html: paperHtml,
        style: { transform: "translateZ(0)" },
        animations: [{ id: "full-height-paper-study-renderer-motion", name: "Motion", keyframes: { y: [100, 0], opacity: [0, 1] }, options: { duration: 1.2, ease: "easeOut" } }]
      }),
    ];
  }
}

export const composition = new Composition({
  duration: 9,
  frame: { width: 1920, height: 1080, style: { background: PAPER } },
  background: { id: "background", name: "Neutral Paper Table", style: { background: PAPER }, elements: [] },
  render() {
    return [new FullHeightPaperStage()];
  },
});
