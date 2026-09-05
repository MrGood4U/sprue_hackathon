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
import { product, productSlug } from "../services/demo/fixtures/product.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

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
  const { locale, t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="page">
      <AppHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>
            {t("dashboard.newProduct")}
          </Button>
        }
      />

      <div className="metrics-row">
        <Metric label={t("dashboard.metric.activeProducts")} value="1" note={t("dashboard.metric.activeProductsNote")} />
        <Metric label={t("dashboard.metric.requests")} value="1,284" note={t("dashboard.metric.requestsNote")} />
        <Metric label={t("dashboard.metric.graphSpend")} value="$2.84" note={t("dashboard.metric.graphSpendNote")} tone="amber" />
        <Metric label={t("dashboard.metric.revenue")} value="18.42 HBAR" note={t("dashboard.metric.revenueNote")} tone="green" />
      </div>

      <section className="panel product-list-panel">
        <div className="panel-toolbar">
          <div>
            <h2>{t("dashboard.allProducts")}</h2>
            <p>{t("dashboard.allProductsDetail")}</p>
          </div>
          <div className="toolbar-cluster">
            <label className="search-control">
              <MagnifyingGlass size={17} />
              <input aria-label={t("dashboard.searchProducts")} placeholder={t("dashboard.searchProducts")} />
            </label>
            <IconButton label={t("dashboard.filterProducts")}><SlidersHorizontal size={18} /></IconButton>
          </div>
        </div>

        <div className="table" role="table" aria-label={t("dashboard.tableLabel")}>
          <div className="table-row table-head" role="row">
            <span>{t("dashboard.column.product")}</span><span>{t("dashboard.column.source")}</span><span>{t("dashboard.column.version")}</span><span>API</span><span>{t("dashboard.column.lastRun")}</span>
            <span aria-label={t("dashboard.column.actions")} />
          </div>
          <button className="table-row product-row" onClick={() => navigate(`/app/products/${productSlug}/build`)}>
            <span className="product-cell">
              <span className="product-icon"><Graph size={20} /></span>
              <span><strong>{product.name}</strong><small>{t("product.shortDescription")}</small></span>
            </span>
            <span><Status>The Graph</Status><small>{t("dashboard.baseMainnet")}</small></span>
            <span><strong>v1</strong><small>{t("dashboard.proposed")}</small></span>
            <span><Status tone="violet">{t("common.ready")}</Status><small>{t("dashboard.hostedEndpoint")}</small></span>
            <span><strong>{t("dashboard.minutesAgo")}</strong><small>{t("dashboard.rows")}</small></span>
            <span><ArrowRight size={18} /></span>
          </button>
          <div className="table-empty-row"><Plus size={16} /> {t("dashboard.createAnother")}</div>
        </div>
      </section>

      <section className="dashboard-lower">
        <div className="panel compact-panel">
          <div className="panel-title"><CalendarBlank size={19} /><h3>{t("dashboard.recentActivity")}</h3></div>
          <ul className="activity-list">
            <li><CheckCircle size={17} className="green-text" /><span><strong>{t("dashboard.schemaValidated")}</strong><small>{t("dashboard.schemaActivity")}</small></span></li>
            <li><Database size={17} className="violet-text" /><span><strong>{t("dashboard.snapshotPinned")}</strong><small>{t("dashboard.snapshotActivity")}</small></span></li>
            <li><ShieldCheck size={17} className="amber-text" /><span><strong>{t("dashboard.policyAuthorized")}</strong><small>{t("dashboard.policyActivity")}</small></span></li>
          </ul>
        </div>
        <div className="panel compact-panel">
          <div className="panel-title"><ShieldCheck size={19} /><h3>{t("dashboard.sponsorProof")}</h3></div>
          <div className="proof-grid">
            <div><span>The Graph</span><Status>{t("dashboard.sourceVerified")}</Status></div>
            <div><span>Privy</span><Status>{t("dashboard.walletReady")}</Status></div>
            <div><span>Hedera</span><Status>{t("dashboard.x402Ready")}</Status></div>
          </div>
        </div>
      </section>

      {showCreate && (
        <Modal
          title={t("dashboard.createTitle")}
          eyebrow={t("dashboard.createEyebrow")}
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button onClick={() => setShowCreate(false)}>{t("common.cancel")}</Button>
              <Button
                variant="primary"
                icon={Sparkle}
                onClick={() => {
                  setShowCreate(false);
                  navigate(`/app/products/${productSlug}/build`);
                }}
              >
                {t("dashboard.generatePlan")}
              </Button>
            </>
          }
        >
          <Field label={t("dashboard.intent")} hint={t("dashboard.intentHint")}>
            <textarea key={locale} defaultValue={t(product.intentKey)} rows={5} />
          </Field>
          <div className="inline-notice">
            <Sparkle size={18} />
            <span>{t("dashboard.simulationNotice")}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}
