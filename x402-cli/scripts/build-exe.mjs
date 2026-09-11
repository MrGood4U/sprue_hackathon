import {copyFile, mkdir, rm, writeFile} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {build} from "esbuild";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workDirectory = join(packageDirectory, "dist", "sea");
const releaseDirectory = join(packageDirectory, "release");
const bundlePath = join(workDirectory, "hx402-cli.bundle.cjs");
const blobPath = join(workDirectory, "hx402-cli.blob");
const configPath = join(workDirectory, "sea-config.json");
const executablePath = join(releaseDirectory, "hx402-cli.exe");
const legacyExecutablePath = join(releaseDirectory, "hx402.exe");
const postjectPath = join(packageDirectory, "node_modules", "postject", "dist", "cli.js");

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {cwd: packageDirectory, stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? "unknown"}.`);
}

if (process.platform !== "win32") {
  throw new Error("build:exe currently creates a Windows executable and must run on Windows.");
}

await rm(workDirectory, {recursive: true, force: true});
await mkdir(workDirectory, {recursive: true});
await mkdir(releaseDirectory, {recursive: true});
await rm(legacyExecutablePath, {force: true});

await build({
  entryPoints: [join(packageDirectory, "src", "cli.ts")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  minify: false,
  sourcemap: false,
  legalComments: "none",
});

await writeFile(configPath, `${JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  execArgvExtension: "none",
}, null, 2)}\n`, "utf8");

run(process.execPath, ["--experimental-sea-config", configPath]);
await copyFile(process.execPath, executablePath);
run(process.execPath, [
  postjectPath,
  executablePath,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
]);

process.stdout.write(`Created ${executablePath}\n`);
