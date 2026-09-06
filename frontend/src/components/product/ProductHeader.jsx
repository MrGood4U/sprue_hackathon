import { ArrowLeft } from "@phosphor-icons/react";
import { AccountMenu } from "../../features/auth/AccountMenu.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { LanguageSwitcher } from "../navigation/LanguageSwitcher.jsx";

export function ProductHeader({ product, active, navigate }) {
  const { t } = useI18n();
  const tabs = [
    ["agent", "productHeader.agent", `/app/products/${product.slug}/agent`],
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
          <LanguageSwitcher />
          <AccountMenu navigate={navigate} />
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
