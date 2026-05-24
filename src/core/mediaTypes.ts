const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
const videoExtensions = [".mp4"];

export type MediaAssetType = "image" | "video";

export function getMediaAssetType(fileName: string): MediaAssetType | null {
  const lowerName = fileName.toLowerCase();
  if (imageExtensions.some((ext) => lowerName.endsWith(ext))) return "image";
  if (videoExtensions.some((ext) => lowerName.endsWith(ext))) return "video";
  return null;
}

export function isSupportedImageMedia(fileName: string): boolean {
  return getMediaAssetType(fileName) === "image";
}

export function isSupportedVideoMedia(fileName: string): boolean {
  return getMediaAssetType(fileName) === "video";
}
