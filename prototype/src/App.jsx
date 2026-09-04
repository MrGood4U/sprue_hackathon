import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, ArrowSquareOut, ArrowsClockwise, Books, BracketsCurly,
  CalendarBlank, CaretDown, ChartLineUp, Check, CheckCircle, Code, Coins, Copy,
  CreditCard, CurrencyDollar, Database, DotsThree, Eye, FileCode, FileText, Funnel,
  Gear, Graph, HardDrives, Key, ListBullets, LockKey, MagnifyingGlass, Play, Plus,
  RocketLaunch, ShieldCheck, SlidersHorizontal, Sparkle, SquaresFour, TerminalWindow,
  UserCircle, Wallet, WarningCircle, X,
} from "@phosphor-icons/react";

const productSlug = "base-dex-stickiness";
const product = {
  name: "Base DEX Stickiness",
  intent: "Measure DEX stickiness on Base over 30 days. Exclude one-time wallets and group by protocol.",
  endpoint: "https://api.sprue.dev/v1/base-dex-stickiness",
};

const nodes = [
  { icon: Database, title: "Graph Source", type: "SOURCE", accent: "cyan", detail: ["The Graph", "Base DEX Events", "base-dex@v1.4.2"] },
  { icon: Funnel, title: "Filter Repeat Wallets", type: "TRANSFORM", accent: "cyan", detail: ["Logic", "wallet interactions > 1", "COUNT(DISTINCT tx)"] },
  { icon: CalendarBlank, title: "30d Window", type: "TRANSFORM", accent: "cyan", detail: ["Last 30 days", "UTC anchored", "Inclusive bound"] },
  { icon: UserCircle, title: "Group by Protocol", type: "TRANSFORM", accent: "cyan", detail: ["Key: protocol", "Estimated < 200", "Stable ordering"] },
  { icon: ChartLineUp, title: "Aggregate Stickiness", type: "TRANSFORM", accent: "cyan", detail: ["stickiness_score", "unique_wallets", "total_wallets"] },
  { icon: Code, title: "API Output", type: "MATERIALIZE", accent: "violet", detail: ["API (x402)", "JSON", "5 min cache"] },
];

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const navigate = (next) => {
    window.history.pushState({}, "", next);
    setPath(next);
    window.scrollTo(0, 0);
  };
  return { path, navigate };
}

function IconButton({ label, children, ...props }) {
  return <button className="icon-button" aria-label={label} title={label} {...props}>{children}</button>;
}

function Status({ tone = "green", children }) {
  return <span className={`status status-${tone}`}><span className="status-dot" />{children}</span>;
}

function Button({ variant = "secondary", icon: Icon, children, className = "", ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{Icon && <Icon size={17} weight="bold" />}<span>{children}</span></button>;
}

function Modal({ title, eyebrow, children, footer, onClose, width = "520px" }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" style={{ maxWidth: width }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id="modal-title">{title}</h2></div><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </section>
    </div>
  );
}

function Field({ label, hint, children }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function Sidebar({ path, navigate }) {
  const isProducts = path === "/app" || path.includes("/products/");
  return (
    <aside className="sidebar">
      <div className="brand-row"><button className="brand" onClick={() => navigate("/app")}>Sprue</button><IconButton label="Collapse navigation"><ArrowLeft size={16} /></IconButton></div>
      <nav className="side-nav" aria-label="Primary navigation">
        <button className={isProducts ? "active" : ""} onClick={() => navigate("/app")}><SquaresFour size={20} /><span>Products</span></button>
        <button className={path === "/app/wallet" ? "active" : ""} onClick={() => navigate("/app/wallet")}><Wallet size={20} /><span>Wallet & Access</span></button>
      </nav>
      <div className="side-section"><div className="side-label">Environment</div><button className="environment-button"><span>Demo</span><CaretDown size={15} /></button></div>
      <div className="readiness-list">
        <div className="readiness-item"><Database size={19} className="violet-text" /><div><span>The Graph</span><small>Ready</small></div><CheckCircle size={18} weight="fill" className="green-text" /></div>
        <div className="readiness-item"><Coins size={19} /><div><span>Hedera</span><small>Ready</small></div><CheckCircle size={18} weight="fill" className="green-text" /></div>
      </div>
      <nav className="side-nav side-nav-bottom" aria-label="Secondary navigation">
        <button onClick={() => alert("Documentation is outside this prototype.")}><Books size={20} /><span>Docs</span></button>
        <button onClick={() => alert("Settings are not included in this prototype.")}><Gear size={20} /><span>Settings</span></button>
      </nav>
      <div className="prototype-stamp">Interactive prototype · Mock data</div>
    </aside>
  );
}

function AppHeader({ title, subtitle, actions }) {
  return <header className="app-header"><div><span className="eyebrow">Workspace / Demo</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="header-actions">{actions}</div></header>;
}

function Metric({ label, value, note, tone }) {
  return <div className="metric"><span>{label}</span><strong className={tone ? `${tone}-text` : ""}>{value}</strong>{note && <small>{note}</small>}</div>;
}

function Dashboard({ navigate }) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="page">
      <AppHeader title="Data products" subtitle="Turn an intent into a traceable, hosted API." actions={<Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>New product</Button>} />
      <div className="metrics-row">
        <Metric label="Active products" value="1" note="1 draft version" />
        <Metric label="Requests · 24h" value="1,284" note="Prototype traffic" />
        <Metric label="Graph spend · 24h" value="$2.84" note="Within policy" tone="amber" />
        <Metric label="x402 revenue · 24h" value="18.42 HBAR" note="Simulated settlement" tone="green" />
      </div>
      <section className="panel product-list-panel">
        <div className="panel-toolbar"><div><h2>All products</h2><p>Build state, source authority, and API readiness at a glance.</p></div><div className="toolbar-cluster"><label className="search-control"><MagnifyingGlass size={17} /><input aria-label="Search products" placeholder="Search products" /></label><IconButton label="Filter products"><SlidersHorizontal size={18} /></IconButton></div></div>
        <div className="table" role="table" aria-label="Data products">
          <div className="table-row table-head" role="row"><span>Product</span><span>Source</span><span>Version</span><span>API</span><span>Last run</span><span aria-label="Actions" /></div>
          <button className="table-row product-row" onClick={() => navigate(`/app/products/${productSlug}/build`)}>
            <span className="product-cell"><span className="product-icon"><Graph size={20} /></span><span><strong>{product.name}</strong><small>DEX retention by protocol</small></span></span>
            <span><Status>The Graph</Status><small>Base mainnet</small></span><span><strong>v1</strong><small>Proposed</small></span><span><Status tone="violet">Ready</Status><small>Hosted endpoint</small></span><span><strong>8 min ago</strong><small>1,284 rows</small></span><span><ArrowRight size={18} /></span>
          </button>
          <div className="table-empty-row"><Plus size={16} /> Create another product from a natural-language intent</div>
        </div>
      </section>
      <section className="dashboard-lower">
        <div className="panel compact-panel"><div className="panel-title"><CalendarBlank size={19} /><h3>Recent activity</h3></div><ul className="activity-list"><li><CheckCircle size={17} className="green-text" /><span><strong>Schema validated</strong><small>Base DEX Stickiness · 8 min ago</small></span></li><li><Database size={17} className="violet-text" /><span><strong>Source snapshot pinned</strong><small>The Graph · 12 min ago</small></span></li><li><ShieldCheck size={17} className="amber-text" /><span><strong>Spend policy authorized</strong><small>Maximum $0.05 per request</small></span></li></ul></div>
        <div className="panel compact-panel"><div className="panel-title"><ShieldCheck size={19} /><h3>Sponsor proof</h3></div><div className="proof-grid"><div><span>The Graph</span><Status>Source verified</Status></div><div><span>Privy</span><Status>Wallet ready</Status></div><div><span>Hedera</span><Status>x402 ready</Status></div></div></div>
      </section>
      {showCreate && <Modal title="Describe a data product" eyebrow="New product · Prototype" onClose={() => setShowCreate(false)} footer={<><Button onClick={() => setShowCreate(false)}>Cancel</Button><Button variant="primary" icon={Sparkle} onClick={() => { setShowCreate(false); navigate(`/app/products/${productSlug}/build`); }}>Generate plan</Button></>}><Field label="Intent" hint="Sprue will propose an allowlisted DAG before any data is fetched."><textarea defaultValue={product.intent} rows={5} /></Field><div className="inline-notice"><Sparkle size={18} /><span>This interaction is simulated. No agent or paid data call runs in the prototype.</span></div></Modal>}
    </div>
  );
}

function WalletPage() {
  const [modal, setModal] = useState(null);
  const [mode, setMode] = useState("x402");
  return (
    <div className="page">
      <AppHeader title="Wallet & Access" subtitle="Separate identity, credentials, and bounded machine spending." actions={<Button icon={Plus} onClick={() => setModal("credential")}>Add credential</Button>} />
      <div className="wallet-grid">
        <section className="panel wallet-hero"><div className="panel-kicker"><Wallet size={18} /> PRIVY EMBEDDED WALLET</div><div className="wallet-address-row"><div><span>Creator wallet</span><strong>0x71F2…9C84</strong></div><IconButton label="Copy wallet address"><Copy size={18} /></IconButton></div><div className="wallet-balance"><span>Available Graph spend</span><strong>3.12 USDC</strong></div><div className="wallet-actions"><Button variant="primary" icon={CreditCard} onClick={() => setModal("fund")}>Fund wallet</Button><Button icon={ArrowSquareOut}>View wallet</Button></div><div className="security-line"><LockKey size={17} /><span>Sprue submits bounded delegated actions. The user remains the wallet owner.</span></div></section>
        <section className="panel policy-card"><div className="panel-title"><ShieldCheck size={19} /><h3>Graph spend authority</h3><Status>Active</Status></div><dl className="detail-list"><div><dt>Per request</dt><dd>0.05 USDC</dd></div><div><dt>Daily ceiling</dt><dd>5.00 USDC</dd></div><div><dt>Allowed payee</dt><dd>The Graph x402</dd></div><div><dt>Expires</dt><dd>Sep 12, 2026</dd></div></dl><Button icon={SlidersHorizontal} onClick={() => setModal("policy")}>Edit policy</Button></section>
      </div>
      <section className="panel access-panel"><div className="panel-toolbar"><div><h2>Graph access</h2><p>Choose an existing subscription key or pay per request through x402.</p></div><Status>Configured</Status></div><div className="segmented" role="group" aria-label="Graph access mode"><button className={mode === "api" ? "active" : ""} onClick={() => setMode("api")}><Key size={18} /><span><strong>API key</strong><small>Use an existing Graph subscription</small></span></button><button className={mode === "x402" ? "active" : ""} onClick={() => setMode("x402")}><CurrencyDollar size={18} /><span><strong>x402 per request</strong><small>Pay from the bounded Privy wallet</small></span></button></div><div className="access-detail">{mode === "x402" ? <><Status tone="amber">Cost protected</Status><p>Sprue may pay The Graph up to <strong>0.05 USDC</strong> for an allowed request. Every authorization and settlement is retained as evidence.</p></> : <><Status tone="violet">Credential vault</Status><p>Requests use the encrypted credential <strong>graph-production-01</strong>. The key value is never returned to the browser.</p></>}</div></section>
      <section className="panel"><div className="panel-toolbar"><div><h2>Credentials</h2><p>Encrypted references available to this workspace.</p></div></div><div className="credential-row"><span className="credential-icon"><Key size={19} /></span><span><strong>graph-production-01</strong><small>The Graph · API key · Added Sep 5</small></span><Status tone="violet">Vaulted</Status><IconButton label="Credential actions"><DotsThree size={21} /></IconButton></div></section>
      {modal === "credential" && <Modal title="Add Graph credential" eyebrow="Encrypted reference" onClose={() => setModal(null)} footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" onClick={() => setModal(null)}>Save reference</Button></>}><Field label="Credential name"><input defaultValue="graph-production-02" /></Field><Field label="API key" hint="Prototype only. Do not paste a real secret."><input type="password" placeholder="Never enter real credentials" /></Field></Modal>}
      {modal === "fund" && <Modal title="Fund creator wallet" eyebrow="Prototype simulation" onClose={() => setModal(null)} footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" onClick={() => setModal(null)}>Simulate deposit</Button></>}><div className="big-number">10.00 <span>USDC</span></div><div className="inline-notice"><WarningCircle size={18} /><span>No deposit or transaction will occur in this prototype.</span></div></Modal>}
      {modal === "policy" && <Modal title="Edit Graph spend policy" eyebrow="Bounded delegation" onClose={() => setModal(null)} footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" onClick={() => setModal(null)}>Save mock policy</Button></>}><div className="field-grid"><Field label="Per request"><input defaultValue="0.05 USDC" /></Field><Field label="Daily ceiling"><input defaultValue="5.00 USDC" /></Field></div><Field label="Allowed payee"><input defaultValue="The Graph x402" /></Field></Modal>}
    </div>
  );
}

function ProductHeader({ active, navigate, buildStatus = "Ready to build" }) {
  const tabs = [["Build", `/app/products/${productSlug}/build`], ["API", `/app/products/${productSlug}/api`], ["Monetize", `/app/products/${productSlug}/monetize`]];
  return <header className="product-header"><div className="product-title-row"><button className="back-link" onClick={() => navigate("/app")}><ArrowLeft size={21} /><span>{product.name}</span></button><div className="product-head-actions"><button className="version-select">v1 proposed <CaretDown size={15} /></button><span className="ready-pill"><CheckCircle size={18} weight="fill" />{buildStatus}</span></div></div><nav className="product-tabs" aria-label="Product sections">{tabs.map(([label, target]) => <button key={label} className={active === label ? "active" : ""} onClick={() => navigate(target)}>{label}</button>)}</nav></header>;
}

function BuildReadiness() {
  return <aside className="readiness-panel"><span className="section-label">Build readiness</span><div className="readiness-block"><div className="readiness-title"><Database size={22} className="violet-text" /><strong>Source snapshot</strong><CheckCircle size={18} weight="fill" className="green-text" /></div><dl className="mono-list"><div><dt>Provider</dt><dd>The Graph</dd></div><div><dt>Subgraph</dt><dd>base-dex@v1.4.2</dd></div><div><dt>Network</dt><dd>Base Mainnet</dd></div><div><dt>Indexed at</dt><dd>2026-09-05 10:12:43</dd></div></dl><button className="text-link">View in Explorer <ArrowSquareOut size={14} /></button></div><div className="readiness-block"><div className="readiness-title"><HardDrives size={22} className="green-text" /><strong>Schema validated</strong><CheckCircle size={18} weight="fill" className="green-text" /></div><p>All required fields present and types verified.</p><button className="text-link">View schema <ArrowSquareOut size={14} /></button></div><div className="readiness-block"><div className="readiness-title"><ShieldCheck size={22} className="amber-text" /><strong>Graph x402 authority</strong><CheckCircle size={18} weight="fill" className="amber-text" /></div><dl className="compact-list"><div><dt>Available</dt><dd>3.12 USDC</dd></div><div><dt>Max request</dt><dd>0.05 USDC</dd></div><div><dt>Policy</dt><dd>Bounded</dd></div></dl><button className="text-link">View authorization <ArrowSquareOut size={14} /></button></div><div className="readiness-block"><div className="readiness-title"><BracketsCurly size={22} className="violet-text" /><strong>Output schema</strong><CheckCircle size={18} weight="fill" className="green-text" /></div><pre className="schema-preview">protocol          string{"\n"}stickiness_score number{"\n"}unique_wallets   integer{"\n"}total_wallets    integer{"\n"}window_start     date</pre><button className="text-link">View full schema <ArrowSquareOut size={14} /></button></div></aside>;
}

function Builder({ navigate }) {
  const [buildState, setBuildState] = useState("idle");
  const [modal, setModal] = useState(null);
  const startBuild = () => { setBuildState("building"); window.setTimeout(() => setBuildState("complete"), 1500); };
  const buildLabel = buildState === "building" ? "Building…" : buildState === "complete" ? "Build complete" : "Build version";
  return (
    <div className="product-page">
      <ProductHeader active="Build" navigate={navigate} buildStatus={buildState === "complete" ? "Build complete" : "Ready to build"} />
      <div className="builder-layout">
        <aside className="intent-panel"><span className="section-label">Intent</span><p className="intent-copy">{product.intent}</p><button className="text-link" onClick={() => setModal("intent")}><FileText size={15} />Edit</button><div className="agent-summary"><div className="summary-title"><Sparkle size={19} className="violet-text" /><span>Agent summary</span></div><div className="summary-item"><CheckCircle size={18} className="green-text" /><span><strong>Plan is valid</strong><small>DAG is executable and all checks passed.</small></span></div><div className="summary-item"><ListBullets size={18} className="violet-text" /><span><strong>Nodes</strong><small>6 nodes, 5 edges</small></span></div><div className="summary-item"><ShieldCheck size={18} className="cyan-text" /><span><strong>Deterministic</strong><small>Pinned sources, fixed window, stable ordering.</small></span></div><div className="summary-item"><CurrencyDollar size={18} className="violet-text" /><span><strong>Estimated cost</strong><small>≤ 0.05 USDC per request (bounded)</small></span></div></div></aside>
        <main className="dag-canvas" aria-label="Generated data workflow"><div className="canvas-meta"><Status tone="violet">Agent-generated draft</Status><span>Allowlisted operations only</span></div><div className="dag-flow">{nodes.map((node, index) => { const NodeIcon = node.icon; return <div className="dag-unit" key={node.title}><button className={`dag-node dag-${node.accent}`} onClick={() => setModal(node.title)}><NodeIcon size={30} weight="regular" /><strong>{node.title}</strong><small>{node.type}</small></button><div className="node-detail"><span>ID&nbsp; n{index + 1}_{node.type.toLowerCase().slice(0, 3)}</span>{node.detail.map((line) => <span key={line}>{line}</span>)}</div>{index < nodes.length - 1 && <ArrowRight className="dag-arrow" size={28} weight="thin" aria-hidden="true" />}</div>; })}</div></main>
        <BuildReadiness />
      </div>
      <div className="execution-panel"><span className="section-label">Execution trace (preview)</span><div className="trace-row">{[["Planning", "Complete", "Plan generated and validated"], ["Source", buildState === "idle" ? "Pending" : "Complete", buildState === "idle" ? "Awaiting build to fetch data" : "Snapshot pinned"], ["Transform", buildState === "complete" ? "Complete" : "Pending", buildState === "complete" ? "4 transforms complete" : "Awaiting source data"], ["Materialize", buildState === "complete" ? "Complete" : "Pending", buildState === "complete" ? "Endpoint is ready" : "Awaiting transform"]].map(([name, state, note], index) => <div className={`trace-step ${state === "Complete" ? "trace-complete" : ""}`} key={name}><span className="step-index">{index + 1}</span><div><strong>{name}</strong><Status tone={state === "Complete" ? "green" : "amber"}>{state}</Status><small>{note}</small></div></div>)}</div><div className="trace-actions"><Button icon={Graph} onClick={() => setModal("dag")}>Structured DAG</Button><div><Button onClick={() => setModal("spec")}>Review spec</Button><Button variant="primary" icon={buildState === "building" ? ArrowsClockwise : ArrowRight} disabled={buildState === "building"} onClick={startBuild}>{buildLabel}</Button></div></div></div>
      {modal === "intent" && <Modal title="Edit product intent" eyebrow="Natural-language input" onClose={() => setModal(null)} footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" icon={Sparkle} onClick={() => setModal(null)}>Regenerate draft</Button></>}><Field label="Intent"><textarea defaultValue={product.intent} rows={6} /></Field><div className="inline-notice"><Sparkle size={18} /><span>The agent will propose a new DAG; changes are never executed automatically.</span></div></Modal>}
      {modal && modal !== "intent" && <Modal title={modal === "spec" ? "Version v1 specification" : modal === "dag" ? "Structured DAG" : modal} eyebrow="Read-only prototype detail" width="640px" onClose={() => setModal(null)} footer={<Button variant="primary" onClick={() => setModal(null)}>Done</Button>}><pre className="code-block">{modal === "dag" ? JSON.stringify({ version: 1, nodes: nodes.map((node, i) => ({ id: `n${i + 1}`, op: node.title })) }, null, 2) : `source: graph://base-dex@v1.4.2\nwindow: 30d\nfilters:\n  - repeat_wallets_only\ngroup_by: protocol\nmaterialize: hosted_api\naccess: x402`}</pre></Modal>}
    </div>
  );
}

function ApiPage({ navigate }) {
  const [response, setResponse] = useState(null);
  const [copied, setCopied] = useState(false);
  const runTest = () => { setResponse("loading"); window.setTimeout(() => setResponse("success"), 800); };
  const copyEndpoint = async () => { await navigator.clipboard?.writeText(product.endpoint); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  return (
    <div className="product-page"><ProductHeader active="API" navigate={navigate} buildStatus="Endpoint ready" /><main className="product-content"><div className="content-heading"><div><span className="eyebrow">Hosted data API</span><h1>Deploy once, query a stable contract</h1><p>The generated endpoint serves materialized results without rerunning the full pipeline.</p></div><Button variant="primary" icon={RocketLaunch}>Deploy v1</Button></div><section className="endpoint-strip"><span className="method">GET</span><code>{product.endpoint}</code><IconButton label="Copy endpoint" onClick={copyEndpoint}>{copied ? <Check size={18} className="green-text" /> : <Copy size={18} />}</IconButton><Status>Healthy</Status></section><div className="api-grid">
      <section className="panel api-contract"><div className="panel-title"><FileCode size={19} /><h3>API contract</h3><Status tone="violet">v1</Status></div><div className="contract-row"><span>Authentication</span><strong>x402 payment</strong></div><div className="contract-row"><span>Response</span><strong>application/json</strong></div><div className="contract-row"><span>Cache</span><strong>5 minutes</strong></div><div className="contract-row"><span>Rate limit</span><strong>120 req / min</strong></div><div className="code-tabs"><button className="active">cURL</button><button>JavaScript</button><button>Python</button></div><pre className="code-block">curl --request GET \\{"\n"}  --url {product.endpoint} \\{"\n"}  --header 'accept: application/json'</pre></section>
      <section className="panel request-tester"><div className="panel-title"><TerminalWindow size={19} /><h3>Request tester</h3><span className="mock-chip">Mock response</span></div><Field label="Query parameter: limit"><input defaultValue="10" /></Field><Button variant="primary" icon={Play} onClick={runTest} disabled={response === "loading"}>{response === "loading" ? "Sending…" : "Send test request"}</Button><div className="response-box">{!response && <div className="empty-response"><TerminalWindow size={26} /><span>Run a request to inspect the response.</span></div>}{response === "loading" && <div className="loading-lines"><span /><span /><span /></div>}{response === "success" && <><div className="response-head"><Status>200 OK</Status><span>142 ms · cached</span></div><pre>{JSON.stringify({ data: [{ protocol: "Aerodrome", stickiness_score: 0.684, unique_wallets: 4821 }, { protocol: "Uniswap", stickiness_score: 0.591, unique_wallets: 3194 }] }, null, 2)}</pre></>}</div></section>
      </div><section className="panel deployment-table"><div className="panel-toolbar"><div><h2>Deployment evidence</h2><p>Runtime and artifact provenance for the current endpoint.</p></div><Button icon={ArrowSquareOut}>Open logs</Button></div><div className="evidence-grid"><div><span>Artifact digest</span><code>sha256:7f2c…a9d1</code></div><div><span>Region</span><strong>us-east</strong></div><div><span>Last deployed</span><strong>Sep 5, 10:24 UTC</strong></div><div><span>Source version</span><strong>v1 · immutable</strong></div></div></section></main></div>
  );
}

function MonetizePage({ navigate }) {
  const [published, setPublished] = useState(false);
  const [price, setPrice] = useState("0.20");
  return (
    <div className="product-page"><ProductHeader active="Monetize" navigate={navigate} buildStatus={published ? "Published on x402" : "Ready to publish"} /><main className="product-content"><div className="content-heading"><div><span className="eyebrow">Hedera x402</span><h1>Publish a paid machine-readable endpoint</h1><p>Set the buyer price, revenue destination, and Sprue service fee before publication.</p></div><Status tone={published ? "green" : "amber"}>{published ? "Live · Prototype" : "Draft"}</Status></div><div className="monetize-grid"><section className="panel publish-steps"><div className="publish-step complete"><span>1</span><div><strong>Endpoint selected</strong><small>{product.endpoint}</small></div><CheckCircle size={19} weight="fill" /></div><div className="publish-step active"><span>2</span><div><strong>Price & fee split</strong><small>Set the terms buyers will see in the 402 response.</small></div></div><div className="pricing-editor"><div className="field-grid"><Field label="Buyer price"><div className="input-suffix"><input value={price} onChange={(event) => setPrice(event.target.value)} /><span>HBAR</span></div></Field><Field label="Sprue fee"><div className="input-suffix"><input defaultValue="5" /><span>%</span></div></Field></div><div className="split-bar"><span style={{ width: "95%" }} /><i /></div><div className="split-legend"><span><i className="creator-color" />Creator receives 95%</span><span><i className="sprue-color" />Sprue receives 5%</span></div></div><div className="publish-step"><span>3</span><div><strong>Revenue destination</strong><small>Hedera account 0.0.7392014</small></div><Status>Verified</Status></div><div className="publish-step"><span>4</span><div><strong>Publish with Blocky402</strong><small>Create the x402 listing and payment requirements.</small></div></div><Button variant="primary" icon={RocketLaunch} onClick={() => setPublished(true)} disabled={published}>{published ? "Published (mock)" : "Publish x402 endpoint"}</Button><div className="inline-notice"><WarningCircle size={18} /><span>This prototype simulates publication. It does not create an on-chain listing or transfer HBAR.</span></div></section>
      <aside className="panel settlement-preview"><span className="section-label">Settlement preview</span><div className="settlement-amount"><strong>{price || "0.00"}</strong><span>HBAR / request</span></div><div className="settlement-flow"><div><UserCircle size={20} /><span>Buyer</span></div><ArrowRight size={20} /><div><ShieldCheck size={20} /><span>Blocky402</span></div><ArrowRight size={20} /><div><Wallet size={20} /><span>Creator</span></div></div><dl className="detail-list"><div><dt>Creator receives</dt><dd>{((Number(price) || 0) * 0.95).toFixed(3)} HBAR</dd></div><div><dt>Sprue service fee</dt><dd>{((Number(price) || 0) * 0.05).toFixed(3)} HBAR</dd></div><div><dt>Network</dt><dd>Hedera testnet</dd></div><div><dt>Asset</dt><dd>HBAR</dd></div></dl><div className="evidence-callout"><ShieldCheck size={19} /><div><strong>Evidence retained</strong><span>Payment requirement, transaction ID, response hash, and revenue split.</span></div></div>{published && <Button icon={Eye} onClick={() => navigate(`/p/${productSlug}`)}>Open public page</Button>}</aside></div></main></div>
  );
}

function EntryPage({ navigate }) {
  return <main className="entry-page"><header className="entry-nav"><button className="brand" onClick={() => navigate("/")}>Sprue</button><div><button className="text-link" onClick={() => navigate(`/p/${productSlug}`)}>View consumer demo</button><Button onClick={() => navigate("/app")}>Open prototype</Button></div></header><section className="entry-hero"><div className="entry-copy"><Status tone="violet">ETHGlobal prototype</Status><h1>From a data question to a paid API.</h1><p>Sprue turns natural language into a reviewable data DAG, sources verified data from The Graph, and publishes hosted APIs with optional Hedera x402 payments.</p><div className="entry-actions"><Button variant="primary" icon={ArrowRight} onClick={() => navigate("/app")}>Enter demo workspace</Button><Button icon={Eye} onClick={() => navigate(`/p/${productSlug}`)}>Try the paid API flow</Button></div><span className="entry-disclaimer">Interactive prototype · No real wallet, payment, or data fetch</span></div><div className="entry-proof"><span className="section-label">One traceable chain</span>{[[Sparkle, "Intent", "Agent proposes a bounded plan"], [Graph, "DAG", "Every transform stays inspectable"], [Database, "The Graph", "Source and spend evidence are pinned"], [TerminalWindow, "Hosted API", "A stable response contract"], [Coins, "Hedera x402", "Payment and revenue split recorded"]].map(([Icon, title, description], index) => <div className="proof-step" key={title}><span>{index + 1}</span><Icon size={22} /><div><strong>{title}</strong><small>{description}</small></div>{index < 4 && <ArrowRight size={17} />}</div>)}</div></section><footer className="entry-footer"><span>The Graph</span><span>Privy</span><span>Hedera</span><span>Blocky402</span></footer></main>;
}

function PublicProduct({ navigate }) {
  const [stage, setStage] = useState(0);
  const stages = ["Request data", "Read payment terms", "Settle on Hedera", "Receive response"];
  const run = () => { setStage(1); window.setTimeout(() => setStage(2), 700); window.setTimeout(() => setStage(3), 1400); window.setTimeout(() => setStage(4), 2100); };
  return <main className="public-page"><header className="public-nav"><button className="brand" onClick={() => navigate("/")}>Sprue</button><span className="hosted-badge"><CheckCircle size={16} weight="fill" />Hosted data product</span><Button onClick={() => navigate("/app")}>Creator console</Button></header><section className="public-hero"><div><span className="eyebrow">ONCHAIN DATA API · BASE</span><h1>{product.name}</h1><p>30-day DEX retention metrics, filtered to repeat wallets and grouped by protocol.</p><div className="public-meta"><Status>The Graph verified</Status><Status tone="violet">Updated 8 min ago</Status><Status tone="amber">0.20 HBAR / request</Status></div></div><div className="publisher-card"><span>Published by</span><strong>0x71F2…9C84</strong><small>Revenue settles to Hedera account 0.0.7392014</small></div></section><section className="consumer-console"><div className="request-pane"><div className="console-head"><div><TerminalWindow size={19} /><strong>Consumer request</strong></div><span className="mock-chip">Safe simulation</span></div><label className="endpoint-line"><span>GET</span><code>{product.endpoint}</code></label><div className="consumer-actions"><Button variant="primary" icon={Play} onClick={run} disabled={stage > 0 && stage < 4}>{stage > 0 && stage < 4 ? "Running x402 flow…" : stage === 4 ? "Run again" : "Request paid data"}</Button><Button icon={Copy}>Copy cURL</Button></div><div className="flow-timeline">{stages.map((label, index) => <div className={stage > index ? "complete" : stage === index + 1 ? "active" : ""} key={label}><span>{stage > index ? <Check size={14} weight="bold" /> : index + 1}</span><strong>{label}</strong></div>)}</div><div className="inline-notice"><WarningCircle size={18} /><span>No HBAR is transferred. This is a judge-facing simulation of the intended x402 flow.</span></div></div><div className="response-pane"><div className="console-head"><div><BracketsCurly size={19} /><strong>Response</strong></div>{stage === 4 ? <Status>200 OK</Status> : stage > 0 ? <Status tone="amber">Processing</Status> : <span>Awaiting request</span>}</div>{stage === 0 && <div className="empty-response tall"><Code size={34} /><span>Run the request to reveal payment evidence and data.</span></div>}{stage > 0 && stage < 4 && <div className="payment-progress"><ShieldCheck size={34} className="amber-text" /><strong>{stage === 1 ? "HTTP 402 received" : stage === 2 ? "Terms accepted" : "Settlement confirmed"}</strong><span>{stage === 1 ? "Price: 0.20 HBAR · Network: Hedera testnet" : stage === 2 ? "Verifying bounded payment requirement" : "Transaction 0.0.7392014@1788556321.441"}</span></div>}{stage === 4 && <pre className="public-json">{JSON.stringify({ payment: { network: "hedera:testnet", asset: "HBAR", amount: "0.20", transaction_id: "0.0.7392014@1788556321.441" }, data: [{ protocol: "Aerodrome", stickiness_score: 0.684, unique_wallets: 4821, total_wallets: 7048 }, { protocol: "Uniswap", stickiness_score: 0.591, unique_wallets: 3194, total_wallets: 5404 }] }, null, 2)}</pre>}</div></section><section className="public-details"><div><span>Schema</span><strong>5 typed fields</strong></div><div><span>Freshness</span><strong>5 minute cache</strong></div><div><span>Provenance</span><strong>base-dex@v1.4.2</strong></div><div><span>Settlement</span><strong>Hedera x402</strong></div></section></main>;
}

function AppShell({ path, navigate }) {
  let content = <Dashboard navigate={navigate} />;
  if (path === "/app/wallet") content = <WalletPage />;
  if (path.endsWith("/build")) content = <Builder navigate={navigate} />;
  if (path.endsWith("/api")) content = <ApiPage navigate={navigate} />;
  if (path.endsWith("/monetize")) content = <MonetizePage navigate={navigate} />;
  return <div className="app-shell"><Sidebar path={path} navigate={navigate} /><div className="app-main">{content}</div></div>;
}

export function App() {
  const { path, navigate } = useRoute();
  const page = useMemo(() => {
    if (path.startsWith("/p/")) return <PublicProduct navigate={navigate} />;
    if (path.startsWith("/app")) return <AppShell path={path} navigate={navigate} />;
    return <EntryPage navigate={navigate} />;
  }, [path]);
  return <><div className="desktop-gate"><TerminalWindow size={28} /><strong>Open Sprue in a wider browser window</strong><span>This prototype is designed for web browsers at 1024 px or wider.</span></div>{page}</>;
}
