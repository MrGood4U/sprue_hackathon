import { ArrowLeft } from "@phosphor-icons/react";
import { AccountMenu } from "../../features/auth/AccountMenu.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { LanguageSwitcher } from "../navigation/LanguageSwitcher.jsx";
import { EditableProductName } from "./EditableProductName.jsx";

export function ProductHeader({ product, productRef = product?.slug, active, navigate, onRename }) {
  const { t } = useI18n();
  const tabs = [
    ["agent", "productHeader.agent", `/app/products/${productRef}/agent`],
    ["build", "productHeader.build", `/app/products/${productRef}/build`],
    ["api", "productHeader.api", `/app/products/${productRef}/api`],
    ["monetize", "productHeader.monetize", `/app/products/${productRef}/monetize`],
  ];

  return (
    <header className="product-header">
      <div className="product-title-row">
        <div className="product-title-group" aria-busy={!product}>
          <button className="back-link" aria-label={t("productHeader.backToProducts")} onClick={() => navigate("/app")}>
            <ArrowLeft size={21} />
          </button>
          {product && onRename ? (
            <EditableProductName
              name={product.name}
              titleActivatesEdit
              onCommit={onRename}
            />
          ) : product ? (
            <h1 className="product-static-name">{product.name}</h1>
          ) : (
            <>
              <span className="product-name-skeleton" aria-hidden="true" />
              <span className="sr-only">{t("productHeader.loadingName")}</span>
            </>
          )}
        </div>
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
