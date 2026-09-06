import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui/Button.jsx";
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

function SourceConfig({ node, draft, update, mode, onModeChange }) {
  const { t } = useI18n();
  const [lookupMode, setLookupMode] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [networkSlug, setNetworkSlug] = useState("");
  const [identifierType, setIdentifierType] = useState("subgraph");
  const [identifier, setIdentifier] = useState("");
  const sources = draft.specification.sources ?? [];
  const selected = sources.find((source) => source.id === node.config?.sourceKey);

  return (
    <div className="workflow-source-config">
      <div className="workflow-source-mode-group">
        <span className="workflow-inspector-subtitle">{t("workflowEditor.inspector.sourceMode")}</span>
        <div className="workflow-source-mode" role="group" aria-label={t("workflowEditor.inspector.sourceMode")}>
          <button
            type="button"
            className={mode === "discovered" ? "is-active" : ""}
            aria-pressed={mode === "discovered"}
            onClick={() => onModeChange("discovered")}
          >
            {t("workflowEditor.inspector.discoveredSources")}
          </button>
          <button
            type="button"
            className={mode === "add" ? "is-active" : ""}
            aria-pressed={mode === "add"}
            onClick={() => onModeChange("add")}
          >
            {t("workflowEditor.inspector.addExistingSource")}
          </button>
        </div>
      </div>

      {mode === "discovered" ? (
        <Field id={`source-${node.id}`} label={t("workflowEditor.inspector.source")} hint={t("workflowEditor.inspector.sourceHint")}>
          <select id={`source-${node.id}`} value={node.config?.sourceKey ?? ""} onChange={(event) => update({ ...node.config, sourceKey: event.target.value })}>
            <option value="">{t("workflowEditor.inspector.selectSource")}</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>{source.id} · {source.target?.logicalSubgraphId ?? source.kind ?? "subgraph"}</option>
            ))}
          </select>
          {selected && (
            <div className="workflow-inspector-evidence">
              {selected.target?.logicalSubgraphId ?? selected.id}
              <br />
              {selected.dataNetwork ?? t("workflowEditor.inspector.existingSourceEvidence")}
            </div>
          )}
        </Field>
      ) : (
        <div className="workflow-source-add">
          <p className="workflow-inspector-help">{t("workflowEditor.inspector.addExistingHint")}</p>
          <div className="workflow-source-lookup-tabs" role="tablist" aria-label={t("workflowEditor.inspector.lookupMode")}>
            <button
              type="button"
              role="tab"
              aria-selected={lookupMode === "search"}
              aria-controls={`source-search-${node.id}`}
              className={lookupMode === "search" ? "is-active" : ""}
              onClick={() => setLookupMode("search")}
            >
              {t("workflowEditor.inspector.searchSource")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lookupMode === "id"}
              aria-controls={`source-id-${node.id}`}
              className={lookupMode === "id" ? "is-active" : ""}
              onClick={() => setLookupMode("id")}
            >
              {t("workflowEditor.inspector.addById")}
            </button>
          </div>

          {lookupMode === "search" ? (
            <div id={`source-search-${node.id}`} className="workflow-source-lookup-panel" role="tabpanel">
              <Field id={`source-query-${node.id}`} label={t("workflowEditor.inspector.searchQuery")}>
                <input
                  id={`source-query-${node.id}`}
                  value={searchQuery}
                  placeholder={t("workflowEditor.inspector.searchQueryPlaceholder")}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </Field>
              <Field id={`source-network-${node.id}`} label={t("workflowEditor.inspector.networkSlug")}>
                <input
                  id={`source-network-${node.id}`}
                  value={networkSlug}
                  placeholder={t("workflowEditor.inspector.networkSlugPlaceholder")}
                  onChange={(event) => setNetworkSlug(event.target.value)}
                />
              </Field>
              <Button type="button" disabled>{t("workflowEditor.inspector.searchGraph")}</Button>
            </div>
          ) : (
            <div id={`source-id-${node.id}`} className="workflow-source-lookup-panel" role="tabpanel">
              <Field id={`source-id-type-${node.id}`} label={t("workflowEditor.inspector.identifierType")}>
                <select id={`source-id-type-${node.id}`} value={identifierType} onChange={(event) => setIdentifierType(event.target.value)}>
                  <option value="subgraph">{t("workflowEditor.inspector.subgraphId")}</option>
                  <option value="deployment">{t("workflowEditor.inspector.deploymentId")}</option>
                  <option value="ipfs">{t("workflowEditor.inspector.ipfsCid")}</option>
                </select>
              </Field>
              <Field id={`source-identifier-${node.id}`} label={t("workflowEditor.inspector.identifier")}>
                <input
                  id={`source-identifier-${node.id}`}
                  value={identifier}
                  placeholder={t("workflowEditor.inspector.identifierPlaceholder")}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              </Field>
              <Button type="button" disabled>{t("workflowEditor.inspector.verifySource")}</Button>
            </div>
          )}

          <div className="workflow-source-unavailable" role="status">
            {t("workflowEditor.inspector.discoveryUnavailable")}
          </div>
        </div>
      )}
    </div>
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

function cloneConfig(config) {
  if (typeof structuredClone === "function") return structuredClone(config ?? {});
  return JSON.parse(JSON.stringify(config ?? {}));
}

export function NodeInspector({ editor, nodeId, onClose }) {
  const { t } = useI18n();
  const node = editor.nodes.find((item) => item.id === nodeId)?.data?.node;
  const inspectorRef = useRef(null);
  const [draftConfig, setDraftConfig] = useState({});
  const [sourceMode, setSourceMode] = useState("discovered");

  useEffect(() => {
    if (nodeId) {
      setDraftConfig(cloneConfig(node?.config));
      setSourceMode("discovered");
    }
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return undefined;
    const previouslyFocusedElement = document.activeElement;
    inspectorRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
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
  }, [nodeId, onClose]);

  if (!node) return null;
  const operator = getOperator(node.type);
  const draftNode = { ...node, config: draftConfig };
  const update = (config) => setDraftConfig(config);
  const canConfirm = node.type !== "source" || sourceMode === "discovered";
  const confirm = () => {
    if (!canConfirm) return;
    editor.updateConfig(node.id, draftConfig);
    onClose();
  };

  return (
    <div
      className="workflow-node-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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
          <IconButton label={t("common.close")} onClick={onClose}>
            <X size={17} weight="bold" aria-hidden="true" />
          </IconButton>
        </div>
        <p className="workflow-inspector-node-id">{node.id} · v{node.operatorVersion ?? "1"}</p>
        <div className="workflow-inspector-form">
          {node.type === "source" && (
            <SourceConfig
              node={draftNode}
              draft={editor.draft}
              update={update}
              mode={sourceMode}
              onModeChange={setSourceMode}
            />
          )}
          {node.type === "filter" && <FilterConfig node={draftNode} update={update} />}
          {node.type === "map" && <MapConfig node={draftNode} update={update} />}
          {node.type === "aggregate" && <AggregateConfig node={draftNode} update={update} />}
          {node.type === "union" && <UnionConfig node={draftNode} update={update} />}
          {node.type === "join" && <JoinConfig node={draftNode} update={update} />}
          {node.type === "output" && <OutputConfig node={draftNode} update={update} />}
        </div>
        <div className="workflow-inspector-actions">
          <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="button" variant="primary" disabled={!canConfirm} onClick={confirm}>{t("common.confirm")}</Button>
        </div>
      </section>
    </div>
  );
}
