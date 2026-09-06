import { X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { IconButton } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { getOperator } from "./nodeCatalog.js";

function listValue(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function parseList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function Field({ id, label, hint, children }) {
  return (
    <div className="workflow-inspector-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

function SourceConfig({ node, draft, update }) {
  const { t } = useI18n();
  const sources = draft.specification.sources ?? [];
  const selected = sources.find((source) => source.id === node.config?.sourceKey);
  return (
    <Field id={`source-${node.id}`} label={t("workflowEditor.inspector.source")} hint={t("workflowEditor.inspector.sourceHint")}>
      <select id={`source-${node.id}`} value={node.config?.sourceKey ?? ""} onChange={(event) => update({ ...node.config, sourceKey: event.target.value })}>
        <option value="">{t("workflowEditor.inspector.selectSource")}</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>{source.id} · {source.target?.logicalSubgraphId ?? source.kind ?? "subgraph"}</option>
        ))}
      </select>
      {selected && <div className="workflow-inspector-evidence">{selected.target?.logicalSubgraphId ?? selected.id}<br />{selected.dataNetwork ?? "Existing Graph source"}</div>}
    </Field>
  );
}

function FilterConfig({ node, update }) {
  const { t } = useI18n();
  return (
    <Field id={`filter-${node.id}`} label={t("workflowEditor.inspector.window")} hint={t("workflowEditor.inspector.windowHint")}>
      <select id={`filter-${node.id}`} value={node.config?.window ?? "run.window.completeUtcDays"} onChange={(event) => update({ ...node.config, window: event.target.value })}>
        <option value="run.window.completeUtcDays">{t("workflowEditor.inspector.completeUtcDays")}</option>
      </select>
    </Field>
  );
}

function MapConfig({ node, update }) {
  const { t } = useI18n();
  const mapping = node.config?.mapping ?? {};
  const entries = Object.entries(mapping);
  return (
    <div className="workflow-inspector-section">
      <span className="workflow-inspector-subtitle">{t("workflowEditor.inspector.mapping")}</span>
      <p className="workflow-inspector-help">{t("workflowEditor.inspector.mappingHint")}</p>
      {entries.length === 0 && <p className="workflow-inspector-empty">{t("workflowEditor.inspector.noMapping")}</p>}
      {entries.map(([field, path]) => (
        <Field key={field} id={`mapping-${node.id}-${field}`} label={field}>
          <input
            id={`mapping-${node.id}-${field}`}
            value={path}
            onChange={(event) => update({ ...node.config, mapping: { ...mapping, [field]: event.target.value } })}
          />
        </Field>
      ))}
    </div>
  );
}

function AggregateConfig({ node, update }) {
  const { t } = useI18n();
  return (
    <>
      <Field id={`aggregate-group-${node.id}`} label={t("workflowEditor.inspector.groupBy")} hint={t("workflowEditor.inspector.listHint")}>
        <input id={`aggregate-group-${node.id}`} value={listValue(node.config?.groupBy)} onChange={(event) => update({ ...node.config, groupBy: parseList(event.target.value) })} />
      </Field>
      <Field id={`aggregate-measures-${node.id}`} label={t("workflowEditor.inspector.measures")} hint={t("workflowEditor.inspector.listHint")}>
        <input id={`aggregate-measures-${node.id}`} value={listValue(node.config?.measures)} onChange={(event) => update({ ...node.config, measures: parseList(event.target.value) })} />
      </Field>
    </>
  );
}

function UnionConfig({ node, update }) {
  const { t } = useI18n();
  return (
    <>
      <Field id={`union-schema-${node.id}`} label={t("workflowEditor.inspector.schema")}>
        <select id={`union-schema-${node.id}`} value={node.config?.schema ?? "canonical_swap"} onChange={(event) => update({ ...node.config, schema: event.target.value })}>
          <option value="canonical_swap">canonical_swap</option>
          <option value="canonical_rows">canonical_rows</option>
        </select>
      </Field>
      <Field id={`union-view-${node.id}`} label={t("workflowEditor.inspector.outputView")}>
        <select id={`union-view-${node.id}`} value={node.config?.outputView ?? "allActivity"} onChange={(event) => update({ ...node.config, outputView: event.target.value })}>
          <option value="allActivity">allActivity</option>
          <option value="rows">rows</option>
        </select>
      </Field>
    </>
  );
}

function JoinConfig({ node, update }) {
  const { t } = useI18n();
  return (
    <>
      <Field id={`join-keys-${node.id}`} label={t("workflowEditor.inspector.joinKeys")} hint={t("workflowEditor.inspector.listHint")}>
        <input id={`join-keys-${node.id}`} value={listValue(node.config?.keys)} onChange={(event) => update({ ...node.config, keys: parseList(event.target.value) })} />
      </Field>
      <Field id={`join-type-${node.id}`} label={t("workflowEditor.inspector.joinType")}>
        <select id={`join-type-${node.id}`} value={node.config?.type ?? "inner"} onChange={(event) => update({ ...node.config, type: event.target.value })}>
          <option value="inner">inner</option>
          <option value="left">left</option>
        </select>
      </Field>
      <Field id={`join-cardinality-${node.id}`} label={t("workflowEditor.inspector.cardinality")}>
        <select id={`join-cardinality-${node.id}`} value={node.config?.cardinality ?? "one_to_one_after_aggregate"} onChange={(event) => update({ ...node.config, cardinality: event.target.value })}>
          <option value="one_to_one_after_aggregate">one_to_one_after_aggregate</option>
          <option value="bounded_many_to_one">bounded_many_to_one</option>
        </select>
      </Field>
    </>
  );
}

function OutputConfig({ node, update }) {
  const { t } = useI18n();
  const views = node.config?.views ?? [];
  const toggle = (view) => update({ ...node.config, views: views.includes(view) ? views.filter((item) => item !== view) : [...views, view] });
  return (
    <fieldset className="workflow-inspector-section workflow-inspector-checks">
      <legend>{t("workflowEditor.inspector.views")}</legend>
      {["crossChain", "allActivity", "rows"].map((view) => (
        <label key={view}>
          <input type="checkbox" checked={views.includes(view)} onChange={() => toggle(view)} />
          <span>{view}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function NodeInspector({ editor }) {
  const { t } = useI18n();
  const node = editor.nodes.find((item) => item.id === editor.selectedNodeId)?.data?.node;
  const inspectorRef = useRef(null);
  const selectedNodeId = editor.selectedNodeId;
  const selectNode = editor.selectNode;

  useEffect(() => {
    if (!selectedNodeId) return undefined;
    const previouslyFocusedElement = document.activeElement;
    inspectorRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        selectNode(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(inspectorRef.current?.querySelectorAll("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])") ?? [])]
        .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocusedElement?.focus?.();
    };
  }, [selectedNodeId, selectNode]);

  if (!node) return null;
  const operator = getOperator(node.type);
  const update = (config) => editor.updateConfig(node.id, config);

  return (
    <div
      className="workflow-node-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) selectNode(null);
      }}
    >
      <section
        ref={inspectorRef}
        className="workflow-node-inspector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-node-inspector-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="workflow-inspector-header">
          <div>
            <span className="section-label">{t("workflowEditor.inspector.eyebrow")}</span>
            <strong id="workflow-node-inspector-title">{t(operator.labelKey)}</strong>
          </div>
          <IconButton label={t("common.close")} onClick={() => selectNode(null)}>
            <X size={17} weight="bold" aria-hidden="true" />
          </IconButton>
        </div>
        <p className="workflow-inspector-node-id">{node.id} · v{node.operatorVersion ?? "1"}</p>
        <div className="workflow-inspector-form">
          {node.type === "source" && <SourceConfig node={node} draft={editor.draft} update={update} />}
          {node.type === "filter" && <FilterConfig node={node} update={update} />}
          {node.type === "map" && <MapConfig node={node} update={update} />}
          {node.type === "aggregate" && <AggregateConfig node={node} update={update} />}
          {node.type === "union" && <UnionConfig node={node} update={update} />}
          {node.type === "join" && <JoinConfig node={node} update={update} />}
          {node.type === "output" && <OutputConfig node={node} update={update} />}
        </div>
      </section>
    </div>
  );
}
