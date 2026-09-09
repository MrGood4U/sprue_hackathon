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
  const routeBoundary = await readFile(new URL("app/CreatorRouteErrorBoundary.jsx", sourceRoot), "utf8");

  assert.doesNotMatch(appSource, /export function \w+Page\b/);
  assert.doesNotMatch(shellSource, /export function \w+Page\b/);
  assert.match(appSource, /<CreatorRouteErrorBoundary path=\{path\} navigate=\{navigate\}>/);
  assert.match(routeBoundary, /getDerivedStateFromError/);
  assert.match(routeBoundary, /componentDidCatch/);
  assert.match(routeBoundary, /productHeader\.backToProducts/);
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
  assert.doesNotMatch(source, /dashboard\.createAnother|dashboard-create-another/);
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
  const deliveryHook = await readFile(new URL("features/delivery/useProductDelivery.js", sourceRoot), "utf8");
  const deliveryApi = await readFile(new URL("services/api/delivery.js", sourceRoot), "utf8");
  const styles = await readFile(new URL("styles.css", sourceRoot), "utf8");

  assert.match(source, /api\.requestFormat/);
  assert.match(source, /api\.responseFormat/);
  assert.match(source, /contract\.parameterSchema\.map/);
  assert.match(source, /fieldRows\(contract\.responseSchema\.outputSchema\)/);
  assert.match(source, /contract\.exampleBody/);
  assert.match(source, /useProductDelivery\(productRef\)/);
  assert.doesNotMatch(source, /useDemoRuntime|useRequestTest|responseExample|mock-chip/);
  assert.match(deliveryHook, /getProductDelivery/);
  assert.match(deliveryApi, /meta\?\.dataSource !== "live"/);
  assert.doesNotMatch(source, /deploymentEvidence|openLogs/);
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
  const agentData = await readFile(new URL("features/agent/agentData.js", sourceRoot), "utf8");
  const elapsedHook = await readFile(new URL("features/agent/useElapsedSeconds.js", sourceRoot), "utf8");
  const progress = await readFile(new URL("features/agent/AgentProgress.jsx", sourceRoot), "utf8");
  const stepCards = await readFile(new URL("features/agent/AgentStepCards.jsx", sourceRoot), "utf8");
  const agentApi = await readFile(new URL("services/api/agent.js", sourceRoot), "utf8");
  const styles = await readFile(new URL("features/agent/agent.css", sourceRoot), "utf8");
  const app = await readFile(new URL("app/App.jsx", sourceRoot), "utf8");
  const builderPage = await readFile(new URL("pages/ProductBuilderPage.jsx", sourceRoot), "utf8");
  const productHeader = await readFile(new URL("components/product/ProductHeader.jsx", sourceRoot), "utf8");
  const appShell = await readFile(new URL("app/AppShell.jsx", sourceRoot), "utf8");
  const productCache = await readFile(new URL("features/products/ProductCacheProvider.jsx", sourceRoot), "utf8");
  const liveBuilderProjection = await readFile(new URL("features/builder/liveBuilderProjection.js", sourceRoot), "utf8");

  assert.doesNotMatch(page, /useDemoRuntime|SPRUE-MOCK-PLANNER|assistantResponse|demoNotice/);
  assert.doesNotMatch(hook, /useDemoRuntime|runAction\("agent_plan"/);
  assert.match(hook, /createAgentSession/);
  assert.match(hook, /submitAgentMessage/);
  assert.match(agentData, /listAgentMessages/);
  assert.match(hook, /listAgentTraceEvents/);
  assert.match(hook, /cancelAgentPlanning/);
  assert.match(hook, /pollActiveTrace/);
  assert.match(hook, /latestRunMessages/);
  assert.match(hook, /messages: \[\{/);
  assert.match(hook, /id: `pending-\$\{idempotencyKey\}`/);
  assert.match(hook, /Math\.min\(5000, Math\.round\(delayMs \* 1\.5\)\)/);
  assert.match(hook, /activeSubmission/);
  assert.doesNotMatch(app, /path\.endsWith\("\/api"\) \|\| path\.endsWith\("\/monetize"\)/);
  assert.doesNotMatch(builderPage, /useDemoRuntime|useBuildRun/);
  assert.match(builderPage, /useProductBuilder\(productRef\)/);
  assert.match(builderPage, /cacheBuilderDraft/);
  assert.match(productHeader, /productRef = product\?\.slug/);
  assert.match(productHeader, /`\/app\/products\/\$\{productRef\}\/agent`/);
  assert.match(appShell, /<ProductBuilderPage path=\{path\}/);
  assert.match(appShell, /<ProductCacheProvider>/);
  assert.match(productCache, /identity\?\.defaultWorkspaceId/);
  assert.match(productHeader, /className="product-name-skeleton"/);
  assert.doesNotMatch(page, /name: productRef/);
  assert.match(page, /<ProductHeader product=\{routeProduct\} productRef=\{productRef\} active="agent"/);
  assert.match(page, /<ProductHeader product=\{agent\.product\} productRef=\{productRef\} active="agent"/);
  assert.match(page, /setIntent\(latestIntent \|\| agent\.product\.originalIntent \|\| ""\)/);
  assert.match(page, /if \(agent\.status === "loading"\)/);
  assert.doesNotMatch(page, /agent\.status === "loading" && !agent\.product/);
  assert.match(page, /const buildPath = `\/app\/products\/\$\{productRef\}\/build`/);
  assert.match(liveBuilderProjection, /export function isBuilderDraft\(value\)/);
  assert.match(page, /const canPreviewPlan = latestResult\?\.kind === "proposal" && isBuilderDraft\(latestResult\.builderDraft\)/);
  assert.match(page, /const canCreateManually = !isPlanning && !canPreviewPlan/);
  assert.equal(page.match(/canCreateManually && <Button/g)?.length, 2);
  assert.match(page, /agent\.manualCreate/);
  assert.match(page, /canPreviewPlan && <Button[^>]*variant="primary"[^>]*>[\s\S]*?agent\.next/);
  assert.doesNotMatch(page, /proposal\??\.issues|source\.limitations|agent\.fact\.issues|agent\.issuesTitle/);
  assert.doesNotMatch(styles, /\.agent-issues/);
  assert.match(page, /agent\.stopAction/);
  assert.match(page, /confirmation === "cancel"/);
  assert.match(page, /placeholder=\{t\("agent\.intentPlaceholder"\)\}/);
  assert.match(page, /useElapsedSeconds\(isPlanning\)/);
  assert.match(stepCards, /agent\.elapsed\.seconds/);
  assert.match(stepCards, /agent\.elapsed\.hoursMinutesSeconds/);
  assert.match(agentApi, /planningRequestTimeoutMs = 7_260_000/);
  assert.match(agentApi, /planning\/\$\{commandId\}\/cancel/);
  assert.match(page, /AGENT_RUN_TIMEOUT: "agent\.error\.runTimeout"/);
  assert.match(page, /EMBEDDING_REQUEST_FAILED: "agent\.error\.embeddingRequest"/);
  assert.match(page, /Number\.isFinite\(content\?\.durationMs\)/);
  assert.match(page, /agent\.elapsed\.completedSeconds/);
  assert.match(page, /agent\.elapsed\.completedUnderSecond/);
  assert.match(page, /<AgentStepCards trace=\{agent\.liveTrace\} running elapsedSeconds=\{elapsedSeconds\}/);
  assert.match(page, /trace=\{isPlanning \? agent\.liveTrace : agent\.trace\}/);
  assert.match(page, /<AgentStepCards trace=\{message\.contentJson\?\.trace\}/);
  assert.match(page, /const chatViewportRef = useRef\(null\)/);
  assert.match(page, /ref=\{chatViewportRef\} className="agent-chat" role="log" tabIndex=\{0\}/);
  assert.match(page, /chatViewport\.scrollTo\(\{[\s\S]*top: chatViewport\.scrollHeight,[\s\S]*behavior:/);
  assert.match(page, /\}, \[newestCardKey\]\);/);
  assert.match(styles, /\.agent-page \{[^}]*height: 100dvh;[^}]*overflow: hidden;/s);
  assert.match(styles, /\.agent-layout \{[^}]*height: calc\(100dvh - var\(--product-header-height\)\);[^}]*min-height: 0;[^}]*overflow: hidden;/s);
  assert.match(styles, /\.agent-conversation \{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto;/s);
  assert.match(styles, /\.agent-chat \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/s);
  assert.match(styles, /\.agent-progress-panel \{[^}]*height: 100%;[^}]*overflow-y: auto;/s);
  assert.match(styles, /\.agent-chat, \.agent-progress-panel \{[^}]*scrollbar-width: thin;[^}]*scrollbar-color:/s);
  assert.match(styles, /\.agent-chat::\-webkit-scrollbar-thumb, \.agent-progress-panel::\-webkit-scrollbar-thumb \{[^}]*border-radius: 999px;[^}]*background-clip: padding-box;/s);
  assert.match(styles, /\.agent-chat::\-webkit-scrollbar-button, \.agent-progress-panel::\-webkit-scrollbar-button \{[^}]*display: none;/s);
  assert.match(elapsedHook, /clearInterval\(intervalId\)/);
  assert.match(progress, /CircleNotch className="agent-trace-spinner"/);
  assert.match(progress, /semantic_entity_retrieval/);
  assert.match(progress, /semantic_field_retrieval/);
  assert.match(stepCards, /event\.summary/);
  assert.match(stepCards, /semantic_entity_retrieval/);
  assert.match(stepCards, /semantic_field_retrieval/);
  assert.match(stepCards, /agent\.status\.\$\{state\}/);
  assert.match(stepCards, /agent-step-card-spinner/);
  assert.match(styles, /\.agent-trace-spinner \{[^}]*animation: agent-spin 900ms linear infinite;/s);
  assert.match(styles, /\.agent-step-card-spinner \{[^}]*animation: agent-spin 900ms linear infinite;/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-name: agent-spin !important;/);
  assert.match(styles, /animation-duration: 1\.6s !important;/);
});

test("selects only the newest Agent run without mutating durable history", async () => {
  const {latestRunMessages} = await import(new URL("features/agent/latestRunMessages.js", sourceRoot));
  const history = [
    {id: "user-1", role: "user"},
    {id: "assistant-1", role: "assistant"},
    {id: "user-2", role: "user"},
    {id: "assistant-2", role: "assistant"},
  ];

  assert.deepEqual(latestRunMessages(history).map(({id}) => id), ["user-2", "assistant-2"]);
  assert.deepEqual(history.map(({id}) => id), ["user-1", "assistant-1", "user-2", "assistant-2"]);
  assert.deepEqual(latestRunMessages([{id: "assistant-only", role: "assistant"}]), []);
});
