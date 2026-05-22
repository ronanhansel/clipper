const CLIPPER_MEDIA_SCHEME = "clipper-media://file/";

export function filePathToClipperMediaUrl(filePath: string): string {
  if (filePath.startsWith(CLIPPER_MEDIA_SCHEME)) return filePath;
  if (/^[a-z]+:/i.test(filePath) && !filePath.startsWith("file://"))
    return filePath;
  const localPath = filePath.startsWith("file://")
    ? fileUrlToPath(filePath)
    : filePath;
  return `${CLIPPER_MEDIA_SCHEME}${encodeURIComponent(localPath)}`;
}

export function normalizeClipperMediaUrl(src: string): string {
  return src.startsWith("file://") ? filePathToClipperMediaUrl(src) : src;
}

function fileUrlToPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return url.replace(/^file:\/\//i, "");
  }
}
