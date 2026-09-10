import { useState } from "react";
import { Check, Copy, WarningCircle } from "@phosphor-icons/react";
import { Modal } from "../../components/ui/Modal.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { copyText } from "../wallet/copyText.js";
import { getNodeLabelKey } from "./nodeLabels.js";

export function BuilderInspector({ selection, draft, onClose }) {
  const { t } = useI18n();
  const spec = draft.specification;
  const selectedNode = spec.dag.nodes.find((node) => node.id === selection);
  const value = selection === "spec" ? spec : selection === "dag" ? spec.dag : selection === "schema" ? spec.outputSchema : selectedNode;
  const titleKey = selection === "spec" ? "builder.specTitle" : selection === "dag" ? "builder.structuredDag"
    : selection === "schema" ? "readiness.outputSchema" : getNodeLabelKey(selectedNode);
  const serializedValue = JSON.stringify(value, null, 2);
  const [copyStatus, setCopyStatus] = useState("idle");
  const copyLabel = copyStatus === "copying" ? t("builder.copyingStructuredText")
    : copyStatus === "copied" ? t("builder.structuredTextCopied")
      : copyStatus === "failed" ? t("builder.retryCopyStructuredText")
        : t("builder.copyStructuredText");
  const CopyIcon = copyStatus === "copied" ? Check : copyStatus === "failed" ? WarningCircle : Copy;

  const copyStructuredValue = async () => {
    setCopyStatus("copying");
    try {
      await copyText(serializedValue);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <Modal className="builder-inspector-modal" title={t(titleKey)} eyebrow={t("builder.planningDraftDetail")} width="740px" onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>{t("common.done")}</Button>}>
      <p>{t("builder.agentDraftNotice")}</p>
      <div className="builder-code-viewer">
        <div className="builder-code-toolbar">
          <span className="sr-only" role="status" aria-live="polite">
            {copyStatus === "copied" ? t("builder.structuredTextCopied")
              : copyStatus === "failed" ? t("builder.structuredTextCopyFailed") : ""}
          </span>
          <Button
            className={`builder-code-copy is-${copyStatus}`}
            icon={CopyIcon}
            disabled={copyStatus === "copying"}
            onClick={copyStructuredValue}
          >
            {copyLabel}
          </Button>
        </div>
        <pre
          className="code-block builder-inspector"
          tabIndex={0}
          aria-label={t("builder.structuredContentLabel", {title: t(titleKey)})}
        >
          {serializedValue}
        </pre>
      </div>
    </Modal>
  );
}
