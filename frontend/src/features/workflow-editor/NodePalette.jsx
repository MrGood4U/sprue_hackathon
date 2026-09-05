import { Database, Function as FunctionIcon, Plus, Stack } from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { operatorCatalog, templateCatalog } from "./nodeCatalog.js";

const paletteIcons = {
  source: Database,
  union: Stack,
  join: FunctionIcon,
  output: FunctionIcon,
};

function PaletteIcon({ type }) {
  const Icon = paletteIcons[type] ?? FunctionIcon;
  return <Icon size={16} weight="bold" aria-hidden="true" />;
}

function PaletteItem({ item, kind, onInsert }) {
  const { t } = useI18n();
  const label = t(item.labelKey);
  const payload = JSON.stringify({ kind, id: kind === "operator" ? item.type : item.id });

  return (
    <button
      className="workflow-palette-item"
      type="button"
      draggable="true"
      title={t("workflowEditor.palette.insert", { name: label })}
      onClick={() => onInsert(item)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/sprue-node", payload);
      }}
    >
      <span className="workflow-palette-item-icon"><PaletteIcon type={item.type} /></span>
      <span className="workflow-palette-item-copy">
        <strong>{label}</strong>
        <small>{t(item.descriptionKey)}</small>
      </span>
      <Plus size={14} weight="bold" aria-hidden="true" />
    </button>
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
