import { useState } from "react";
import {
  BracketsCurly,
  Check,
  CheckCircle,
  Code,
  Copy,
  Play,
  ShieldCheck,
  TerminalWindow,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/Button.jsx";
import { Status } from "../components/ui/Status.jsx";
import { product } from "../data/demoProduct.js";

const stages = ["Request data", "Read payment terms", "Settle on Hedera", "Receive response"];
const paidResponse = {
  payment: {
    network: "hedera:testnet",
    asset: "HBAR",
    amount: "0.20",
    transaction_id: "0.0.7392014@1788556321.441",
  },
  data: [
    { protocol: "Aerodrome", stickiness_score: 0.684, unique_wallets: 4821, total_wallets: 7048 },
    { protocol: "Uniswap", stickiness_score: 0.591, unique_wallets: 3194, total_wallets: 5404 },
  ],
};

function progressMessage(stage) {
  if (stage === 1) return ["HTTP 402 received", "Price: 0.20 HBAR · Network: Hedera testnet"];
  if (stage === 2) return ["Terms accepted", "Verifying bounded payment requirement"];
  return ["Settlement confirmed", "Transaction 0.0.7392014@1788556321.441"];
}

export function PublicProductPage({ navigate }) {
  const [stage, setStage] = useState(0);

  const run = () => {
    setStage(1);
    window.setTimeout(() => setStage(2), 700);
    window.setTimeout(() => setStage(3), 1400);
    window.setTimeout(() => setStage(4), 2100);
  };

  const [progressTitle, progressDetail] = progressMessage(stage);

  return (
    <main className="public-page">
      <header className="public-nav">
        <button className="brand" onClick={() => navigate("/")}>Sprue</button>
        <span className="hosted-badge"><CheckCircle size={16} weight="fill" />Hosted data product</span>
        <Button onClick={() => navigate("/app")}>Creator console</Button>
      </header>

      <section className="public-hero">
        <div>
          <span className="eyebrow">ONCHAIN DATA API · BASE</span>
          <h1>{product.name}</h1>
          <p>30-day DEX retention metrics, filtered to repeat wallets and grouped by protocol.</p>
          <div className="public-meta">
            <Status>The Graph verified</Status>
            <Status tone="violet">Updated 8 min ago</Status>
            <Status tone="amber">0.20 HBAR / request</Status>
          </div>
        </div>
        <div className="publisher-card">
          <span>Published by</span>
          <strong>0x71F2…9C84</strong>
          <small>Revenue settles to Hedera account 0.0.7392014</small>
        </div>
      </section>

      <section className="consumer-console">
        <div className="request-pane">
          <div className="console-head">
            <div><TerminalWindow size={19} /><strong>Consumer request</strong></div>
            <span className="mock-chip">Safe simulation</span>
          </div>
          <label className="endpoint-line"><span>GET</span><code>{product.endpoint}</code></label>
          <div className="consumer-actions">
            <Button variant="primary" icon={Play} onClick={run} disabled={stage > 0 && stage < 4}>
              {stage > 0 && stage < 4 ? "Running x402 flow…" : stage === 4 ? "Run again" : "Request paid data"}
            </Button>
            <Button icon={Copy}>Copy cURL</Button>
          </div>
          <div className="flow-timeline">
            {stages.map((label, index) => (
              <div className={stage > index ? "complete" : stage === index + 1 ? "active" : ""} key={label}>
                <span>{stage > index ? <Check size={14} weight="bold" /> : index + 1}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
          <div className="inline-notice">
            <WarningCircle size={18} />
            <span>No HBAR is transferred. This is a judge-facing simulation of the intended x402 flow.</span>
          </div>
        </div>

        <div className="response-pane">
          <div className="console-head">
            <div><BracketsCurly size={19} /><strong>Response</strong></div>
            {stage === 4 ? <Status>200 OK</Status> : stage > 0 ? <Status tone="amber">Processing</Status> : <span>Awaiting request</span>}
          </div>
          {stage === 0 && (
            <div className="empty-response tall"><Code size={34} /><span>Run the request to reveal payment evidence and data.</span></div>
          )}
          {stage > 0 && stage < 4 && (
            <div className="payment-progress">
              <ShieldCheck size={34} className="amber-text" />
              <strong>{progressTitle}</strong>
              <span>{progressDetail}</span>
            </div>
          )}
          {stage === 4 && <pre className="public-json">{JSON.stringify(paidResponse, null, 2)}</pre>}
        </div>
      </section>

      <section className="public-details">
        <div><span>Schema</span><strong>5 typed fields</strong></div>
        <div><span>Freshness</span><strong>5 minute cache</strong></div>
        <div><span>Provenance</span><strong>base-dex@v1.4.2</strong></div>
        <div><span>Settlement</span><strong>Hedera x402</strong></div>
      </section>
    </main>
  );
}
