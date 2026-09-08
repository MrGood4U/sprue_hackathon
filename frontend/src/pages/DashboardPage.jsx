import { useMemo, useState } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  CircleNotch,
  Graph,
  MagnifyingGlass,
  Plus,
  SlidersHorizontal,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { AppHeader } from "../components/layout/AppHeader.jsx";
import { EditableProductName } from "../components/product/EditableProductName.jsx";
import { Button, IconButton } from "../components/ui/Button.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Status } from "../components/ui/Status.jsx";
import { useProductDashboard } from "../features/products/useProductDashboard.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

function Metric({ label, value, note, tone, loading = false }) {
  return (
    <div className={`metric${loading ? " is-loading" : ""}`} aria-busy={loading}>
      <span>{label}</span>
      <strong className={tone ? `${tone}-text` : ""}>{loading ? "--" : value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function formatCount(value, locale) {
  try {
    return BigInt(value ?? "0").toLocaleString(locale);
  } catch {
    return "0";
  }
}

function formatAtomic(amountAtomic, decimals) {
  const negative = String(amountAtomic).startsWith("-");
  const digits = String(amountAtomic).replace(/^-/, "").padStart(decimals + 1, "0");
  if (!decimals) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function formatMoney(items, locale, t) {
  if (!items?.length) return t("dashboard.zeroMoney");
  if (items.length > 1) return t("dashboard.multipleAssets", { count: items.length });
  const [item] = items;
  const amount = formatAtomic(item.amountAtomic, item.decimals);
  const [whole, fraction] = amount.split(".");
  const grouped = formatCount(whole, locale);
  return `${grouped}${fraction ? `.${fraction}` : ""} ${item.symbol}`;
}

function ProductRow({ product, navigate, onRename, onDelete, t, locale }) {
  const sourceCount = product.latestVersion?.sourceCount ?? "0";
  const hasSource = BigInt(sourceCount) > 0n;
  const deployment = product.activeDeployment;
  const apiReady = deployment?.status === "healthy" && Boolean(deployment.activeVersionId);
  const x402Ready = apiReady && deployment.accessMode === "x402" && Boolean(deployment.activePublicationVersionId);
  const lastRunAt = product.latestRun?.finishedAt
    ?? product.latestRun?.startedAt
    ?? product.latestRun?.queuedAt;
  const productPath = `/app/products/${product.slug}/agent`;

  return (
    <div className="table-row product-row" role="row">
      <span className="product-cell">
        <span className="product-icon"><Graph size={20} /></span>
        <span className="product-cell-copy">
          <EditableProductName
            name={product.name}
            variant="table"
            onTitleActivate={() => navigate(productPath)}
            onCommit={(name) => onRename(product.id, name)}
          />
          <small>{product.description || t(`dashboard.productStatus.${product.status}`)}</small>
        </span>
      </span>
      <span>
        <Status tone={hasSource ? "green" : "neutral"}>
          {t(hasSource ? "dashboard.sourceConfigured" : "dashboard.sourcePending")}
        </Status>
        <small>{hasSource ? t("dashboard.graphSourceCount", { count: formatCount(sourceCount, locale) }) : t("dashboard.notConfigured")}</small>
      </span>
      <span>
        <Status tone={apiReady ? "violet" : deployment ? "amber" : "neutral"}>
          {t(apiReady ? "common.ready" : "common.notReady")}
        </Status>
        <small>{deployment ? t(`dashboard.deploymentStatus.${deployment.status}`) : t("dashboard.noDeployment")}</small>
      </span>
      <span>
        <Status tone={x402Ready ? "green" : "neutral"}>
          {t(x402Ready ? "common.ready" : "common.notReady")}
        </Status>
        <small>{t(x402Ready ? "dashboard.x402Active" : "dashboard.x402Inactive")}</small>
      </span>
      <span>
        <strong>{product.latestRun ? t(`dashboard.runStatus.${product.latestRun.status}`) : t("dashboard.neverRun")}</strong>
        <small>{lastRunAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastRunAt)) : t("dashboard.noRunRecord")}</small>
      </span>
      <span className="product-row-actions" role="cell">
        <IconButton
          className="product-row-delete"
          label={t("dashboard.deleteProductLabel", {name: product.name})}
          onClick={() => onDelete(product)}
        >
          <Trash size={17} />
        </IconButton>
        <button
          type="button"
          className="product-row-open"
          aria-label={t("productName.open")}
          onClick={() => navigate(productPath)}
        >
          <ArrowRight size={18} />
        </button>
      </span>
    </div>
  );
}

export function DashboardPage({ navigate }) {
  const { locale, t } = useI18n();
  const dashboard = useProductDashboard();
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(null);
  const overview = dashboard.overview;

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    if (!normalized) return dashboard.products;
    return dashboard.products.filter((product) =>
      [product.name, product.description].some((value) =>
        value?.toLocaleLowerCase(locale).includes(normalized),
      ),
    );
  }, [dashboard.products, locale, query]);

  async function createNewProduct() {
    if (isCreating) return;
    setIsCreating(true);
    setCreateError("");
    try {
      const product = await dashboard.create();
      navigate(`/app/products/${product.slug}/agent`);
    } catch (error) {
      setCreateError(t(error?.message === "PRODUCT_WALLET_REQUIRED" ? "dashboard.walletRequired" : "dashboard.createError"));
    } finally {
      setIsCreating(false);
    }
  }

  function closeDeleteDialog() {
    if (deleteDialog?.state !== "loading") setDeleteDialog(null);
  }

  async function confirmDeleteProduct() {
    if (!deleteDialog || deleteDialog.state === "loading") return;
    const product = deleteDialog.product;
    setDeleteDialog({product, state: "loading"});
    try {
      await dashboard.remove(product.id);
      setDeleteDialog(null);
    } catch (error) {
      setDeleteDialog({product, state: "error", error});
    }
  }

  return (
    <div className="page">
      <AppHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        navigate={navigate}
      />

      <div className="metrics-row">
        <Metric
          label={t("dashboard.metric.activeProducts")}
          value={formatCount(overview?.activeProductCount, locale)}
          note={overview && t("dashboard.metric.draftVersions", { count: formatCount(overview.draftVersionCount, locale) })}
          loading={dashboard.status === "loading"}
        />
        <Metric
          label={t("dashboard.metric.requests")}
          value={formatCount(overview?.apiRequestCount, locale)}
          note={overview && t("dashboard.metric.liveRecords")}
          loading={dashboard.status === "loading"}
        />
        <Metric
          label={t("dashboard.metric.graphSpend")}
          value={formatMoney(overview?.graphExpenses, locale, t)}
          note={overview && t("dashboard.metric.confirmedLedger")}
          tone="amber"
          loading={dashboard.status === "loading"}
        />
        <Metric
          label={t("dashboard.metric.revenue")}
          value={formatMoney(overview?.grossSales, locale, t)}
          note={overview && t("dashboard.metric.confirmedLedger")}
          tone="green"
          loading={dashboard.status === "loading"}
        />
      </div>

      <section className="panel product-list-panel">
        <div className="panel-toolbar">
          <div>
            <h2>{t("dashboard.allProducts")}</h2>
            <p>{t("dashboard.allProductsDetail")}</p>
          </div>
          <div className="toolbar-cluster">
            <Button
              variant="primary"
              icon={isCreating ? CircleNotch : Plus}
              className={isCreating ? "is-spinning-icon" : ""}
              disabled={isCreating}
              aria-busy={isCreating}
              onClick={() => void createNewProduct()}
            >
              {t(isCreating ? "dashboard.creatingProduct" : "dashboard.newProduct")}
            </Button>
            <label className="search-control">
              <MagnifyingGlass size={17} />
              <input
                aria-label={t("dashboard.searchProducts")}
                placeholder={t("dashboard.searchProducts")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <IconButton label={t("dashboard.filterProducts")} disabled><SlidersHorizontal size={18} /></IconButton>
          </div>
        </div>
        {createError && <p className="create-product-error dashboard-create-error" role="alert">{createError}</p>}

        <div className="table" role="table" aria-label={t("dashboard.tableLabel")}>
          <div className="table-row table-head" role="row">
            <span>{t("dashboard.column.product")}</span><span>{t("dashboard.column.source")}</span><span>API</span><span>{t("dashboard.column.x402")}</span><span>{t("dashboard.column.lastRun")}</span>
            <span aria-label={t("dashboard.column.actions")} />
          </div>

          {dashboard.status === "loading" && (
            <div className="dashboard-loading-rows" aria-label={t("dashboard.loading")} aria-busy="true">
              <span /><span /><span />
            </div>
          )}

          {dashboard.status === "error" && (
            <div className="dashboard-state dashboard-error" role="alert">
              <WarningCircle size={25} />
              <div>
                <strong>{t("dashboard.loadErrorTitle")}</strong>
                <span>{t("dashboard.loadErrorDetail")}</span>
              </div>
              <Button icon={ArrowClockwise} onClick={() => void dashboard.refresh()}>{t("dashboard.retry")}</Button>
            </div>
          )}

          {dashboard.status === "ready" && visibleProducts.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              navigate={navigate}
              onRename={dashboard.rename}
              onDelete={(product) => setDeleteDialog({product, state: "idle"})}
              t={t}
              locale={locale}
            />
          ))}

          {dashboard.status === "ready" && !visibleProducts.length && (
            <div className="dashboard-state dashboard-empty">
              <Graph size={25} />
              <div>
                <strong>{t(query ? "dashboard.noSearchResults" : "dashboard.emptyTitle")}</strong>
                <span>{t(query ? "dashboard.noSearchResultsDetail" : "dashboard.emptyDetail")}</span>
              </div>
              {!query && (
                <Button
                  icon={isCreating ? CircleNotch : Plus}
                  className={isCreating ? "is-spinning-icon" : ""}
                  disabled={isCreating}
                  aria-busy={isCreating}
                  onClick={() => void createNewProduct()}
                >
                  {t(isCreating ? "dashboard.creatingProduct" : "dashboard.createFirst")}
                </Button>
              )}
            </div>
          )}

          {dashboard.status === "ready" && visibleProducts.length > 0 && (
            <button
              type="button"
              className="table-empty-row dashboard-create-another"
              disabled={isCreating}
              aria-busy={isCreating}
              onClick={() => void createNewProduct()}
            >
              {isCreating ? <CircleNotch size={16} className="dashboard-create-spinner" /> : <Plus size={16} />}
              {t(isCreating ? "dashboard.creatingProduct" : "dashboard.createAnother")}
            </button>
          )}
        </div>
      </section>

      {deleteDialog && (
        <Modal
          title={t("dashboard.deleteProductTitle", {name: deleteDialog.product.name})}
          eyebrow={t("dashboard.deleteProductEyebrow")}
          onClose={closeDeleteDialog}
          footer={
            <>
              <Button autoFocus onClick={closeDeleteDialog} disabled={deleteDialog.state === "loading"}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                icon={deleteDialog.state === "loading" ? CircleNotch : Trash}
                className={deleteDialog.state === "loading" ? "is-loading" : ""}
                disabled={deleteDialog.state === "loading"}
                aria-busy={deleteDialog.state === "loading"}
                onClick={() => void confirmDeleteProduct()}
              >
                {t(deleteDialog.state === "loading" ? "dashboard.deletingProduct" : "dashboard.deleteProduct")}
              </Button>
            </>
          }
        >
          <div className="inline-notice product-delete-warning">
            <WarningCircle size={19} />
            <p>{t("dashboard.deleteProductDetail")}</p>
          </div>
          {deleteDialog.state === "error" && (
            <div className="inline-notice product-delete-error" role="alert">
              <WarningCircle size={19} />
              <p>{t("dashboard.deleteProductError")}</p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
