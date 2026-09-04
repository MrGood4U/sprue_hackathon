import {
  ArrowRight,
  CalendarBlank,
  ChartLineUp,
  Code,
  Database,
  Funnel,
  UserCircle,
} from "@phosphor-icons/react";
import { dagNodes } from "../../data/demoProduct.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";

const iconByName = {
  calendar: CalendarBlank,
  chart: ChartLineUp,
  code: Code,
  database: Database,
  funnel: Funnel,
  user: UserCircle,
};

export function DagCanvas({ onSelectNode }) {
  const { t } = useI18n();

  return (
    <main className="dag-canvas" aria-label={t("dag.workflowLabel")}>
      <div className="dag-flow">
        {dagNodes.map((node, index) => {
          const NodeIcon = iconByName[node.icon];
          return (
            <div className="dag-unit" key={node.title}>
              <button className={`dag-node dag-${node.accent}`} onClick={() => onSelectNode(node.title)}>
                <NodeIcon size={30} weight="regular" />
                <strong>{t(node.titleKey)}</strong>
                <small>{t(node.typeKey)}</small>
              </button>
              <div className="node-detail">
                <span>ID&nbsp; n{index + 1}_{node.type.toLowerCase().slice(0, 3)}</span>
                {node.detail.map((line) => {
                  const value = typeof line === "string" ? line : t(line.key);
                  return <span key={value}>{value}</span>;
                })}
              </div>
              {index < dagNodes.length - 1 && (
                <ArrowRight className="dag-arrow" size={28} weight="thin" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
