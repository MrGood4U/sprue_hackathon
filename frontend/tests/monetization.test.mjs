import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hackathon monetization keeps the full price with the creator and omits fee evidence UI", async () => {
  const page = await readFile(new URL("../src/pages/MonetizationRevenuePage.jsx", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../backend/src/modules/demo/runtime.ts", import.meta.url), "utf8");
  const english = await readFile(new URL("../src/i18n/messages/en.js", import.meta.url), "utf8");
  const delivery = await readFile(new URL("../src/services/api/delivery.js", import.meta.url), "utf8");

  assert.match(page, /function formatAtomic\(money\)/);
  assert.match(page, /monetization\.revenue\.creatorProceeds/);
  assert.match(page, /useProductDelivery\(productRef\)/);
  assert.match(page, /delivery\.publish\(/);
  assert.match(page, /delivery\.retire\(/);
  assert.match(page, /className="monetize-heading-actions"/);
  assert.match(page, /setPublishOpen\(true\)/);
  assert.match(page, /monetize\.stopDeployment/);
  assert.match(page, /className="x402-publish-modal"/);
  assert.doesNotMatch(page, /monetize-grid|settlement-preview|settlement-amount|settlement-flow/);
  assert.equal(page.match(/<section className="panel/g)?.length, 2);
  assert.match(delivery, /export function publishX402/);
  assert.match(delivery, /export function retireX402/);
  assert.doesNotMatch(page, /useDemoRuntime|setPublished|simulationNotice|demoPublished/);
  assert.doesNotMatch(page, /feePercent|sprueFee|serviceFee|split-bar|split-legend|evidence-callout|evidenceRetained/);
  assert.doesNotMatch(runtime, /feePercent:|creatorReceives:|serviceFee:/);
  assert.doesNotMatch(english, /monetize\.(sprueFee|serviceFee|creatorReceivesPercent|sprueReceivesPercent|evidenceRetained|evidenceDetail)/);
});
