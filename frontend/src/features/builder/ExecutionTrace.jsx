import { ArrowRight, ArrowsClockwise, FloppyDisk, Graph } from "@phosphor-icons/react";
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
        <Button icon={FloppyDisk} disabled={!canSaveDraft} onClick={onSaveDraft}>{t("trace.saveDraft")}</Button>
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
        {saveState === "session" && <span className="draft-save-feedback" role="status">{t("trace.saveDraftSession")}</span>}
        {buildDisabledReason && <span className="draft-save-feedback" role="status">{buildDisabledReason}</span>}
      </div>
    </div>
  );
}
