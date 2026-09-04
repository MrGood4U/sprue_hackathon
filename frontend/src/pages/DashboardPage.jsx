import { useState } from "react";
import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Database,
  Graph,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
} from "@phosphor-icons/react";
import { AppHeader } from "../components/layout/AppHeader.jsx";
import { Button, IconButton } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Status } from "../components/ui/Status.jsx";
import { product, productSlug } from "../data/demoProduct.js";

function Metric({ label, value, note, tone }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone ? `${tone}-text` : ""}>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

export function DashboardPage({ navigate }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="page">
      <AppHeader
        title="Data products"
        subtitle="Turn an intent into a traceable, hosted API."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>
            New product
          </Button>
        }
      />

      <div className="metrics-row">
        <Metric label="Active products" value="1" note="1 draft version" />
        <Metric label="Requests · 24h" value="1,284" note="Prototype traffic" />
        <Metric label="Graph spend · 24h" value="$2.84" note="Within policy" tone="amber" />
        <Metric label="x402 revenue · 24h" value="18.42 HBAR" note="Simulated settlement" tone="green" />
      </div>

      <section className="panel product-list-panel">
        <div className="panel-toolbar">
          <div>
            <h2>All products</h2>
            <p>Build state, source authority, and API readiness at a glance.</p>
          </div>
          <div className="toolbar-cluster">
            <label className="search-control">
              <MagnifyingGlass size={17} />
              <input aria-label="Search products" placeholder="Search products" />
            </label>
            <IconButton label="Filter products"><SlidersHorizontal size={18} /></IconButton>
          </div>
        </div>

        <div className="table" role="table" aria-label="Data products">
          <div className="table-row table-head" role="row">
            <span>Product</span><span>Source</span><span>Version</span><span>API</span><span>Last run</span>
            <span aria-label="Actions" />
          </div>
          <button className="table-row product-row" onClick={() => navigate(`/app/products/${productSlug}/build`)}>
            <span className="product-cell">
              <span className="product-icon"><Graph size={20} /></span>
              <span><strong>{product.name}</strong><small>DEX retention by protocol</small></span>
            </span>
            <span><Status>The Graph</Status><small>Base mainnet</small></span>
            <span><strong>v1</strong><small>Proposed</small></span>
            <span><Status tone="violet">Ready</Status><small>Hosted endpoint</small></span>
            <span><strong>8 min ago</strong><small>1,284 rows</small></span>
            <span><ArrowRight size={18} /></span>
          </button>
          <div className="table-empty-row"><Plus size={16} /> Create another product from a natural-language intent</div>
        </div>
      </section>

      <section className="dashboard-lower">
        <div className="panel compact-panel">
          <div className="panel-title"><CalendarBlank size={19} /><h3>Recent activity</h3></div>
          <ul className="activity-list">
            <li><CheckCircle size={17} className="green-text" /><span><strong>Schema validated</strong><small>Base DEX Stickiness · 8 min ago</small></span></li>
            <li><Database size={17} className="violet-text" /><span><strong>Source snapshot pinned</strong><small>The Graph · 12 min ago</small></span></li>
            <li><ShieldCheck size={17} className="amber-text" /><span><strong>Spend policy authorized</strong><small>Maximum $0.05 per request</small></span></li>
          </ul>
        </div>
        <div className="panel compact-panel">
          <div className="panel-title"><ShieldCheck size={19} /><h3>Sponsor proof</h3></div>
          <div className="proof-grid">
            <div><span>The Graph</span><Status>Source verified</Status></div>
            <div><span>Privy</span><Status>Wallet ready</Status></div>
            <div><span>Hedera</span><Status>x402 ready</Status></div>
          </div>
        </div>
      </section>

      {showCreate && (
        <Modal
          title="Describe a data product"
          eyebrow="New product · Prototype"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button
                variant="primary"
                icon={Sparkle}
                onClick={() => {
                  setShowCreate(false);
                  navigate(`/app/products/${productSlug}/build`);
                }}
              >
                Generate plan
              </Button>
            </>
          }
        >
          <Field label="Intent" hint="Sprue will propose an allowlisted DAG before any data is fetched.">
            <textarea defaultValue={product.intent} rows={5} />
          </Field>
          <div className="inline-notice">
            <Sparkle size={18} />
            <span>This interaction is simulated. No agent or paid data call runs in the prototype.</span>
          </div>
        </Modal>
      )}
    </div>
  );
}
