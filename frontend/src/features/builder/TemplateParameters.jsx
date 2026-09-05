import { Button } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function TemplateParameters({ parameters, disabled, onApply }) {
  const { t } = useI18n();
  return (
    <form className="template-parameters" onSubmit={(event) => {
      event.preventDefault();
      if (!disabled) onApply(parameters);
    }}>
      <span className="section-label">{t("builder.templateParameters")}</span>
      <label htmlFor="sample-window">{t("builder.sourceWindow")}</label>
      <select id="sample-window" value={parameters.windowDays} disabled={disabled} onChange={() => {}}>
        <option value={30}>{t("builder.completeDays", { days: 30 })}</option>
      </select>
      <label htmlFor="sample-composition">{t("builder.composition")}</label>
      <input id="sample-composition" value={t("builder.crossChainComposition")} readOnly />
      <Button type="submit" disabled={disabled}>{t("builder.refreshProposal")}</Button>
      <small>{t("builder.localOnly")}</small>
    </form>
  );
}
