import { Database, BracketsCurly } from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function BuildReadiness({ draft, onInspect }) {
  const { t } = useI18n();
  return (
    <aside className="readiness-panel">
      <span className="section-label">{t("readiness.title")}</span>
      <div className="readiness-block">
        <div className="readiness-title"><Database size={22} className="violet-text" /><strong>{t("dag.sampleLabel")}</strong></div>
        <p>{t("builder.sampleNotice")}</p>
        <button className="text-link" onClick={() => onInspect("activity")}>{t("dag.inspectSource")}</button>
      </div>
      <div className="readiness-block">
        <div className="readiness-title"><BracketsCurly size={22} className="violet-text" /><strong>{t("readiness.outputSchema")}</strong></div>
        <pre className="schema-preview">{`protocol       string
activeWallets  integer string
repeatWallets  integer string
repeatShare    decimal string | null`}</pre>
        <button className="text-link" onClick={() => onInspect("schema")}>{t("readiness.viewFullSchema")}</button>
      </div>
      <div className="readiness-block">
        <strong>{t("builder.expectedResult")}</strong>
        <pre className="schema-preview">{JSON.stringify(draft.referenceResult, null, 2)}</pre>
        <p>{t("builder.oracleNotice")}</p>
      </div>
    </aside>
  );
}
