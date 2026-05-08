import {
  Component,
  Composition,
  Rect,
  Text,
  WebLayer,
  html,
} from "@clipper/composition-api";
import styles from "./style.css";

const PAPER = "#fbfaf6";
const INK = "#17120c";

class PaperOrbit extends Component {
  render() {
    return [
      new Rect({
        id: "paper-orbit-field",
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        style: {
          background:
            "radial-gradient(circle at 28% 22%, rgba(125,87,36,0.12), transparent 28%), radial-gradient(circle at 80% 74%, rgba(38,76,112,0.11), transparent 30%), linear-gradient(90deg, rgba(23,18,12,0.035) 1px, transparent 1px), linear-gradient(rgba(23,18,12,0.03) 1px, transparent 1px), #fbfaf6",
          backgroundSize: "auto, auto, 118px 118px, 118px 118px",
        },
      }),
      new WebLayer({
        id: "paper-orbit-stage",
        bounds: { x: 258, y: 148, width: 1404, height: 652 },
        css: styles,
        html: html`<div class="paper-orbit-stage">
          <div class="paper-orbit-rail"></div>
          <div class="paper-orbit-halo"></div>
          <div class="paper-orbit-card paper-orbit-card-a">
            method<br /><b>03</b>
          </div>
          <div class="paper-orbit-card paper-orbit-card-b">
            signal<br /><b>18%</b>
          </div>
          <div class="paper-orbit-core"><span>clipper</span></div>
        </div>`,
        animations: [
          {
            id: "paper-orbit-stage-enter",
            keyframes: { y: [34, 0], opacity: [0, 1] },
            options: { duration: 1.4, ease: "circOut" },
          },
        ],
      }),
      new Rect({
        id: "paper-orbit-rule",
        bounds: { x: 148, y: 706, width: 1624, height: 1 },
        style: {
          background:
            "linear-gradient(90deg, transparent, rgba(23,18,12,0.42), transparent)",
        },
        animations: [
          {
            id: "paper-orbit-rule-draw",
            keyframes: { scaleX: [0, 1], opacity: [0, 1] },
            options: { delay: 0.35, duration: 1.1, ease: "easeOut" },
          },
        ],
      }),
      new Text({
        id: "paper-orbit-kicker",
        bounds: { x: 148, y: 130, width: 720, height: 34 },
        text: "RESEARCH TEMPLATE / SYSTEM MAP",
        style: {
          color: "rgba(23,18,12,0.54)",
          fontFamily: "Avenir Next, Manrope, sans-serif",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: "0.28em",
        },
        animations: [
          {
            id: "paper-orbit-kicker-in",
            keyframes: { opacity: [0, 1] },
            options: { duration: 0.8, ease: "easeOut" },
          },
        ],
      }),
      new Text({
        id: "paper-orbit-title",
        bounds: { x: 230, y: 780, width: 1460, height: 112 },
        text: "PAPER ORBIT",
        style: {
          color: INK,
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: 94,
          fontWeight: 300,
          letterSpacing: "0.115em",
          textAlign: "center",
        },
        animations: [
          {
            id: "paper-orbit-title-rise",
            keyframes: { y: [36, 0], opacity: [0, 1] },
            options: { delay: 0.48, duration: 1.2, ease: "circOut" },
          },
        ],
      }),
      new Text({
        id: "paper-orbit-subtitle",
        bounds: { x: 470, y: 892, width: 980, height: 46 },
        text: "A cinematic editorial frame for ideas, evidence, and calm orbital motion.",
        style: {
          color: "rgba(23,18,12,0.58)",
          fontFamily: "Manrope, Avenir Next, sans-serif",
          fontSize: 23,
          textAlign: "center",
        },
        animations: [
          {
            id: "paper-orbit-subtitle-rise",
            keyframes: { y: [24, 0], opacity: [0, 1] },
            options: { delay: 0.72, duration: 1.0, ease: "easeOut" },
          },
        ],
      }),
    ];
  }
}

export const composition = new Composition({
  duration: 8,
  frame: { width: 1920, height: 1080, style: { background: PAPER } },
  background: {
    id: "background",
    name: "Paper Orbit",
    style: { background: PAPER },
    elements: [],
  },
  render() {
    return [new PaperOrbit()];
  },
});
