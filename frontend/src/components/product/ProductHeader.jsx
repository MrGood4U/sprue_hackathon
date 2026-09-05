import { ArrowLeft, CaretDown, CheckCircle } from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function ProductHeader({ product, active, navigate, buildStatus }) {
  const { t } = useI18n();
  const tabs = [
    ["build", "productHeader.build", `/app/products/${product.slug}/build`],
    ["api", "productHeader.api", `/app/products/${product.slug}/api`],
    ["monetize", "productHeader.monetize", `/app/products/${product.slug}/monetize`],
  ];

  return (
    <header className="product-header">
      <div className="product-title-row">
        <button className="back-link" onClick={() => navigate("/app")}>
          <ArrowLeft size={21} />
          <span>{product.name}</span>
        </button>
        <div className="product-head-actions">
          <button className="version-select">{t("productHeader.version")} <CaretDown size={15} /></button>
          <span className="ready-pill" role="status"><CheckCircle size={18} weight="fill" />{buildStatus ?? t("productHeader.readyToBuild")}</span>
        </div>
      </div>
      <nav className="product-tabs" aria-label={t("productHeader.sections")}>
        {tabs.map(([id, labelKey, target]) => (
          <button
            key={id}
            className={active === id ? "active" : ""}
            onClick={() => navigate(target)}
          >
            {t(labelKey)}
          </button>
        ))}
      </nav>
    </header>
  );
}
