import { cp, mkdir } from "node:fs/promises";
const destination = new URL("../dist/migrations/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL("../migrations/", import.meta.url), destination, {
  recursive: true,
});
const deploymentAssets = new URL("../dist/src/modules/deployments/", import.meta.url);
await mkdir(deploymentAssets, {recursive: true});
await cp(
  new URL("../src/modules/deployments/portable-runner.mjs", import.meta.url),
  new URL("portable-runner.mjs", deploymentAssets),
);
console.log("Copied reviewed migration assets into the standalone build.");
