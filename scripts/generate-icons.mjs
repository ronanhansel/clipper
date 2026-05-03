import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const iconsDir = path.join(root, "build", "icons");
const electronResourcesDir = path.join(root, "build", "electron");
const publicDir = path.join(root, "public");
const flattenedSourcePng = path.join(iconsDir, "icon-iOS-Default-1024x1024@1x.png");
const iconsetDir = path.join(iconsDir, "icon.iconset");
const iconsetSizes = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

async function renderPng(size, outputPath) {
  await sharp(flattenedSourcePng).resize(size, size).png().toFile(outputPath);
}

async function main() {
  if (!existsSync(flattenedSourcePng)) {
    throw new Error(`Missing flattened icon source: ${flattenedSourcePng}. Export the flattened PNG from Apple Icon Composer to build/icons/icon-iOS-Default-1024x1024@1x.png.`);
  }
  await fs.mkdir(iconsDir, { recursive: true });
  await fs.mkdir(electronResourcesDir, { recursive: true });
  await fs.mkdir(publicDir, { recursive: true });
  await fs.rm(iconsetDir, { recursive: true, force: true });
  await fs.mkdir(iconsetDir, { recursive: true });

  await renderPng(1024, path.join(iconsDir, "icon.png"));
  await fs.copyFile(path.join(iconsDir, "icon.png"), path.join(publicDir, "icon.png"));

  await Promise.all(iconsetSizes.map(([size, name]) => renderPng(size, path.join(iconsetDir, name))));
  await execFileAsync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(iconsDir, "icon.icns")]);

  const icoPngs = await Promise.all([16, 32, 48, 64, 128, 256].map(async (size) => {
    const outputPath = path.join(iconsetDir, `icon_${size}x${size}.ico.png`);
    await renderPng(size, outputPath);
    return outputPath;
  }));
  await fs.writeFile(path.join(iconsDir, "icon.ico"), await pngToIco(icoPngs));
  await fs.copyFile(path.join(iconsDir, "icon.png"), path.join(electronResourcesDir, "icon.png"));
  await fs.copyFile(path.join(iconsDir, "icon.icns"), path.join(electronResourcesDir, "icon.icns"));
  await fs.copyFile(path.join(iconsDir, "icon.ico"), path.join(electronResourcesDir, "icon.ico"));
  await fs.rm(iconsetDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
