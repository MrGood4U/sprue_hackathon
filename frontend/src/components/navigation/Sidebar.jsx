import {
  ArrowLeft,
  Books,
  CaretDown,
  CheckCircle,
  Coins,
  Database,
  Gear,
  SquaresFour,
  Wallet,
} from "@phosphor-icons/react";
import { IconButton } from "../ui/Button.jsx";

export function Sidebar({ path, navigate }) {
  const isProducts = path === "/app" || path.includes("/products/");

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <button className="brand" onClick={() => navigate("/app")}>Sprue</button>
        <IconButton label="Collapse navigation"><ArrowLeft size={16} /></IconButton>
      </div>

      <nav className="side-nav" aria-label="Primary navigation">
        <button className={isProducts ? "active" : ""} onClick={() => navigate("/app")}>
          <SquaresFour size={20} />
          <span>Products</span>
        </button>
        <button className={path === "/app/wallet" ? "active" : ""} onClick={() => navigate("/app/wallet")}>
          <Wallet size={20} />
          <span>Wallet & Access</span>
        </button>
      </nav>

      <div className="side-section">
        <div className="side-label">Environment</div>
        <button className="environment-button"><span>Demo</span><CaretDown size={15} /></button>
      </div>

      <div className="readiness-list">
        <div className="readiness-item">
          <Database size={19} className="violet-text" />
          <div><span>The Graph</span><small>Ready</small></div>
          <CheckCircle size={18} weight="fill" className="green-text" />
        </div>
        <div className="readiness-item">
          <Coins size={19} />
          <div><span>Hedera</span><small>Ready</small></div>
          <CheckCircle size={18} weight="fill" className="green-text" />
        </div>
      </div>

      <nav className="side-nav side-nav-bottom" aria-label="Secondary navigation">
        <button onClick={() => alert("Documentation is outside this prototype.")}>
          <Books size={20} />
          <span>Docs</span>
        </button>
        <button onClick={() => alert("Settings are not included in this prototype.")}>
          <Gear size={20} />
          <span>Settings</span>
        </button>
      </nav>
      <div className="prototype-stamp">Interactive prototype · Mock data</div>
    </aside>
  );
}
