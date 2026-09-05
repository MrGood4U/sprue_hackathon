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
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useDemoRuntime } from "../features/runtime/DemoRuntimeProvider.jsx";

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
  const { state } = useDemoRuntime();
  const [showCreate, setShowCreate] = useState(false);
  const { dashboard, product } = state;
  const [demoProduct] = dashboard.products;

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
        <Metric label={t("dashboard.metric.activeProducts")} value={dashboard.metrics.activeProducts.value} note={dashboard.metrics.activeProducts.note} />
        <Metric label={t("dashboard.metric.requests")} value={dashboard.metrics.requests.value} note={dashboard.metrics.requests.note} />
        <Metric label={t("dashboard.metric.graphSpend")} value={dashboard.metrics.graphSpend.value} note={dashboard.metrics.graphSpend.note} tone="amber" />
        <Metric label={t("dashboard.metric.revenue")} value={dashboard.metrics.revenue.value} note={dashboard.metrics.revenue.note} tone="green" />
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
          <button className="table-row product-row" onClick={() => navigate(`/app/products/${demoProduct.slug}/agent`)}>
            <span className="product-cell">
              <span className="product-icon"><Graph size={20} /></span>
              <span><strong>{demoProduct.name}</strong><small>{demoProduct.description}</small></span>
            </span>
            <span><Status>{dashboard.sponsorProof[0].name}</Status><small>{demoProduct.sourceLabel}</small></span>
            <span><strong>{demoProduct.version}</strong><small>{t("dashboard.proposed")}</small></span>
            <span><Status tone="violet">{t("common.ready")}</Status><small>{demoProduct.apiStatus}</small></span>
            <span><strong>{demoProduct.lastRun}</strong><small>{demoProduct.rows} rows</small></span>
            <span><ArrowRight size={18} /></span>
          </button>
          <div className="table-empty-row"><Plus size={16} /> {t("dashboard.createAnother")}</div>
        </div>
      </section>

      <section className="dashboard-lower">
        <div className="panel compact-panel">
          <div className="panel-title"><CalendarBlank size={19} /><h3>{t("dashboard.recentActivity")}</h3></div>
          <ul className="activity-list">
            {dashboard.activities.map((activity) => {
              const Icon = activity.kind === "schema" ? CheckCircle : activity.kind === "snapshot" ? Database : ShieldCheck;
              const iconClass = activity.kind === "schema" ? "green-text" : activity.kind === "snapshot" ? "violet-text" : "amber-text";
              return <li key={activity.kind}><Icon size={17} className={iconClass} /><span><strong>{activity.title}</strong><small>{activity.detail}</small></span></li>;
            })}
          </ul>
        </div>
        <div className="panel compact-panel">
          <div className="panel-title"><ShieldCheck size={19} /><h3>{t("dashboard.sponsorProof")}</h3></div>
          <div className="proof-grid">
            {dashboard.sponsorProof.map((proof) => <div key={proof.name}><span>{proof.name}</span><Status>{proof.status}</Status></div>)}
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
                  navigate(`/app/products/${product.slug}/agent`);
                }}
              >
                {t("dashboard.generatePlan")}
              </Button>
            </>
          }
        >
          <Field label={t("dashboard.intent")} hint={t("dashboard.intentHint")}>
            <textarea key={locale} defaultValue={product.intent} rows={5} />
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
