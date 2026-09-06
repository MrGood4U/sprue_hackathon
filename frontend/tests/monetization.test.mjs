import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hackathon monetization keeps the full price with the creator and omits fee evidence UI", async () => {
  const page = await readFile(new URL("../src/pages/MonetizationRevenuePage.jsx", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../backend/src/modules/demo/runtime.ts", import.meta.url), "utf8");
  const english = await readFile(new URL("../src/i18n/messages/en.js", import.meta.url), "utf8");

  assert.match(page, /numericPrice\.toFixed\(3\)/);
  assert.doesNotMatch(page, /feePercent|sprueFee|serviceFee|split-bar|split-legend|evidence-callout|evidenceRetained/);
  assert.doesNotMatch(runtime, /feePercent:|creatorReceives:|serviceFee:/);
  assert.doesNotMatch(english, /monetize\.(sprueFee|serviceFee|creatorReceivesPercent|sprueReceivesPercent|evidenceRetained|evidenceDetail)/);
});
