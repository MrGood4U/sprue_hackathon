import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import test from "node:test";
import { product } from "../src/services/demo/fixtures/product.js";
import { createDemoDraft, nodeLabels } from "../src/services/demo/fixtures/builder.js";
import { de } from "../src/i18n/messages/de.js";
import { en } from "../src/i18n/messages/en.js";
import { es } from "../src/i18n/messages/es.js";
import { fr } from "../src/i18n/messages/fr.js";
import { ja } from "../src/i18n/messages/ja.js";
import { ko } from "../src/i18n/messages/ko.js";
import { zhCN } from "../src/i18n/messages/zh-CN.js";

const catalogs = {en, "zh-CN": zhCN, es, fr, de, ko, ja};
const localizedCatalogFiles = ["zh-CN", "es", "fr", "de", "ko", "ja"];

function placeholders(value) {
  return [...value.matchAll(/\{\{([A-Za-z0-9_.-]+)\}\}/g)].map((match) => match[1]).sort();
}

test("all locale catalogs expose the same non-empty message keys and placeholders", () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(en).sort(), `${locale} must match the English keys`);
    for (const [key, value] of Object.entries(catalog)) {
      assert.equal(typeof value, "string", `${locale}.${key} must resolve to a string`);
      assert.ok(value.length > 0, `${locale}.${key} must not be empty`);
      assert.deepEqual(placeholders(value), placeholders(en[key]), `${locale}.${key} must preserve interpolation placeholders`);
    }
  }
});

test("language options use each language's native name", () => {
  const expected = {
    "language.en": "English",
    "language.zh-CN": "\u4e2d\u6587",
    "language.es": "Espa\u00f1ol",
    "language.fr": "Fran\u00e7ais",
    "language.de": "Deutsch",
    "language.ko": "\ud55c\uad6d\uc5b4",
    "language.ja": "\u65e5\u672c\u8a9e",
  };
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(catalog[key], value, `${locale}.${key} must use the native language name`);
    }
  }
});

test("new visitors default to English until they explicitly save another locale", async () => {
  const source = await readFile(new URL("../src/i18n/I18nProvider.jsx", import.meta.url), "utf8");
  assert.match(source, /const defaultLocale = "en";/);
  assert.match(source, /localStorage\.getItem\(storageKey\)/);
  assert.match(source, /if \(savedLocale && messages\[savedLocale\]\) return savedLocale;/);
  assert.match(source, /return defaultLocale;/);
  assert.doesNotMatch(source, /navigator\.(?:language|languages)/);
});

test("Hedera account creation labels do not duplicate an add icon", () => {
  assert.equal(en["wallet.createHederaAccount"], "Create Hedera account");
  assert.equal(zhCN["wallet.createHederaAccount"], "\u521b\u5efaHedera\u8d26\u6237");
});

test("every localized catalog explicitly translates each fallback message using ASCII source", async () => {
  for (const locale of localizedCatalogFiles) {
    const source = await readFile(new URL(`../src/i18n/messages/${locale}.js`, import.meta.url), "utf8");
    const declaredKeys = [...source.matchAll(/^\s+"([^"]+)":/gm)].map((match) => match[1]).sort();
    assert.deepEqual(declaredKeys, Object.keys(en).sort(), `${locale} must explicitly declare every message`);
    assert.doesNotMatch(source, /[^\x00-\x7f]/, `${locale} must keep non-English copy Unicode-escaped`);
  }
});

test("the provider and language control register every supported locale", async () => {
  const provider = await readFile(new URL("../src/i18n/I18nProvider.jsx", import.meta.url), "utf8");
  const switcher = await readFile(new URL("../src/components/navigation/LanguageSwitcher.jsx", import.meta.url), "utf8");
  assert.match(provider, /const messages = \{ en, "zh-CN": zhCN, es, fr, de, ko, ja \};/);
  for (const locale of Object.keys(catalogs)) {
    assert.match(switcher, new RegExp(`<option value="${locale.replace("-", "\\-")}">`));
  }
});

test("localized product fixtures reference known messages", () => {
  assert.ok(en[product.intentKey]);
  for (const key of Object.values(nodeLabels)) assert.ok(en[key]);
  for (const group of createDemoDraft().groups) assert.ok(en[group.labelKey]);
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
