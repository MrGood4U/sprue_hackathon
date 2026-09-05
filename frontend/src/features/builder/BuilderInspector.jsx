import { Modal } from "../../components/ui/Modal.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { getNodeLabelKey } from "./nodeLabels.js";

export function BuilderInspector({ selection, draft, onClose }) {
  const { t } = useI18n();
  const spec = draft.specification;
  const selectedNode = spec.dag.nodes.find((node) => node.id === selection);
  const value = selection === "spec" ? spec : selection === "dag" ? spec.dag : selection === "schema" ? spec.outputSchema : selectedNode;
  const titleKey = selection === "spec" ? "builder.specTitle" : selection === "dag" ? "builder.structuredDag"
    : selection === "schema" ? "readiness.outputSchema" : getNodeLabelKey(selectedNode);
  return (
    <Modal title={t(titleKey)} eyebrow={t("builder.readOnlyDetail")} width="740px" onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>{t("common.done")}</Button>}>
      <p>{t("builder.sampleNotice")}</p>
      <pre className="code-block builder-inspector">{JSON.stringify(value, null, 2)}</pre>
    </Modal>
  );
}
