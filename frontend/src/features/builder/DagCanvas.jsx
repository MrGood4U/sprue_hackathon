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

const iconByName = {
  calendar: CalendarBlank,
  chart: ChartLineUp,
  code: Code,
  database: Database,
  funnel: Funnel,
  user: UserCircle,
};

export function DagCanvas({ onSelectNode }) {
  return (
    <main className="dag-canvas" aria-label="Generated data workflow">
      <div className="dag-flow">
        {dagNodes.map((node, index) => {
          const NodeIcon = iconByName[node.icon];
          return (
            <div className="dag-unit" key={node.title}>
              <button className={`dag-node dag-${node.accent}`} onClick={() => onSelectNode(node.title)}>
                <NodeIcon size={30} weight="regular" />
                <strong>{node.title}</strong>
                <small>{node.type}</small>
              </button>
              <div className="node-detail">
                <span>ID&nbsp; n{index + 1}_{node.type.toLowerCase().slice(0, 3)}</span>
                {node.detail.map((line) => <span key={line}>{line}</span>)}
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
