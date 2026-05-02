let transparentNativeDragImage: HTMLElement | null = null;

export function getTransparentNativeDragImage() {
  if (transparentNativeDragImage?.isConnected) return transparentNativeDragImage;
  const element = document.createElement("span");
  element.style.cssText = "position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(element);
  transparentNativeDragImage = element;
  return element;
}
