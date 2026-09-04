import {
  ArrowSquareOut,
  BracketsCurly,
  CheckCircle,
  Database,
  HardDrives,
  ShieldCheck,
} from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function BuildReadiness() {
  const { t } = useI18n();

  return (
    <aside className="readiness-panel">
      <span className="section-label">{t("readiness.title")}</span>

      <div className="readiness-block">
        <div className="readiness-title">
          <Database size={22} className="violet-text" />
          <strong>{t("readiness.sourceSnapshot")}</strong>
          <CheckCircle size={18} weight="fill" className="green-text" />
        </div>
        <dl className="mono-list">
          <div><dt>{t("readiness.provider")}</dt><dd>The Graph</dd></div>
          <div><dt>{t("readiness.subgraph")}</dt><dd>base-dex@v1.4.2</dd></div>
          <div><dt>{t("readiness.network")}</dt><dd>{t("readiness.baseMainnet")}</dd></div>
          <div><dt>{t("readiness.indexedAt")}</dt><dd>2026-09-05 10:12:43</dd></div>
        </dl>
        <button className="text-link">{t("readiness.viewExplorer")} <ArrowSquareOut size={14} /></button>
      </div>

      <div className="readiness-block">
        <div className="readiness-title">
          <HardDrives size={22} className="green-text" />
          <strong>{t("readiness.schemaValidated")}</strong>
          <CheckCircle size={18} weight="fill" className="green-text" />
        </div>
        <p>{t("readiness.schemaDetail")}</p>
        <button className="text-link">{t("readiness.viewSchema")} <ArrowSquareOut size={14} /></button>
      </div>

      <div className="readiness-block">
        <div className="readiness-title">
          <ShieldCheck size={22} className="amber-text" />
          <strong>{t("readiness.authority")}</strong>
          <CheckCircle size={18} weight="fill" className="amber-text" />
        </div>
        <dl className="compact-list">
          <div><dt>{t("readiness.available")}</dt><dd>3.12 USDC</dd></div>
          <div><dt>{t("readiness.maxRequest")}</dt><dd>0.05 USDC</dd></div>
          <div><dt>{t("readiness.policy")}</dt><dd>{t("readiness.bounded")}</dd></div>
        </dl>
        <button className="text-link">{t("readiness.viewAuthorization")} <ArrowSquareOut size={14} /></button>
      </div>

      <div className="readiness-block">
        <div className="readiness-title">
          <BracketsCurly size={22} className="violet-text" />
          <strong>{t("readiness.outputSchema")}</strong>
          <CheckCircle size={18} weight="fill" className="green-text" />
        </div>
        <pre className="schema-preview">{`protocol          string
stickiness_score number
unique_wallets   integer
total_wallets    integer
window_start     date`}</pre>
        <button className="text-link">{t("readiness.viewFullSchema")} <ArrowSquareOut size={14} /></button>
      </div>
    </aside>
  );
}
