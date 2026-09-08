import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceRoot = new URL("../src/", import.meta.url);
const tokenUrl = new URL("../src/design-tokens.json", import.meta.url);
const supportedSourceExtensions = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);

function lengthInPixels(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)(px|rem)$/);
  if (!match) throw new Error(`Unsupported font-size token value: ${value}`);
  const amount = Number(match[1]);
  return match[2] === "rem" ? amount * 16 : amount;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...await sourceFiles(url));
    else if (supportedSourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(url);
  }
  return files;
}

const tokens = JSON.parse(await readFile(tokenUrl, "utf8"));
const fontSizes = tokens.primitive?.fontSize;
if (!fontSizes?.minimum?.$value) throw new Error("primitive.fontSize.minimum must define the typography floor.");

const minimumPixels = lengthInPixels(fontSizes.minimum.$value);
if (minimumPixels !== 12) throw new Error(`The approved typography floor is 12px, received ${minimumPixels}px.`);

const violations = [];
for (const [name, token] of Object.entries(fontSizes)) {
  const pixels = lengthInPixels(token.$value);
  if (pixels < minimumPixels) violations.push(`design-tokens.json: primitive.fontSize.${name} resolves to ${pixels}px`);
}

const declarationPattern = /(?:font-size\s*:\s*|font\s*:[^;{}]*?)(\d+(?:\.\d+)?)(px|rem)\b/g;
const inlineNumberPattern = /\bfontSize\s*:\s*(\d+(?:\.\d+)?)\b/g;
const inlineStringPattern = /\bfontSize\s*:\s*["'`](\d+(?:\.\d+)?)(px|rem)["'`]/g;

for (const url of await sourceFiles(sourceRoot)) {
  const source = await readFile(url, "utf8");
  const relative = fileURLToPath(url).slice(fileURLToPath(sourceRoot).length).replaceAll("\\", "/");
  for (const match of source.matchAll(declarationPattern)) {
    const pixels = lengthInPixels(`${match[1]}${match[2]}`);
    if (pixels < minimumPixels) violations.push(`${relative}:${lineNumber(source, match.index)} uses ${match[1]}${match[2]}`);
  }
  for (const match of source.matchAll(inlineNumberPattern)) {
    const pixels = Number(match[1]);
    if (pixels < minimumPixels) violations.push(`${relative}:${lineNumber(source, match.index)} uses an inline ${pixels}px font size`);
  }
  for (const match of source.matchAll(inlineStringPattern)) {
    const pixels = lengthInPixels(`${match[1]}${match[2]}`);
    if (pixels < minimumPixels) violations.push(`${relative}:${lineNumber(source, match.index)} uses an inline ${match[1]}${match[2]} font size`);
  }
}

if (violations.length) {
  throw new Error(`Typography floor violations:\n${violations.map((item) => `- ${item}`).join("\n")}`);
}

console.log(`Typography floor is valid: all visible text is at least ${minimumPixels}px.`);
