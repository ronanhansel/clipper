import type { TransitionEffectPackage } from "../../../types";
import type { TransitionVisualStyle } from "../../../types";

export const swipeTransitionLogic: Pick<TransitionEffectPackage, "applyVisualStyle"> = {
  applyVisualStyle: ({ progress }: { sceneTime: number; layer: any; frameRate: number; progress: number }): TransitionVisualStyle => {
    const t = Math.max(0, Math.min(1, progress));
    const offset = (1 - t) * 100;

    return {
      overlays: [
        {
          id: "swipe-push",
          target: "camera",
          style: {
            transform: `translateX(${-offset}%)`,
            transition: "none",
          },
        },
        {
          id: "swipe-incoming",
          target: "frame",
          style: {
            transform: `translateX(${100 - offset}%)`,
            transition: "none",
            position: "absolute",
            inset: "0",
          },
        },
      ],
    };
  },
};
