import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const forcePeerMajors = process.argv.includes("--force-peer-majors");
const dependencyNames = [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
];

if (dependencyNames.length === 0) {
  console.log("No direct dependencies found.");
  process.exit(0);
}

const currentReactMajor = packageJson.dependencies?.react?.split(".")[0];
const reactTarget =
  forcePeerMajors || !currentReactMajor ? "latest" : currentReactMajor;
const packages = dependencyNames.map((name) => {
  if (name === "react" || name === "react-dom") {
    return `${name}@${reactTarget}`;
  }

  return `${name}@latest`;
});
const result = spawnSync("npm", ["install", "--save-exact", ...packages], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
