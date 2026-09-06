import {
  ArrowsClockwise,
  BracketsCurly,
  ChartBar,
  Database,
  Funnel,
  GitMerge,
  Plus,
  Stack,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { operatorCatalog, templateCatalog } from "./nodeCatalog.js";

const paletteIcons = {
  source: Database,
  filter: Funnel,
  map: ArrowsClockwise,
  aggregate: ChartBar,
  union: Stack,
  join: GitMerge,
  output: BracketsCurly,
};

function PaletteIcon({ type }) {
  const Icon = paletteIcons[type] ?? ArrowsClockwise;
  return <Icon size={16} weight="bold" aria-hidden="true" />;
}

function PaletteItem({ item, kind, onInsert }) {
  const { t } = useI18n();
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const label = t(item.labelKey);
  const payload = JSON.stringify({ kind, id: kind === "operator" ? item.type : item.id });
  const tooltipId = `workflow-palette-tooltip-${kind}-${item.id ?? item.type}`;
  const getTooltipPosition = (event) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const anchor = event?.currentTarget?.getBoundingClientRect();
    const left = event?.clientX ? event.clientX + 14 : (anchor?.right ?? 0) + 12;
    const top = event?.clientY ? event.clientY + 14 : (anchor?.top ?? 0);
    return {
      left: Math.min(left, Math.max(12, viewportWidth - 276)),
      top: Math.min(top, Math.max(12, viewportHeight - 86)),
    };
  };
  const showTooltip = (event) => setTooltipPosition(getTooltipPosition(event));

  return (
    <div className="workflow-palette-item-wrap">
      <button
        className="workflow-palette-item"
        type="button"
        draggable="true"
        title={t("workflowEditor.palette.insert", { name: label })}
        aria-describedby={tooltipPosition ? tooltipId : undefined}
        data-palette-operator={item.type}
        onClick={() => onInsert(item)}
        onMouseEnter={showTooltip}
        onMouseMove={(event) => setTooltipPosition(getTooltipPosition(event))}
        onMouseLeave={() => setTooltipPosition(null)}
        onFocus={showTooltip}
        onBlur={() => setTooltipPosition(null)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("application/sprue-node", payload);
        }}
      >
        <span className="workflow-palette-item-icon"><PaletteIcon type={item.type} /></span>
        <span className="workflow-palette-item-copy">
          <strong>{label}</strong>
        </span>
        <Plus size={14} weight="bold" aria-hidden="true" />
      </button>
      {tooltipPosition && (
        <span
          id={tooltipId}
          className="workflow-palette-tooltip"
          role="tooltip"
          style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        >
          {t(item.descriptionKey)}
        </span>
      )}
    </div>
  );
}

export function NodePalette({ editor }) {
  const { t } = useI18n();

  return (
    <aside className="workflow-palette" aria-label={t("workflowEditor.palette.operators")}>
      <div className="workflow-palette-heading">
        <span className="section-label">{t("workflowEditor.palette.templates")}</span>
        <p>{t("workflowEditor.palette.dragHint")}</p>
      </div>
      <div className="workflow-palette-list">
        {templateCatalog.map((item) => (
          <PaletteItem key={item.id} item={item} kind="template" onInsert={() => editor.addTemplate(item.id)} />
        ))}
      </div>
      <div className="workflow-palette-heading workflow-palette-heading-operators">
        <span className="section-label">{t("workflowEditor.palette.operators")}</span>
      </div>
      <div className="workflow-palette-list">
        {operatorCatalog.map((item) => (
          <PaletteItem key={item.type} item={item} kind="operator" onInsert={() => editor.addOperator(item.type)} />
        ))}
      </div>
    </aside>
  );
}
