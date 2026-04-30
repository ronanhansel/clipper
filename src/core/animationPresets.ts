import type { LayerAnimation } from "./types";

export type AnimationPreset = Omit<LayerAnimation, "id">;

export const animationPresets: AnimationPreset[] = [
  {
    name: "Fade In",
    keyframes: { opacity: [0, 1] },
    options: { duration: 0.6, ease: "easeOut" },
  },
  {
    name: "Fade Out",
    keyframes: { opacity: [1, 0] },
    options: { duration: 0.6, ease: "easeIn" },
  },
  {
    name: "Slide Up",
    keyframes: { opacity: [0, 1], y: [60, 0] },
    options: { duration: 0.7, ease: "easeOut" },
  },
  {
    name: "Slide Down",
    keyframes: { opacity: [0, 1], y: [-60, 0] },
    options: { duration: 0.7, ease: "easeOut" },
  },
  {
    name: "Slide Left",
    keyframes: { opacity: [0, 1], x: [60, 0] },
    options: { duration: 0.7, ease: "easeOut" },
  },
  {
    name: "Slide Right",
    keyframes: { opacity: [0, 1], x: [-60, 0] },
    options: { duration: 0.7, ease: "easeOut" },
  },
  {
    name: "Scale Pop",
    keyframes: { opacity: [0, 1], scale: [0.8, 1] },
    options: { duration: 0.5, ease: "easeOut" },
  },
  {
    name: "Scale In",
    keyframes: { opacity: [0, 1], scale: [0, 1] },
    options: { duration: 0.7, ease: "easeOut" },
  },
  {
    name: "Rotate In",
    keyframes: { opacity: [0, 1], rotate: [-12, 0] },
    options: { duration: 0.6, ease: "easeOut" },
  },
  {
    name: "Drift",
    keyframes: { x: [-20, 20], y: [-10, 10] },
    options: { duration: 3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" },
  },
  {
    name: "Pulse",
    keyframes: { scale: [1, 1.05, 1] },
    options: { duration: 1.5, ease: "easeInOut", repeat: Infinity },
  },
  {
    name: "Bounce",
    keyframes: { y: [0, -30, 0] },
    options: { duration: 0.8, ease: "easeOut" },
  },
];

export function createAnimationFromPreset(presetIndex: number, id: string): LayerAnimation {
  const preset = animationPresets[presetIndex];
  if (!preset) throw new Error(`Animation preset index ${presetIndex} not found.`);
  return {
    id,
    ...preset,
  };
}
