import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const expectedPages = [
  "AgentPage.jsx",
  "ApiDeploymentPage.jsx",
  "DashboardPage.jsx",
  "EntryPage.jsx",
  "LoginPage.jsx",
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
  const productHeader = await readFile(new URL("components/product/ProductHeader.jsx", sourceRoot), "utf8");
  const productNameEditor = await readFile(new URL("components/product/EditableProductName.jsx", sourceRoot), "utf8");
  const styles = await readFile(new URL("styles.css", sourceRoot), "utf8");

  assert.doesNotMatch(source, /dashboard-lower|dashboard\.activities\.map|dashboard\.sponsorProof\.map/);
  assert.doesNotMatch(styles, /\.dashboard-lower|\.activity-list|\.proof-grid/);
  assert.match(source, /<div className="toolbar-cluster">[\s\S]*dashboard\.newProduct[\s\S]*search-control/);
  assert.doesNotMatch(source, /<AppHeader[\s\S]*?actions=\{/);
  assert.match(styles, /\.app-header \{[^}]*align-items: flex-start/);
  assert.match(source, /<EditableProductName[\s\S]*variant="table"/);
  assert.match(source, /runAction\("rename_product", \{ name: "New Product" \}\)/);
  assert.doesNotMatch(source, /dashboard\.column\.version|demoProduct\.version/);
  const apiColumnIndex = source.indexOf("<span>API</span>");
  const x402ColumnIndex = source.indexOf('t("dashboard.column.x402")');
  assert.ok(apiColumnIndex >= 0 && x402ColumnIndex > apiColumnIndex);
  assert.match(source, /demoProduct\.x402Status === "ready"/);
  assert.match(source, /common\.notReady/);
  assert.match(productHeader, /<EditableProductName[\s\S]*titleActivatesEdit/);
  assert.match(productNameEditor, /onBlur=\{\(\) => void commit\(\)\}/);
  assert.match(productNameEditor, /event\.key === "Enter"/);
  assert.match(productNameEditor, /event\.key === "Escape"/);
  assert.doesNotMatch(productNameEditor, /title=/);
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

test("keeps Model Service credentials concealed and connection testing explicit", async () => {
  const source = await readFile(new URL("pages/ModelServicePage.jsx", sourceRoot), "utf8");

  assert.match(source, /type=\{showKey \? "text" : "password"\}/);
  assert.match(source, /showKey \? <Eye size=\{17\} \/> : <EyeClosed size=\{17\} \/>/);
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/chat\/completions/);
  assert.match(source, /placeholder="gpt-5\.6-sol"/);
  assert.match(source, /modelService\.test/);
  assert.match(source, /testConnection/);
});
