import {
  Component,
  Composition,
  Rect,
  Text,
  WebLayer,
  html,
} from "@clipper/composition-api";
import styles from "./style.css";

const PAPER = "#f7f4ea";

class SignalAtlas extends Component {
  render() {
    return [
      new Rect({
        id: "signal-atlas-field",
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        style: {
          background:
            "radial-gradient(circle at 18% 18%, rgba(37, 99, 166, 0.16), transparent 28%), radial-gradient(circle at 84% 78%, rgba(204, 132, 33, 0.16), transparent 30%), linear-gradient(90deg, rgba(18,16,12,0.035) 1px, transparent 1px), linear-gradient(rgba(18,16,12,0.03) 1px, transparent 1px), #f7f4ea",
          backgroundSize: "auto, auto, 108px 108px, 108px 108px",
        },
      }),
      new WebLayer({
        id: "signal-atlas-stage",
        bounds: { x: 214, y: 186, width: 1492, height: 492 },
        css: styles,
        html: html`<div class="signal-atlas-stage">
          <div class="signal-map"><i></i><i></i><i></i><i></i></div>
          <div class="signal-panel">
            <small>Live index</small><strong>74.2</strong
            ><span>+12.8% confidence lift</span>
          </div>
          <div class="signal-note">
            Three signals converge into one narrated decision frame.
          </div>
        </div>`,
        animations: [
          {
            id: "signal-atlas-stage-in",
            keyframes: { y: [28, 0], opacity: [0, 1] },
            options: { duration: 1.25, ease: "circOut" },
          },
        ],
      }),
      new Rect({
        id: "signal-atlas-rule",
        bounds: { x: 146, y: 728, width: 1628, height: 1 },
        style: {
          background:
            "linear-gradient(90deg, transparent, rgba(18,16,12,0.38), transparent)",
        },
        animations: [
          {
            id: "signal-atlas-rule-draw",
            keyframes: { scaleX: [0, 1], opacity: [0, 1] },
            options: { delay: 0.4, duration: 1.0, ease: "easeOut" },
          },
        ],
      }),
      new Text({
        id: "signal-atlas-kicker",
        bounds: { x: 148, y: 132, width: 760, height: 34 },
        text: "EXPLAINER TEMPLATE / DATA STORY",
        style: {
          color: "rgba(18,16,12,0.5)",
          fontFamily: "Avenir Next, Manrope, sans-serif",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: "0.28em",
        },
        animations: [
          {
            id: "signal-atlas-kicker-in",
            keyframes: { opacity: [0, 1] },
            options: { duration: 0.8, ease: "easeOut" },
          },
        ],
      }),
      new Text({
        id: "signal-atlas-title",
        bounds: { x: 220, y: 790, width: 1480, height: 112 },
        text: "SIGNAL ATLAS",
        style: {
          color: "#15120d",
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: 90,
          fontWeight: 300,
          letterSpacing: "0.11em",
          textAlign: "center",
        },
        animations: [
          {
            id: "signal-atlas-title-rise",
            keyframes: { y: [34, 0], opacity: [0, 1] },
            options: { delay: 0.66, duration: 1.1, ease: "circOut" },
          },
        ],
      }),
      new Text({
        id: "signal-atlas-subtitle",
        bounds: { x: 442, y: 898, width: 1036, height: 48 },
        text: "Narration-ready panels, map traces, and callouts for structured explanations.",
        style: {
          color: "rgba(18,16,12,0.58)",
          fontFamily: "Manrope, Avenir Next, sans-serif",
          fontSize: 23,
          textAlign: "center",
        },
        animations: [
          {
            id: "signal-atlas-subtitle-rise",
            keyframes: { y: [22, 0], opacity: [0, 1] },
            options: { delay: 0.86, duration: 1.0, ease: "easeOut" },
          },
        ],
      }),
    ];
  }
}

export const composition = new Composition({
  duration: 9,
  frame: { width: 1920, height: 1080, style: { background: PAPER } },
  background: {
    id: "background",
    name: "Signal Atlas",
    style: { background: PAPER },
    elements: [],
  },
  render() {
    return [new SignalAtlas()];
  },
});
