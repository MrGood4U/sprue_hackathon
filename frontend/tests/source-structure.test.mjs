import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const expectedPages = [
  "AgentPage.jsx",
  "ApiDeploymentPage.jsx",
  "DashboardPage.jsx",
  "EntryPage.jsx",
  "ModelServicePage.jsx",
  "MonetizationRevenuePage.jsx",
  "ProductBuilderPage.jsx",
  "PublicProductPage.jsx",
  "WalletAccessPage.jsx",
];

test("keeps one route-level page implementation per page file", async () => {
  const pagesUrl = new URL("pages/", sourceRoot);
  const pageFiles = (await readdir(pagesUrl)).filter((file) => file.endsWith("Page.jsx")).sort();
  assert.deepEqual(pageFiles, expectedPages);

  for (const file of pageFiles) {
    const source = await readFile(new URL(file, pagesUrl), "utf8");
    const exports = source.match(/export function \w+Page\b/g) ?? [];
    assert.equal(exports.length, 1, `${file} must own exactly one exported route-level page.`);
  }
});

test("keeps page implementations out of application composition", async () => {
  const appSource = await readFile(new URL("app/App.jsx", sourceRoot), "utf8");
  const shellSource = await readFile(new URL("app/AppShell.jsx", sourceRoot), "utf8");

  assert.doesNotMatch(appSource, /export function \w+Page\b/);
  assert.doesNotMatch(shellSource, /export function \w+Page\b/);
  await assert.rejects(access(new URL("App.jsx", sourceRoot)));
});

test("keeps the Dashboard focused on metrics and the product list", async () => {
  const source = await readFile(new URL("pages/DashboardPage.jsx", sourceRoot), "utf8");
  const styles = await readFile(new URL("styles.css", sourceRoot), "utf8");

  assert.doesNotMatch(source, /dashboard-lower|dashboard\.activities\.map|dashboard\.sponsorProof\.map/);
  assert.doesNotMatch(styles, /\.dashboard-lower|\.activity-list|\.proof-grid/);
});

test("keeps the API page focused on request and response formats", async () => {
  const source = await readFile(new URL("pages/ApiDeploymentPage.jsx", sourceRoot), "utf8");
  const styles = await readFile(new URL("styles.css", sourceRoot), "utf8");

  assert.match(source, /api\.requestFormat/);
  assert.match(source, /api\.responseFormat/);
  assert.match(source, /api\.requestParameters\.map/);
  assert.match(source, /api\.responseSchema\.fields\.map/);
  assert.doesNotMatch(source, /deploymentEvidence|api\.deployment|openLogs/);
  assert.doesNotMatch(styles, /\.deployment-table|\.evidence-grid/);
});
