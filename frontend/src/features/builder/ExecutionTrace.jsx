import { ArrowRight, ArrowsClockwise, Check, FloppyDisk, Graph, WarningCircle } from "@phosphor-icons/react";
import { Button } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function ExecutionTrace({ buildState, onBuild, onOpenDag, onSaveDraft, canSaveDraft, saveState, buildDisabled = false, buildDisabledReason = null }) {
  const { t } = useI18n();
  const buildLabel = buildState === "building"
    ? t("trace.building")
    : buildState === "complete"
      ? t("trace.buildComplete")
      : t("trace.buildVersion");

  return (
    <div className="execution-panel">
      <div className="trace-actions">
        <Button icon={saveState === "saving" ? ArrowsClockwise : FloppyDisk} className={saveState === "saving" ? "is-loading" : ""} aria-busy={saveState === "saving"} disabled={!canSaveDraft} onClick={onSaveDraft}>{t(saveState === "saving" ? "trace.savingDraft" : "trace.saveDraft")}</Button>
        <Button icon={Graph} onClick={onOpenDag}>{t("builder.structuredDag")}</Button>
        <Button
          variant="primary"
          icon={buildState === "building" ? ArrowsClockwise : ArrowRight}
          className={buildState === "building" ? "builder-build-button is-building" : "builder-build-button"}
          aria-busy={buildState === "building"}
          disabled={buildState === "building" || buildDisabled}
          onClick={onBuild}
        >
          {buildLabel}
        </Button>
        {saveState === "saved" && <span className="draft-save-feedback is-success" role="status"><Check size={16} aria-hidden="true" />{t("trace.saveDraftDurable")}</span>}
        {saveState === "error" && <span className="draft-save-feedback is-error" role="alert"><WarningCircle size={16} aria-hidden="true" />{t("trace.saveDraftFailed")}</span>}
        {buildDisabledReason && <span className="draft-save-feedback" role="status">{buildDisabledReason}</span>}
      </div>
    </div>
  );
}
