import { useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  Eye,
  RocketLaunch,
  ShieldCheck,
  UserCircle,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Status } from "../components/ui/Status.jsx";
import { product, productSlug } from "../data/demoProduct.js";

export function MonetizationRevenuePage({ navigate }) {
  const [published, setPublished] = useState(false);
  const [price, setPrice] = useState("0.20");
  const numericPrice = Number(price) || 0;

  return (
    <div className="product-page">
      <ProductHeader
        active="Monetize"
        navigate={navigate}
        buildStatus={published ? "Published on x402" : "Ready to publish"}
      />
      <main className="product-content">
        <div className="content-heading">
          <div>
            <span className="eyebrow">Hedera x402</span>
            <h1>Publish a paid machine-readable endpoint</h1>
            <p>Set the buyer price, revenue destination, and Sprue service fee before publication.</p>
          </div>
          <Status tone={published ? "green" : "amber"}>{published ? "Live · Prototype" : "Draft"}</Status>
        </div>

        <div className="monetize-grid">
          <section className="panel publish-steps">
            <div className="publish-step complete">
              <span>1</span><div><strong>Endpoint selected</strong><small>{product.endpoint}</small></div><CheckCircle size={19} weight="fill" />
            </div>
            <div className="publish-step active">
              <span>2</span><div><strong>Price & fee split</strong><small>Set the terms buyers will see in the 402 response.</small></div>
            </div>
            <div className="pricing-editor">
              <div className="field-grid">
                <Field label="Buyer price">
                  <div className="input-suffix"><input value={price} onChange={(event) => setPrice(event.target.value)} /><span>HBAR</span></div>
                </Field>
                <Field label="Sprue fee">
                  <div className="input-suffix"><input defaultValue="5" /><span>%</span></div>
                </Field>
              </div>
              <div className="split-bar"><span style={{ width: "95%" }} /><i /></div>
              <div className="split-legend">
                <span><i className="creator-color" />Creator receives 95%</span>
                <span><i className="sprue-color" />Sprue receives 5%</span>
              </div>
            </div>
            <div className="publish-step">
              <span>3</span><div><strong>Revenue destination</strong><small>Hedera account 0.0.7392014</small></div><Status>Verified</Status>
            </div>
            <div className="publish-step">
              <span>4</span><div><strong>Publish with Blocky402</strong><small>Create the x402 listing and payment requirements.</small></div>
            </div>
            <Button variant="primary" icon={RocketLaunch} onClick={() => setPublished(true)} disabled={published}>
              {published ? "Published (mock)" : "Publish x402 endpoint"}
            </Button>
            <div className="inline-notice">
              <WarningCircle size={18} />
              <span>This prototype simulates publication. It does not create an on-chain listing or transfer HBAR.</span>
            </div>
          </section>

          <aside className="panel settlement-preview">
            <span className="section-label">Settlement preview</span>
            <div className="settlement-amount"><strong>{price || "0.00"}</strong><span>HBAR / request</span></div>
            <div className="settlement-flow">
              <div><UserCircle size={20} /><span>Buyer</span></div><ArrowRight size={20} />
              <div><ShieldCheck size={20} /><span>Blocky402</span></div><ArrowRight size={20} />
              <div><Wallet size={20} /><span>Creator</span></div>
            </div>
            <dl className="detail-list">
              <div><dt>Creator receives</dt><dd>{(numericPrice * 0.95).toFixed(3)} HBAR</dd></div>
              <div><dt>Sprue service fee</dt><dd>{(numericPrice * 0.05).toFixed(3)} HBAR</dd></div>
              <div><dt>Network</dt><dd>Hedera testnet</dd></div>
              <div><dt>Asset</dt><dd>HBAR</dd></div>
            </dl>
            <div className="evidence-callout">
              <ShieldCheck size={19} />
              <div><strong>Evidence retained</strong><span>Payment requirement, transaction ID, response hash, and revenue split.</span></div>
            </div>
            {published && <Button icon={Eye} onClick={() => navigate(`/p/${productSlug}`)}>Open public page</Button>}
          </aside>
        </div>
      </main>
    </div>
  );
}
