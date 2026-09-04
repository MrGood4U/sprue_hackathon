import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceUrl = new URL("../src/design-tokens.json", import.meta.url);
const outputUrl = new URL("../src/tokens.css", import.meta.url);
const checkOnly = process.argv.includes("--check");

function kebab(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function cssVariable(path) {
  const normalized = path[0] === "semantic" || path[0] === "component" ? path.slice(1) : path;
  return `--${normalized.map(kebab).join("-")}`;
}

function references(value) {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function tokenAt(tokens, reference) {
  return reference.split(".").reduce((value, key) => value?.[key], tokens);
}

function cssValue(value) {
  if (typeof value !== "string") return String(value);
  return value.replace(/\{([^}]+)\}/g, (_, reference) => `var(${cssVariable(reference.split("."))})`);
}

function collect(group, prefix, tokens, output) {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith("$")) continue;
    const path = [...prefix, key];
    if (value && typeof value === "object" && "$value" in value) {
      if (!value.$type || !value.$description) {
        throw new Error(`${path.join(".")} must include $type and $description.`);
      }
      const expectedDependency = path[0] === "semantic" ? "primitive" : path[0] === "component" ? "semantic" : null;
      for (const reference of references(value.$value)) {
        if (!tokenAt(tokens, reference)?.$value) {
          throw new Error(`${path.join(".")} references missing token ${reference}.`);
        }
        if (expectedDependency && !reference.startsWith(`${expectedDependency}.`)) {
          throw new Error(`${path.join(".")} must reference the ${expectedDependency} layer, not ${reference}.`);
        }
      }
      output.push({ path, value: cssValue(value.$value), description: value.$description });
      continue;
    }
    if (value && typeof value === "object") collect(value, path, tokens, output);
  }
}

function renderLayer(name, tokens) {
  const output = [];
  collect(tokens[name], [name], tokens, output);
  const declarations = output
    .map(({ path, value, description }) => `  /* ${description} */\n  ${cssVariable(path)}: ${value};`)
    .join("\n");
  return `/* === ${name.toUpperCase()} === */\n:root {\n${declarations}\n}`;
}

const tokens = JSON.parse(await readFile(sourceUrl, "utf8"));
const generated = `/* Sprue design tokens - generated from design-tokens.json. */
/* Run npm run tokens after editing the JSON source. */

${["primitive", "semantic", "component"].map((layer) => renderLayer(layer, tokens)).join("\n\n")}
`;

if (checkOnly) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  if (current !== generated) {
    throw new Error(`Generated token file is stale: ${fileURLToPath(outputUrl)}`);
  }
  console.log(`Design tokens are valid and current: ${fileURLToPath(outputUrl)}`);
} else {
  await writeFile(outputUrl, generated);
  console.log(`Generated design tokens: ${fileURLToPath(outputUrl)}`);
}
