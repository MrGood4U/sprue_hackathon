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
  assert.match(source, /useProductDashboard\(\)/);
  assert.match(source, /dashboard\.create\(\)/);
  assert.doesNotMatch(source, /showCreate|dashboard\.createTitle/);
  assert.match(source, /navigate\(`\/app\/products\/\$\{product\.slug\}\/agent`\)/);
  assert.match(source, /onRename\(product\.id, name\)/);
  assert.doesNotMatch(source, /useDemoRuntime|runAction|demoProduct/);
  assert.doesNotMatch(source, /dashboard\.column\.version|demoProduct\.version/);
  const apiColumnIndex = source.indexOf("<span>API</span>");
  const x402ColumnIndex = source.indexOf('t("dashboard.column.x402")');
  assert.ok(apiColumnIndex >= 0 && x402ColumnIndex > apiColumnIndex);
  assert.match(source, /deployment\.accessMode === "x402"/);
  assert.match(source, /common\.notReady/);
  assert.match(source, /dashboard\.status === "error"/);
  assert.match(source, /dashboard\.emptyTitle/);
  assert.match(source, /<Trash size=\{17\} \/>/);
  assert.match(source, /dashboard\.deleteProductTitle/);
  assert.match(source, /await dashboard\.remove\(product\.id\)/);
  assert.match(source, /<Button autoFocus[\s\S]*common\.cancel/);
  assert.match(source, /variant="danger"[\s\S]*dashboard\.deleteProduct/);
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

test("keeps Agent Planner on live durable services without a demo fallback", async () => {
  const page = await readFile(new URL("pages/AgentPage.jsx", sourceRoot), "utf8");
  const hook = await readFile(new URL("features/agent/useAgentPlan.js", sourceRoot), "utf8");
  const elapsedHook = await readFile(new URL("features/agent/useElapsedSeconds.js", sourceRoot), "utf8");
  const progress = await readFile(new URL("features/agent/AgentProgress.jsx", sourceRoot), "utf8");
  const styles = await readFile(new URL("features/agent/agent.css", sourceRoot), "utf8");
  const app = await readFile(new URL("app/App.jsx", sourceRoot), "utf8");

  assert.doesNotMatch(page, /useDemoRuntime|SPRUE-MOCK-PLANNER|assistantResponse|demoNotice/);
  assert.doesNotMatch(hook, /useDemoRuntime|runAction\("agent_plan"/);
  assert.match(hook, /createAgentSession/);
  assert.match(hook, /submitAgentMessage/);
  assert.match(hook, /listAgentMessages/);
  assert.match(app, /!path\.endsWith\("\/agent"\)/);
  assert.match(page, /readyForCompilation === true/);
  assert.match(page, /placeholder=\{t\("agent\.intentPlaceholder"\)\}/);
  assert.match(page, /useElapsedSeconds\(isPlanning\)/);
  assert.match(page, /agent\.elapsed\.seconds/);
  assert.match(page, /Number\.isFinite\(content\?\.durationMs\)/);
  assert.match(page, /agent\.elapsed\.completedSeconds/);
  assert.match(page, /agent\.elapsed\.completedUnderSecond/);
  assert.match(page, /trace=\{isPlanning \? \[\] : agent\.trace\}/);
  assert.match(elapsedHook, /clearInterval\(intervalId\)/);
  assert.match(progress, /CircleNotch className="agent-trace-spinner"/);
  assert.match(styles, /\.agent-trace-spinner \{[^}]*animation: agent-spin 900ms linear infinite;/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-name: agent-spin !important;/);
  assert.match(styles, /animation-duration: 1\.6s !important;/);
});
