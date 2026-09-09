import { BracketsCurly, CaretLeft, CaretRight, Database } from "@phosphor-icons/react";
import { IconButton } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function BuildReadiness({ draft, validation = [], onInspect, collapsed, onToggle }) {
  const { t } = useI18n();
  const sourceNode = draft.specification.dag.nodes.find((node) => node.type === "source");
  const outputFields = draft.specification.outputSchema.fields ?? [];
  const isAgentDraft = draft.origin?.kind === "agent";
  if (collapsed) {
    return (
      <aside className="readiness-panel readiness-panel-collapsed">
        <IconButton label={t("readiness.expand")} onClick={onToggle}>
          <CaretLeft size={18} aria-hidden="true" />
        </IconButton>
      </aside>
    );
  }
  return (
    <aside className="readiness-panel">
      <div className="readiness-header">
        <span className="section-label">{t("readiness.title")}</span>
        <IconButton label={t("readiness.collapse")} onClick={onToggle}>
          <CaretRight size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="readiness-block">
        <div className="readiness-title"><Database size={22} className="violet-text" /><strong>{t(isAgentDraft ? "builder.agentDraftTitle" : "builder.manualDraftTitle")}</strong></div>
        <p>{t(isAgentDraft ? "builder.agentDraftNotice" : "builder.manualDraftNotice")}</p>
        <p className="builder-intent-summary"><strong>{t("builder.intent")}:</strong> {draft.specification.intent.summary || t("builder.noIntent")}</p>
        {sourceNode && <button className="text-link" onClick={() => onInspect(sourceNode.id)}>{t("dag.inspectSource")}</button>}
      </div>
      <div className="readiness-block">
        <div className="readiness-title"><BracketsCurly size={22} className="violet-text" /><strong>{t("readiness.outputSchema")}</strong></div>
        <pre className="schema-preview">{outputFields.length ? outputFields.map((field) => `${field.name.padEnd(22, " ")}${field.type}`).join("\n") : t("readiness.noOutputFields")}</pre>
        <button className="text-link" onClick={() => onInspect("schema")}>{t("readiness.viewFullSchema")}</button>
      </div>
      <div className="readiness-block">
        <strong>{t("builder.runtimePreview")}</strong>
        <p>{t("builder.runtimePreviewUnavailable")}</p>
      </div>
      {validation.length > 0 && <div className="readiness-validation" role="status">{t("readiness.validationError", { count: validation.length })}</div>}
    </aside>
  );
}
