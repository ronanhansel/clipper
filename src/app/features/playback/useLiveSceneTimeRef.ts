import { useEffect, useRef } from "react";
import {
  getMasterTimelineClockSnapshot,
  subscribeMasterTimelineClock,
} from "./playbackTimeStore";

export function useLiveSceneTimeRef(currentSceneTime: number) {
  const currentSceneTimeRef = useRef(currentSceneTime);

  useEffect(() => {
    currentSceneTimeRef.current = currentSceneTime;
  }, [currentSceneTime]);

  useEffect(() => {
    return subscribeMasterTimelineClock(() => {
      const snap = getMasterTimelineClockSnapshot();
      if (snap.source !== "playback" && snap.source !== "scrub") return;
      currentSceneTimeRef.current = snap.sceneTime;
    });
  }, []);

  return currentSceneTimeRef;
}
