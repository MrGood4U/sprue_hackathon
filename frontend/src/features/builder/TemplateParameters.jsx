import { useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function TemplateParameters({ parameters, disabled, onApply }) {
  const { t } = useI18n();
  const [windowDays, setWindowDays] = useState(parameters.windowDays);
  const [threshold, setThreshold] = useState(String(parameters.minimumActiveDays));
  const minimumActiveDays = Number(threshold);
  const invalid = !Number.isInteger(minimumActiveDays) || minimumActiveDays < 2 || minimumActiveDays > windowDays;
  const changed = windowDays !== parameters.windowDays || minimumActiveDays !== parameters.minimumActiveDays;
  return (
    <form className="template-parameters" onSubmit={(event) => {
      event.preventDefault();
      if (!invalid && changed && !disabled) onApply({ windowDays, minimumActiveDays });
    }}>
      <span className="section-label">{t("builder.templateParameters")}</span>
      <label htmlFor="sample-window">{t("builder.sourceWindow")}</label>
      <select id="sample-window" value={windowDays} disabled={disabled} onChange={(event) => setWindowDays(Number(event.target.value))}>
        {[7, 30].map((days) => <option key={days} value={days}>{t("builder.completeDays", { days })}</option>)}
      </select>
      <label htmlFor="sample-threshold">{t("builder.repeatThreshold")}</label>
      <input id="sample-threshold" type="number" min="2" max={windowDays} step="1" value={threshold} disabled={disabled}
        aria-invalid={invalid} aria-describedby={invalid ? "threshold-error" : undefined} onChange={(event) => setThreshold(event.target.value)} />
      {invalid && <p id="threshold-error" role="alert">{t("builder.thresholdError", { days: windowDays })}</p>}
      <Button type="submit" disabled={disabled || invalid || !changed}>{t("builder.applyParameters")}</Button>
      <small>{t("builder.localOnly")}</small>
    </form>
  );
}
