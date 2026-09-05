import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import test from "node:test";
import { dagNodes, product } from "../src/services/demo/fixtures/product.js";
import { en } from "../src/i18n/messages/en.js";
import { zhCN } from "../src/i18n/messages/zh-CN.js";

test("English and Chinese catalogs expose the same message keys", () => {
  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort());
  for (const [key, value] of Object.entries(zhCN)) {
    assert.equal(typeof value, "string", `${key} must resolve to a string`);
    assert.ok(value.length > 0, `${key} must not be empty`);
  }
});

test("the Chinese catalog explicitly translates every fallback message", async () => {
  const source = await readFile(new URL("../src/i18n/messages/zh-CN.js", import.meta.url), "utf8");
  const declaredKeys = [...source.matchAll(/^\s+"([^"]+)":/gm)].map((match) => match[1]).sort();
  assert.deepEqual(declaredKeys, Object.keys(en).sort());
});

test("localized product fixtures reference known messages", () => {
  assert.ok(en[product.intentKey]);
  for (const node of dagNodes) {
    assert.ok(en[node.titleKey]);
    assert.ok(en[node.typeKey]);
    for (const detail of node.detail) {
      if (typeof detail !== "string") assert.ok(en[detail.key]);
    }
  }
});

test("literal translation references exist in the English fallback catalog", async () => {
  const sourceFiles = [];
  for await (const file of glob("src/**/*.{js,jsx}", { cwd: new URL("..", import.meta.url) })) {
    sourceFiles.push(file);
  }

  for (const file of sourceFiles) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/\bt\("([^"]+)"/g)) {
      assert.ok(en[match[1]], `${file} references missing message key ${match[1]}`);
    }
  }
});
