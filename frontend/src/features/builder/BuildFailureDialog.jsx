import {WarningCircle} from "@phosphor-icons/react";
import {Button} from "../../components/ui/Button.jsx";
import {Modal} from "../../components/ui/Modal.jsx";
import {useI18n} from "../../i18n/I18nProvider.jsx";

export function BuildFailureDialog({issues, onClose}) {
  const {t} = useI18n();
  return (
    <Modal
      className="build-failure-modal"
      eyebrow={t("builder.compilationEyebrow")}
      title={t("builder.compilationFailed")}
      onClose={onClose}
      footer={<Button variant="primary" autoFocus onClick={onClose}>{t("builder.returnToBuilder")}</Button>}
    >
      <div className="build-failure-summary" role="alert">
        <WarningCircle size={22} weight="fill" aria-hidden="true" />
        <p>{t("builder.compilationFailedDetail")}</p>
      </div>
      <ol className="build-failure-list">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.nodeId ?? "dag"}-${index}`}>
            <div className="build-failure-issue-head">
              <code>{issue.code}</code>
              {issue.nodeId && <span>{t("builder.compilationNode", {nodeId: issue.nodeId})}</span>}
            </div>
            <p>{issue.message}</p>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
