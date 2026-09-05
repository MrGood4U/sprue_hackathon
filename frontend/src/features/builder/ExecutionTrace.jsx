import { ArrowRight, ArrowsClockwise, Graph } from "@phosphor-icons/react";
import { Button } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function ExecutionTrace({ buildState, onBuild, onOpenDag, onOpenSpec }) {
  const { t } = useI18n();
  const buildLabel = buildState === "building"
    ? t("trace.building")
    : buildState === "complete"
      ? t("trace.buildComplete")
      : t("trace.buildVersion");

  return (
    <div className="execution-panel">
      <div className="trace-actions">
        <Button icon={Graph} onClick={onOpenDag}>{t("builder.structuredDag")}</Button>
        <Button onClick={onOpenSpec}>{t("trace.reviewSpec")}</Button>
        <Button
          variant="primary"
          icon={buildState === "building" ? ArrowsClockwise : ArrowRight}
          disabled={buildState === "building"}
          onClick={onBuild}
        >
          {buildLabel}
        </Button>
      </div>
    </div>
  );
}
