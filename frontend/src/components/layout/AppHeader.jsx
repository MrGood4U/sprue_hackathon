import { useI18n } from "../../i18n/I18nProvider.jsx";

export function AppHeader({ title, subtitle, actions }) {
  const { t } = useI18n();

  return (
    <header className="app-header">
      <div>
        <span className="eyebrow">{t("appHeader.workspace")}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="header-actions">{actions}</div>
    </header>
  );
}
