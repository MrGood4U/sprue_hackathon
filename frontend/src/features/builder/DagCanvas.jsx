import { useState } from "react";
import { Code, Database, Stack, Function as FunctionIcon } from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { getNodeLabelKey } from "./nodeLabels.js";
import { projectGraph } from "./graphView.js";
import "./builder.css";

export function DagCanvas({ draft, onSelectNode }) {
  const { t } = useI18n();
  const [primitive, setPrimitive] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const graph = projectGraph(draft.specification.dag, primitive ? [] : draft.groups);
  const positions = new Map(graph.nodes.map((node) => [node.id, node]));
  return (
    <main className="dag-canvas" aria-label={t("dag.workflowLabel")}>
      <div className="dag-toolbar">
        <span className="section-label">{t("dag.sampleLabel")}</span>
        <button className="text-link" aria-pressed={primitive} onClick={() => setPrimitive(!primitive)}>{t(primitive ? "dag.showSemantic" : "dag.showPrimitive")}</button>
      </div>
      <div className="dag-scroll" tabIndex={0} aria-label={t("dag.workflowLabel")}>
        <div className="dag-stage" style={{ width: graph.width, height: graph.height }}>
          <svg className="dag-connections" width={graph.width} height={graph.height} aria-hidden="true">
            <defs><marker id="dag-edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
            {graph.edges.map((edge) => {
              const from = positions.get(edge.fromNode);
              const to = positions.get(edge.toNode);
              return <path key={edge.id} d={`M ${from.x + 128} ${from.y + 60} C ${from.x + 150} ${from.y + 60}, ${to.x - 22} ${to.y + 60}, ${to.x} ${to.y + 60}`} markerEnd="url(#dag-edge-arrow)" />;
            })}
          </svg>
          {graph.nodes.map((node) => {
            const isTemplate = node.type === "template";
            const Icon = isTemplate ? Stack : node.type === "source" ? Database : node.type === "output" ? Code : FunctionIcon;
            return (
              <button key={node.id} className={`dag-card ${isTemplate ? "dag-card-template" : ""}`} style={{ left: node.x, top: node.y }}
                aria-expanded={isTemplate ? expanded === node.id : undefined}
                aria-controls={isTemplate ? `${node.id}-details` : undefined}
                onClick={() => isTemplate ? setExpanded(expanded === node.id ? null : node.id) : onSelectNode(node.id)}>
                <Icon size={26} aria-hidden="true" />
                <strong>{t(getNodeLabelKey(node))}</strong>
                <small>{isTemplate ? t("dag.templateVersion", { version: node.templateVersion }) : node.type}</small>
                <code>{node.id}</code>
              </button>
            );
          })}
        </div>
      </div>
      {!primitive && draft.groups.map((group) => (
        <section className="dag-expansion" key={group.id} id={`${group.id}-details`} hidden={expanded !== group.id}>
          <h3>{t(group.labelKey)}</h3>
          <p>{t("dag.expansionNotice")}</p>
          <ol>{group.nodeIds.map((id) => {
            const node = draft.specification.dag.nodes.find((item) => item.id === id);
            const inputs = draft.specification.dag.edges.filter((edge) => edge.toNode === id);
            return <li key={id}><button className="text-link" onClick={() => onSelectNode(id)}>{t(getNodeLabelKey(node))} <code>{node.type}</code></button><small>{inputs.map((edge) => `${edge.fromNode}.${edge.fromPort} -> ${id}.${edge.toPort}`).join(", ")}</small></li>;
          })}</ol>
        </section>
      ))}
    </main>
  );
}
