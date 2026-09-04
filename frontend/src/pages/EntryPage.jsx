import {
  ArrowRight,
  Coins,
  Database,
  Eye,
  Graph,
  Sparkle,
  TerminalWindow,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/Button.jsx";
import { Status } from "../components/ui/Status.jsx";
import { productSlug } from "../data/demoProduct.js";

const proofSteps = [
  [Sparkle, "Intent", "Agent proposes a bounded plan"],
  [Graph, "DAG", "Every transform stays inspectable"],
  [Database, "The Graph", "Source and spend evidence are pinned"],
  [TerminalWindow, "Hosted API", "A stable response contract"],
  [Coins, "Hedera x402", "Payment and revenue split recorded"],
];

export function EntryPage({ navigate }) {
  return (
    <main className="entry-page">
      <header className="entry-nav">
        <button className="brand" onClick={() => navigate("/")}>Sprue</button>
        <div>
          <button className="text-link" onClick={() => navigate(`/p/${productSlug}`)}>View consumer demo</button>
          <Button onClick={() => navigate("/app")}>Open prototype</Button>
        </div>
      </header>

      <section className="entry-hero">
        <div className="entry-copy">
          <Status tone="violet">ETHGlobal prototype</Status>
          <h1>From a data question to a paid API.</h1>
          <p>Sprue turns natural language into a reviewable data DAG, sources verified data from The Graph, and publishes hosted APIs with optional Hedera x402 payments.</p>
          <div className="entry-actions">
            <Button variant="primary" icon={ArrowRight} onClick={() => navigate("/app")}>Enter demo workspace</Button>
            <Button icon={Eye} onClick={() => navigate(`/p/${productSlug}`)}>Try the paid API flow</Button>
          </div>
          <span className="entry-disclaimer">Interactive prototype · No real wallet, payment, or data fetch</span>
        </div>

        <div className="entry-proof">
          <span className="section-label">One traceable chain</span>
          {proofSteps.map(([Icon, title, description], index) => (
            <div className="proof-step" key={title}>
              <span>{index + 1}</span>
              <Icon size={22} />
              <div><strong>{title}</strong><small>{description}</small></div>
              {index < proofSteps.length - 1 && <ArrowRight size={17} />}
            </div>
          ))}
        </div>
      </section>

      <footer className="entry-footer">
        <span>The Graph</span><span>Privy</span><span>Hedera</span><span>Blocky402</span>
      </footer>
    </main>
  );
}
