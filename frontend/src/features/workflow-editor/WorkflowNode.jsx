import { Handle, Position } from "@xyflow/react";
import {
  ArrowsClockwise,
  BracketsCurly,
  ChartBar,
  Database,
  Funnel,
  GitMerge,
  Stack,
} from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { getOperator } from "./nodeCatalog.js";
import { getInputPorts, getOutputPorts } from "./connectionRules.js";

const icons = {
  source: Database,
  filter: Funnel,
  map: ArrowsClockwise,
  aggregate: ChartBar,
  union: Stack,
  join: GitMerge,
  output: BracketsCurly,
};

function isConfigured(node) {
  const config = node.config ?? {};
  if (node.type === "source") return Boolean(config.sourceKey);
  if (node.type === "filter") return Boolean(config.predicate || config.window);
  if (node.type === "map") return Object.keys(config.mapping ?? {}).length > 0;
  if (node.type === "aggregate") return (config.groupBy ?? []).length > 0 || (config.measures ?? []).length > 0;
  return true;
}

function portStyle(index, count) {
  if (count === 1) return undefined;
  return { top: `${((index + 1) / (count + 1)) * 100}%` };
}

export function WorkflowNode({ data, selected }) {
  const { t } = useI18n();
  const node = data.node;
  const operator = getOperator(node.type);
  const Icon = icons[node.type] ?? ArrowsClockwise;
  const inputPorts = getInputPorts(node.type);
  const outputPorts = getOutputPorts(node.type);
  const configured = isConfigured(node);

  return (
    <div className={`workflow-node ${selected ? "is-selected" : ""}`} role="group" aria-label={t(operator.labelKey)} data-operator-type={node.type}>
      {inputPorts.map((port, index) => (
        <Handle key={`target-${port}`} id={port} type="target" position={Position.Left} style={portStyle(index, inputPorts.length)} />
      ))}
      <div className="workflow-node-icon"><Icon size={20} weight="bold" aria-hidden="true" /></div>
      <div className="workflow-node-title">{t(operator.labelKey)}</div>
      <div className={`workflow-node-status ${configured ? "is-configured" : "needs-config"}`}>
        <span className="status-dot" aria-hidden="true" />
        {configured ? t("workflowEditor.node.configured") : t("workflowEditor.node.needsConfig")}
      </div>
      {outputPorts.map((port, index) => (
        <Handle key={`source-${port}`} id={port} type="source" position={Position.Right} style={portStyle(index, outputPorts.length)} />
      ))}
    </div>
  );
}
