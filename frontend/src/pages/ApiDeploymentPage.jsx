import { useState } from "react";
import {
  ArrowSquareOut,
  Check,
  Copy,
  FileCode,
  Play,
  RocketLaunch,
  TerminalWindow,
} from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button, IconButton } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Status } from "../components/ui/Status.jsx";
import { product } from "../data/demoProduct.js";

const mockResponse = {
  data: [
    { protocol: "Aerodrome", stickiness_score: 0.684, unique_wallets: 4821 },
    { protocol: "Uniswap", stickiness_score: 0.591, unique_wallets: 3194 },
  ],
};

export function ApiDeploymentPage({ navigate }) {
  const [response, setResponse] = useState(null);
  const [copied, setCopied] = useState(false);

  const runTest = () => {
    setResponse("loading");
    window.setTimeout(() => setResponse("success"), 800);
  };

  const copyEndpoint = async () => {
    await navigator.clipboard?.writeText(product.endpoint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="product-page">
      <ProductHeader active="API" navigate={navigate} buildStatus="Endpoint ready" />
      <main className="product-content">
        <div className="content-heading">
          <div>
            <span className="eyebrow">Hosted data API</span>
            <h1>Deploy once, query a stable contract</h1>
            <p>The generated endpoint serves materialized results without rerunning the full pipeline.</p>
          </div>
          <Button variant="primary" icon={RocketLaunch}>Deploy v1</Button>
        </div>

        <section className="endpoint-strip">
          <span className="method">GET</span>
          <code>{product.endpoint}</code>
          <IconButton label="Copy endpoint" onClick={copyEndpoint}>
            {copied ? <Check size={18} className="green-text" /> : <Copy size={18} />}
          </IconButton>
          <Status>Healthy</Status>
        </section>

        <div className="api-grid">
          <section className="panel api-contract">
            <div className="panel-title"><FileCode size={19} /><h3>API contract</h3><Status tone="violet">v1</Status></div>
            <div className="contract-row"><span>Authentication</span><strong>x402 payment</strong></div>
            <div className="contract-row"><span>Response</span><strong>application/json</strong></div>
            <div className="contract-row"><span>Cache</span><strong>5 minutes</strong></div>
            <div className="contract-row"><span>Rate limit</span><strong>120 req / min</strong></div>
            <div className="code-tabs"><button className="active">cURL</button><button>JavaScript</button><button>Python</button></div>
            <pre className="code-block">curl --request GET \{"\n"}  --url {product.endpoint} \{"\n"}  --header 'accept: application/json'</pre>
          </section>

          <section className="panel request-tester">
            <div className="panel-title"><TerminalWindow size={19} /><h3>Request tester</h3><span className="mock-chip">Mock response</span></div>
            <Field label="Query parameter: limit"><input defaultValue="10" /></Field>
            <Button variant="primary" icon={Play} onClick={runTest} disabled={response === "loading"}>
              {response === "loading" ? "Sending…" : "Send test request"}
            </Button>
            <div className="response-box">
              {!response && <div className="empty-response"><TerminalWindow size={26} /><span>Run a request to inspect the response.</span></div>}
              {response === "loading" && <div className="loading-lines"><span /><span /><span /></div>}
              {response === "success" && (
                <>
                  <div className="response-head"><Status>200 OK</Status><span>142 ms · cached</span></div>
                  <pre>{JSON.stringify(mockResponse, null, 2)}</pre>
                </>
              )}
            </div>
          </section>
        </div>

        <section className="panel deployment-table">
          <div className="panel-toolbar">
            <div><h2>Deployment evidence</h2><p>Runtime and artifact provenance for the current endpoint.</p></div>
            <Button icon={ArrowSquareOut}>Open logs</Button>
          </div>
          <div className="evidence-grid">
            <div><span>Artifact digest</span><code>sha256:7f2c…a9d1</code></div>
            <div><span>Region</span><strong>us-east</strong></div>
            <div><span>Last deployed</span><strong>Sep 5, 10:24 UTC</strong></div>
            <div><span>Source version</span><strong>v1 · immutable</strong></div>
          </div>
        </section>
      </main>
    </div>
  );
}
