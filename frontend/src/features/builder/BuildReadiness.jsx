import {
  ArrowSquareOut,
  BracketsCurly,
  CheckCircle,
  Database,
  HardDrives,
  ShieldCheck,
} from "@phosphor-icons/react";

export function BuildReadiness() {
  return (
    <aside className="readiness-panel">
      <span className="section-label">Build readiness</span>

      <div className="readiness-block">
        <div className="readiness-title">
          <Database size={22} className="violet-text" />
          <strong>Source snapshot</strong>
          <CheckCircle size={18} weight="fill" className="green-text" />
        </div>
        <dl className="mono-list">
          <div><dt>Provider</dt><dd>The Graph</dd></div>
          <div><dt>Subgraph</dt><dd>base-dex@v1.4.2</dd></div>
          <div><dt>Network</dt><dd>Base Mainnet</dd></div>
          <div><dt>Indexed at</dt><dd>2026-09-05 10:12:43</dd></div>
        </dl>
        <button className="text-link">View in Explorer <ArrowSquareOut size={14} /></button>
      </div>

      <div className="readiness-block">
        <div className="readiness-title">
          <HardDrives size={22} className="green-text" />
          <strong>Schema validated</strong>
          <CheckCircle size={18} weight="fill" className="green-text" />
        </div>
        <p>All required fields present and types verified.</p>
        <button className="text-link">View schema <ArrowSquareOut size={14} /></button>
      </div>

      <div className="readiness-block">
        <div className="readiness-title">
          <ShieldCheck size={22} className="amber-text" />
          <strong>Graph x402 authority</strong>
          <CheckCircle size={18} weight="fill" className="amber-text" />
        </div>
        <dl className="compact-list">
          <div><dt>Available</dt><dd>3.12 USDC</dd></div>
          <div><dt>Max request</dt><dd>0.05 USDC</dd></div>
          <div><dt>Policy</dt><dd>Bounded</dd></div>
        </dl>
        <button className="text-link">View authorization <ArrowSquareOut size={14} /></button>
      </div>

      <div className="readiness-block">
        <div className="readiness-title">
          <BracketsCurly size={22} className="violet-text" />
          <strong>Output schema</strong>
          <CheckCircle size={18} weight="fill" className="green-text" />
        </div>
        <pre className="schema-preview">{`protocol          string
stickiness_score number
unique_wallets   integer
total_wallets    integer
window_start     date`}</pre>
        <button className="text-link">View full schema <ArrowSquareOut size={14} /></button>
      </div>
    </aside>
  );
}
