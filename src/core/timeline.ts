import { MAX_PART_DURATION_SECONDS, MAX_SCENE_DURATION_SECONDS, type Part, type Scene, type TimelinePart } from "./types";

export function buildLinearTimeline(scene: Scene): TimelinePart[] {
  let cursor = 0;
  return scene.parts.map((part) => {
    const start = cursor;
    const end = start + part.duration;
    cursor = end;
    return { ...part, start, end };
  });
}

export function sceneDuration(scene: Scene) {
  return scene.parts.reduce((total, part) => total + part.duration, 0);
}

export function validateScene(scene: Scene): string[] {
  const errors: string[] = [];
  const duration = sceneDuration(scene);

  if (duration > MAX_SCENE_DURATION_SECONDS) {
    errors.push(`Scene ${scene.name} is ${duration}s and exceeds the 30 minute limit.`);
  }

  scene.parts.forEach((part) => {
    if (part.duration <= 0) {
      errors.push(`Part ${part.name} must have a positive duration.`);
    }

    if (part.duration > MAX_PART_DURATION_SECONDS) {
      errors.push(`Part ${part.name} is ${part.duration}s and exceeds the 10 second limit.`);
    }
  });

  return errors;
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

export function updatePartObject(parts: Part[], partId: string, objectId: string, updater: (part: Part["objects"][number]) => Part["objects"][number]) {
  return parts.map((part) => {
    if (part.id !== partId) return part;
    return {
      ...part,
      objects: part.objects.map((object) => (object.id === objectId ? updater(object) : object)),
    };
  });
}
