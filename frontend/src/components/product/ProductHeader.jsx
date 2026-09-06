import { ArrowLeft } from "@phosphor-icons/react";
import { AccountMenu } from "../../features/auth/AccountMenu.jsx";
import { useDemoRuntime } from "../../features/runtime/DemoRuntimeProvider.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { LanguageSwitcher } from "../navigation/LanguageSwitcher.jsx";
import { EditableProductName } from "./EditableProductName.jsx";

export function ProductHeader({ product, active, navigate }) {
  const { t } = useI18n();
  const { runAction } = useDemoRuntime();
  const tabs = [
    ["agent", "productHeader.agent", `/app/products/${product.slug}/agent`],
    ["build", "productHeader.build", `/app/products/${product.slug}/build`],
    ["api", "productHeader.api", `/app/products/${product.slug}/api`],
    ["monetize", "productHeader.monetize", `/app/products/${product.slug}/monetize`],
  ];

  return (
    <header className="product-header">
      <div className="product-title-row">
        <div className="product-title-group">
          <button className="back-link" aria-label={t("productHeader.backToProducts")} onClick={() => navigate("/app")}>
            <ArrowLeft size={21} />
          </button>
          <EditableProductName
            name={product.name}
            titleActivatesEdit
            onCommit={(name) => runAction("rename_product", { name })}
          />
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
