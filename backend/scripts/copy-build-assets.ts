import { cp, mkdir } from "node:fs/promises";
const destination = new URL("../dist/migrations/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL("../migrations/", import.meta.url), destination, {
  recursive: true,
});
console.log("Copied reviewed migration assets into the standalone build.");
