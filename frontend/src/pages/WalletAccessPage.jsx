import { useState } from "react";
import {
  ArrowSquareOut,
  Copy,
  CreditCard,
  CurrencyDollar,
  DotsThree,
  Key,
  LockKey,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { AppHeader } from "../components/layout/AppHeader.jsx";
import { Button, IconButton } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Status } from "../components/ui/Status.jsx";

export function WalletAccessPage() {
  const [modal, setModal] = useState(null);
  const [mode, setMode] = useState("x402");

  return (
    <div className="page">
      <AppHeader
        title="Wallet & Access"
        subtitle="Separate identity, credentials, and bounded machine spending."
        actions={<Button icon={Plus} onClick={() => setModal("credential")}>Add credential</Button>}
      />

      <div className="wallet-grid">
        <section className="panel wallet-hero">
          <div className="panel-kicker"><Wallet size={18} /> PRIVY EMBEDDED WALLET</div>
          <div className="wallet-address-row">
            <div><span>Creator wallet</span><strong>0x71F2…9C84</strong></div>
            <IconButton label="Copy wallet address"><Copy size={18} /></IconButton>
          </div>
          <div className="wallet-balance"><span>Available Graph spend</span><strong>3.12 USDC</strong></div>
          <div className="wallet-actions">
            <Button variant="primary" icon={CreditCard} onClick={() => setModal("fund")}>Fund wallet</Button>
            <Button icon={ArrowSquareOut}>View wallet</Button>
          </div>
          <div className="security-line">
            <LockKey size={17} />
            <span>Sprue submits bounded delegated actions. The user remains the wallet owner.</span>
          </div>
        </section>

        <section className="panel policy-card">
          <div className="panel-title"><ShieldCheck size={19} /><h3>Graph spend authority</h3><Status>Active</Status></div>
          <dl className="detail-list">
            <div><dt>Per request</dt><dd>0.05 USDC</dd></div>
            <div><dt>Daily ceiling</dt><dd>5.00 USDC</dd></div>
            <div><dt>Allowed payee</dt><dd>The Graph x402</dd></div>
            <div><dt>Expires</dt><dd>Sep 12, 2026</dd></div>
          </dl>
          <Button icon={SlidersHorizontal} onClick={() => setModal("policy")}>Edit policy</Button>
        </section>
      </div>

      <section className="panel access-panel">
        <div className="panel-toolbar">
          <div><h2>Graph access</h2><p>Choose an existing subscription key or pay per request through x402.</p></div>
          <Status>Configured</Status>
        </div>
        <div className="segmented" role="group" aria-label="Graph access mode">
          <button className={mode === "api" ? "active" : ""} onClick={() => setMode("api")}>
            <Key size={18} /><span><strong>API key</strong><small>Use an existing Graph subscription</small></span>
          </button>
          <button className={mode === "x402" ? "active" : ""} onClick={() => setMode("x402")}>
            <CurrencyDollar size={18} /><span><strong>x402 per request</strong><small>Pay from the bounded Privy wallet</small></span>
          </button>
        </div>
        <div className="access-detail">
          {mode === "x402" ? (
            <><Status tone="amber">Cost protected</Status><p>Sprue may pay The Graph up to <strong>0.05 USDC</strong> for an allowed request. Every authorization and settlement is retained as evidence.</p></>
          ) : (
            <><Status tone="violet">Credential vault</Status><p>Requests use the encrypted credential <strong>graph-production-01</strong>. The key value is never returned to the browser.</p></>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-toolbar"><div><h2>Credentials</h2><p>Encrypted references available to this workspace.</p></div></div>
        <div className="credential-row">
          <span className="credential-icon"><Key size={19} /></span>
          <span><strong>graph-production-01</strong><small>The Graph · API key · Added Sep 5</small></span>
          <Status tone="violet">Vaulted</Status>
          <IconButton label="Credential actions"><DotsThree size={21} /></IconButton>
        </div>
      </section>

      {modal === "credential" && (
        <Modal
          title="Add Graph credential"
          eyebrow="Encrypted reference"
          onClose={() => setModal(null)}
          footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" onClick={() => setModal(null)}>Save reference</Button></>}
        >
          <Field label="Credential name"><input defaultValue="graph-production-02" /></Field>
          <Field label="API key" hint="Prototype only. Do not paste a real secret."><input type="password" placeholder="Never enter real credentials" /></Field>
        </Modal>
      )}
      {modal === "fund" && (
        <Modal
          title="Fund creator wallet"
          eyebrow="Prototype simulation"
          onClose={() => setModal(null)}
          footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" onClick={() => setModal(null)}>Simulate deposit</Button></>}
        >
          <div className="big-number">10.00 <span>USDC</span></div>
          <div className="inline-notice"><WarningCircle size={18} /><span>No deposit or transaction will occur in this prototype.</span></div>
        </Modal>
      )}
      {modal === "policy" && (
        <Modal
          title="Edit Graph spend policy"
          eyebrow="Bounded delegation"
          onClose={() => setModal(null)}
          footer={<><Button onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" onClick={() => setModal(null)}>Save mock policy</Button></>}
        >
          <div className="field-grid">
            <Field label="Per request"><input defaultValue="0.05 USDC" /></Field>
            <Field label="Daily ceiling"><input defaultValue="5.00 USDC" /></Field>
          </div>
          <Field label="Allowed payee"><input defaultValue="The Graph x402" /></Field>
        </Modal>
      )}
    </div>
  );
}
