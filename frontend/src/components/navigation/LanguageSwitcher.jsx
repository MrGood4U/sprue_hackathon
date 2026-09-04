import { GlobeHemisphereWest } from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="language-switcher">
      <GlobeHemisphereWest size={17} aria-hidden="true" />
      <span className="sr-only">{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
      >
        <option value="en">{t("language.en")}</option>
        <option value="zh-CN">{t("language.zh-CN")}</option>
      </select>
    </label>
  );
}
