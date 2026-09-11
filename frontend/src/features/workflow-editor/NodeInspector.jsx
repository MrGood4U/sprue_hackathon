import { ArrowDown, ArrowUp, Check, CheckCircle, Copy, Plus, Trash, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import {copyText} from "../wallet/copyText.js";
import {
  conditionValueMode,
  createFilterCondition,
  createFilterConfig,
  deriveDirectInputFields,
  deriveFilterInputFields,
  editableFilterConfig,
  filterOperatorsForField,
  validateFilterConfig,
} from "./filterModel.js";
import {
  createMapDefinition,
  defaultMapFallbackValue,
  editableMapConfig,
  formatMapExpression,
  inspectMapExpression,
  mapExpressionEditor,
  mapExpressionFieldNames,
  mapExpressionForEditor,
  mapTransformsForField,
  validateMapConfig,
} from "./mapModel.js";
import {
  aggregateFieldsForOperation,
  aggregateOperations,
  createAggregateMeasure,
  editableAggregateConfig,
  validateAggregateConfig,
} from "./aggregateModel.js";
import { getOperator } from "./nodeCatalog.js";
import {createSortConfig, validateSortConfig} from "./sortModel.js";

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

const sourceScalarTypes = new Set(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date"]);

function sourceRecord(validation, entity, candidate) {
  const fields = entity.fields
    .filter((field) => !field.list && sourceScalarTypes.has(field.valueType))
    .map((field) => ({
      name: field.path,
      type: field.valueType,
      nullable: field.nullable,
      unit: null,
    }));
  const targetType = validation.reference.type === "subgraph_id"
    ? "logical_subgraph_id"
    : validation.reference.type === "deployment_id"
      ? "deployment_id"
      : "manifest_ipfs_cid";
  return {
    id: validation.sourceId,
    provider: "the_graph",
    kind: "subgraph",
    adapterVersion: "planning",
    dataNetwork: validation.dataNetwork,
    queryEntity: entity.queryEntity,
    fieldBindings: [],
    auxiliaryFieldBindings: [],
    outputSchema: {type: "array", items: {type: "object"}, fields},
    evidenceStatus: validation.admissionStatus,
    displayName: candidate?.displayName ?? validation.displayName,
    logicalSubgraphId: candidate?.logicalSubgraphId
      ?? (validation.reference.type === "subgraph_id" ? validation.reference.id : null),
    manifestIpfsCid: candidate?.manifestIpfsCid
      ?? (validation.reference.type === "ipfs_hash" ? validation.reference.id : null),
    target: {
      type: targetType,
      id: validation.reference.id,
      logicalSubgraphId: candidate?.logicalSubgraphId
        ?? (validation.reference.type === "subgraph_id" ? validation.reference.id : null),
      manifestIpfsCid: candidate?.manifestIpfsCid
        ?? (validation.reference.type === "ipfs_hash" ? validation.reference.id : null),
    },
    accessSelection: {
      mode: "customer_api_key",
      providerCredentialId: validation.access.credentialId,
    },
    schemaEvidence: {
      schemaHash: validation.schemaHash,
      schemaBytes: validation.schemaBytes,
      queryEntitySource: validation.queryEntitySource,
      observedAt: validation.observedAt,
      activity: validation.activity,
    },
  };
}

function SourceConfig({ node, draft, update, mode, onModeChange, sourceDiscovery, onVerifiedSource }) {
  const { t } = useI18n();
  const [lookupMode, setLookupMode] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [networkSlug, setNetworkSlug] = useState("");
  const [identifierType, setIdentifierType] = useState("subgraph");
  const [identifier, setIdentifier] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchState, setSearchState] = useState("idle");
  const [validation, setValidation] = useState(null);
  const [validatedCandidate, setValidatedCandidate] = useState(null);
  const [queryEntity, setQueryEntity] = useState("");
  const [errorCode, setErrorCode] = useState(null);
  const [queryCopyStatus, setQueryCopyStatus] = useState("idle");
  const requestRef = useRef(null);
  const sources = draft.specification.sources ?? [];
  const sourceId = node.config?.sourceId ?? node.config?.sourceKey ?? "";
  const selected = sources.find((source) => source.id === sourceId);
  const queryPlan = node.config?.queryPlan ?? selected?.queryPlan ?? null;
  const pushedOperations = (queryPlan?.pushedOperations ?? [])
    .filter((operation) => operation.operator === "filter" || operation.operator === "sort");

  const selectSource = (value) => {
    const { sourceKey: _legacySourceKey, ...config } = node.config ?? {};
    const source = sources.find((item) => item.id === value);
    update({
      ...config,
      sourceId: value,
      queryEntity: source?.queryEntity ?? config.queryEntity,
      fieldBindings: structuredClone(source?.fieldBindings ?? config.fieldBindings ?? []),
      auxiliaryFieldBindings: structuredClone(source?.auxiliaryFieldBindings ?? config.auxiliaryFieldBindings ?? []),
      queryPlan: value === sourceId ? config.queryPlan : structuredClone(source?.queryPlan ?? null),
    });
  };

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => setQueryCopyStatus("idle"), [queryPlan?.document]);

  const copyQuery = async () => {
    if (!queryPlan?.document || queryCopyStatus === "copying") return;
    setQueryCopyStatus("copying");
    try {
      await copyText(queryPlan.document);
      setQueryCopyStatus("copied");
    } catch {
      setQueryCopyStatus("failed");
    }
  };

  const resetLookup = () => {
    requestRef.current?.abort();
    setSearchState("idle");
    setSearchResults([]);
    setValidation(null);
    setValidatedCandidate(null);
    setQueryEntity("");
    setErrorCode(null);
    onVerifiedSource(null);
  };

  const selectValidatedEntity = (result, entityName, candidate) => {
    const entity = result.entities.find((item) => item.queryEntity === entityName);
    if (!entity) {
      onVerifiedSource(null);
      return;
    }
    const source = sourceRecord(result, entity, candidate);
    if (source.outputSchema.fields.length === 0) {
      onVerifiedSource(null);
      return;
    }
    onVerifiedSource(source);
    update({
      sourceId: source.id,
      queryEntity: entity.queryEntity,
      fieldBindings: [],
      auxiliaryFieldBindings: [],
      accessSelection: source.accessSelection,
      queryPlan: null,
    });
  };

  const verify = async (reference, candidate = null) => {
    if (!sourceDiscovery?.validate || !reference?.id?.trim() || searchState === "validating") return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSearchState("validating");
    setErrorCode(null);
    setValidation(null);
    setValidatedCandidate(candidate);
    onVerifiedSource(null);
    try {
      const result = await sourceDiscovery.validate({
        reference,
        network: networkSlug.trim() || null,
      }, controller.signal);
      if (controller.signal.aborted) return;
      const firstEntity = result.entities.find((entity) => entity.fields.some((field) => !field.list && sourceScalarTypes.has(field.valueType)));
      if (!firstEntity) throw new Error("GRAPH_SOURCE_NO_SCALAR_FIELDS");
      setValidation(result);
      setValidatedCandidate(candidate);
      setQueryEntity(firstEntity.queryEntity);
      setSearchState("verified");
      selectValidatedEntity(result, firstEntity.queryEntity, candidate);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setSearchState("error");
      setErrorCode(error?.message ?? "GRAPH_SOURCE_API_UNAVAILABLE");
    }
  };

  const search = async () => {
    if (!sourceDiscovery?.search || searchState === "searching" || searchQuery.trim().length < 2) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSearchState("searching");
    setErrorCode(null);
    setValidation(null);
    setValidatedCandidate(null);
    onVerifiedSource(null);
    try {
      const result = await sourceDiscovery.search({
        query: searchQuery.trim(),
        network: networkSlug.trim() || null,
      }, controller.signal);
      if (controller.signal.aborted) return;
      setSearchResults(result.candidates);
      setSearchState("results");
    } catch (error) {
      if (error?.name === "AbortError") return;
      setSearchResults([]);
      setSearchState("error");
      setErrorCode(error?.message ?? "GRAPH_SOURCE_API_UNAVAILABLE");
    }
  };

  const errorMessage = errorCode === "GRAPH_CREDENTIAL_REQUIRED"
    ? t("workflowEditor.inspector.sourceErrorCredential")
    : errorCode === "GRAPH_SOURCE_VERIFICATION_FAILED" || errorCode === "GRAPH_SOURCE_NO_SCALAR_FIELDS"
      ? t("workflowEditor.inspector.sourceErrorVerification")
      : errorCode === "INVALID_REQUEST"
        ? t("workflowEditor.inspector.sourceErrorInput")
        : t("workflowEditor.inspector.sourceErrorUnavailable");

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
        <div className="workflow-source-discovered">
          <Field id={`source-${node.id}`} label={t("workflowEditor.inspector.source")} hint={t("workflowEditor.inspector.sourceHint")}>
            <select id={`source-${node.id}`} value={sourceId} onChange={(event) => selectSource(event.target.value)}>
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
          {sourceId && (queryPlan ? (
            <section className="workflow-source-query" aria-labelledby={`source-query-title-${node.id}`}>
              <div className="workflow-source-query-header">
                <div>
                  <span className="workflow-inspector-subtitle" id={`source-query-title-${node.id}`}>{t("workflowEditor.inspector.graphqlQuery")}</span>
                  <small>{t("workflowEditor.inspector.graphqlQueryAgentAuthored")}</small>
                </div>
                <IconButton
                  label={t(queryCopyStatus === "copied"
                    ? "workflowEditor.inspector.graphqlCopied"
                    : queryCopyStatus === "failed"
                      ? "workflowEditor.inspector.graphqlRetryCopy"
                      : "workflowEditor.inspector.graphqlCopy")}
                  disabled={queryCopyStatus === "copying"}
                  onClick={copyQuery}
                >
                  {queryCopyStatus === "copied" ? <Check size={17} aria-hidden="true" />
                    : queryCopyStatus === "failed" ? <WarningCircle size={17} aria-hidden="true" />
                      : <Copy size={17} aria-hidden="true" />}
                </IconButton>
              </div>
              <pre className="workflow-source-query-code" tabIndex="0"><code>{queryPlan.document}</code></pre>
              <div className="workflow-source-query-meta">
                <span>{t("workflowEditor.inspector.graphqlPagination", {
                  pageSize: queryPlan.pagination.pageSize,
                  maxRows: queryPlan.pagination.maxRows,
                })}</span>
                <span className={`workflow-source-query-copy is-${queryCopyStatus}`} role="status" aria-live="polite">
                  {queryCopyStatus === "copied" ? t("workflowEditor.inspector.graphqlCopied")
                    : queryCopyStatus === "failed" ? t("workflowEditor.inspector.graphqlCopyFailed") : ""}
                </span>
              </div>
              {pushedOperations.length > 0 && <div className="workflow-source-pushdowns">
                <span className="workflow-inspector-subtitle">{t("workflowEditor.inspector.graphqlPushdowns")}</span>
                <ul>
                  {pushedOperations.map((operation) => (
                    <li key={`${operation.nodeRole}:${operation.operator}`}>
                      <code>{operation.operator}</code>
                      <span>{operation.nodeRole}</span>
                      <p>{operation.description}</p>
                    </li>
                  ))}
                </ul>
              </div>}
            </section>
          ) : (
            <div className="workflow-source-query-empty" role="status">
              {t("workflowEditor.inspector.graphqlQueryUnavailable")}
            </div>
          ))}
        </div>
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
              onClick={() => {
                resetLookup();
                setLookupMode("search");
              }}
            >
              {t("workflowEditor.inspector.searchSource")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lookupMode === "id"}
              aria-controls={`source-id-${node.id}`}
              className={lookupMode === "id" ? "is-active" : ""}
              onClick={() => {
                resetLookup();
                setLookupMode("id");
              }}
            >
              {t("workflowEditor.inspector.addById")}
            </button>
          </div>

          {lookupMode === "search" ? (
            <form
              id={`source-search-${node.id}`}
              className="workflow-source-lookup-panel"
              role="tabpanel"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <Field id={`source-query-${node.id}`} label={t("workflowEditor.inspector.searchQuery")}>
                <input
                  id={`source-query-${node.id}`}
                  value={searchQuery}
                  placeholder={t("workflowEditor.inspector.searchQueryPlaceholder")}
                  onChange={(event) => {
                    resetLookup();
                    setSearchQuery(event.target.value);
                  }}
                />
              </Field>
              <Field id={`source-network-${node.id}`} label={t("workflowEditor.inspector.networkSlug")}>
                <input
                  id={`source-network-${node.id}`}
                  value={networkSlug}
                  placeholder={t("workflowEditor.inspector.networkSlugPlaceholder")}
                  onChange={(event) => {
                    resetLookup();
                    setNetworkSlug(event.target.value);
                  }}
                />
              </Field>
              <Button
                type="submit"
                disabled={!sourceDiscovery?.search || searchQuery.trim().length < 2 || ["searching", "validating"].includes(searchState)}
              >
                {searchState === "searching" ? t("workflowEditor.inspector.searchingGraph") : t("workflowEditor.inspector.searchGraph")}
              </Button>
              {searchState === "results" && searchResults.length === 0 && (
                <div className="workflow-source-feedback" role="status">{t("workflowEditor.inspector.sourceNoResults")}</div>
              )}
              {searchResults.length > 0 && (
                <div className="workflow-source-results" aria-label={t("workflowEditor.inspector.sourceResults")}>
                  {searchResults.map((candidate) => (
                    <div className="workflow-source-result" key={candidate.manifestIpfsCid}>
                      <div>
                        <strong>{candidate.displayName}</strong>
                        <span>{candidate.logicalSubgraphId ?? candidate.manifestIpfsCid}</span>
                        <small>{candidate.totalQueryCount30d === null
                          ? t("workflowEditor.inspector.sourceActivityUnknown")
                          : t("workflowEditor.inspector.sourceActivity", {count: candidate.totalQueryCount30d})}</small>
                      </div>
                      <Button
                        type="button"
                        disabled={searchState === "validating"}
                        onClick={() => verify(candidate.reference, candidate)}
                      >
                        {searchState === "validating" && validatedCandidate?.manifestIpfsCid === candidate.manifestIpfsCid
                          ? t("workflowEditor.inspector.verifyingSource")
                          : t("workflowEditor.inspector.verifySource")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </form>
          ) : (
            <form
              id={`source-id-${node.id}`}
              className="workflow-source-lookup-panel"
              role="tabpanel"
              onSubmit={(event) => {
                event.preventDefault();
                void verify({
                  type: identifierType === "subgraph" ? "subgraph_id" : identifierType === "deployment" ? "deployment_id" : "ipfs_hash",
                  id: identifier.trim(),
                });
              }}
            >
              <Field id={`source-id-type-${node.id}`} label={t("workflowEditor.inspector.identifierType")}>
                <select
                  id={`source-id-type-${node.id}`}
                  value={identifierType}
                  onChange={(event) => {
                    resetLookup();
                    setIdentifierType(event.target.value);
                  }}
                >
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
                  onChange={(event) => {
                    resetLookup();
                    setIdentifier(event.target.value);
                  }}
                />
              </Field>
              <Button
                type="submit"
                disabled={!sourceDiscovery?.validate || !identifier.trim() || ["searching", "validating"].includes(searchState)}
              >
                {searchState === "validating" ? t("workflowEditor.inspector.verifyingSource") : t("workflowEditor.inspector.verifySource")}
              </Button>
            </form>
          )}

          {!sourceDiscovery && (
            <div className="workflow-source-unavailable" role="status">{t("workflowEditor.inspector.discoveryUnavailable")}</div>
          )}
          {searchState === "error" && (
            <div className="workflow-source-feedback is-error" role="alert">{errorMessage}</div>
          )}
          {validation && (
            <div className="workflow-source-verification" role="status">
              <div className="workflow-source-verification-title">
                <CheckCircle size={18} weight="fill" aria-hidden="true" />
                <strong>{t("workflowEditor.inspector.sourceVerified")}</strong>
              </div>
              <span>{validatedCandidate?.displayName ?? validation.displayName}</span>
              <small>{validation.networkLabel ?? t("workflowEditor.inspector.sourceNetworkUnspecified")} · {validation.schemaHash.slice(0, 19)}…</small>
              <Field id={`source-entity-${node.id}`} label={t("workflowEditor.inspector.queryEntity")} hint={t("workflowEditor.inspector.queryEntityHint")}>
                <select
                  id={`source-entity-${node.id}`}
                  value={queryEntity}
                  onChange={(event) => {
                    setQueryEntity(event.target.value);
                    selectValidatedEntity(validation, event.target.value, validatedCandidate);
                  }}
                >
                  {validation.entities.map((entity) => (
                    <option key={entity.queryEntity} value={entity.queryEntity}>
                      {entity.queryEntity} · {entity.fields.filter((field) => !field.list && sourceScalarTypes.has(field.valueType)).length} {t("workflowEditor.inspector.fields")}
                    </option>
                  ))}
                </select>
              </Field>
              <p>{validation.activity
                ? t("workflowEditor.inspector.sourceVerifiedActivity", {count: validation.activity.totalQueryCount30d})
                : t("workflowEditor.inspector.sourceVerifiedNoActivity")}</p>
              <p>{t("workflowEditor.inspector.sourceAdmissionPending")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function nextConditionShape(condition, field, operator) {
  const base = {field: field?.name ?? condition.field, operator};
  const mode = conditionValueMode(operator);
  if (mode === "none") return base;
  if (mode === "range") {
    return {...base, values: Array.isArray(condition.values) && condition.values.length === 2 ? condition.values : ["", ""]};
  }
  if (mode === "list") {
    return {...base, values: Array.isArray(condition.values) && condition.values.length > 0 ? condition.values : [""]};
  }
  return {
    ...base,
    value:
      field?.type === "boolean"
        ? typeof condition.value === "boolean"
          ? condition.value
          : false
        : typeof condition.value === "string"
          ? condition.value
          : "",
  };
}

function FilterValueInput({nodeId, index, condition, field, updateCondition}) {
  const {t} = useI18n();
  const mode = conditionValueMode(condition.operator);
  const inputId = `filter-${nodeId}-value-${index}`;
  if (mode === "none") return null;
  if (mode === "range") {
    return (
      <div className="workflow-filter-range">
        <Field id={`${inputId}-minimum`} label={t("workflowEditor.inspector.filterMinimum")}>
          <input
            id={`${inputId}-minimum`}
            type={field?.type === "date" ? "date" : "text"}
            inputMode={field?.type === "integer" || field?.type === "decimal" ? "decimal" : undefined}
            value={condition.values?.[0] ?? ""}
            onChange={(event) => updateCondition({...condition, values: [event.target.value, condition.values?.[1] ?? ""]})}
          />
        </Field>
        <Field id={`${inputId}-maximum`} label={t("workflowEditor.inspector.filterMaximum")}>
          <input
            id={`${inputId}-maximum`}
            type={field?.type === "date" ? "date" : "text"}
            inputMode={field?.type === "integer" || field?.type === "decimal" ? "decimal" : undefined}
            value={condition.values?.[1] ?? ""}
            onChange={(event) => updateCondition({...condition, values: [condition.values?.[0] ?? "", event.target.value]})}
          />
        </Field>
      </div>
    );
  }
  if (mode === "list") {
    return (
      <Field id={inputId} label={t("workflowEditor.inspector.filterValues")} hint={t("workflowEditor.inspector.filterValuesHint")}>
        <input
          id={inputId}
          value={(condition.values ?? []).join(", ")}
          onChange={(event) => updateCondition({...condition, values: event.target.value.split(",").map((value) => value.trim())})}
        />
      </Field>
    );
  }
  if (field?.type === "boolean") {
    return (
      <Field id={inputId} label={t("workflowEditor.inspector.filterValue")}>
        <select id={inputId} value={String(condition.value)} onChange={(event) => updateCondition({...condition, value: event.target.value === "true"})}>
          <option value="true">{t("common.yes")}</option>
          <option value="false">{t("common.no")}</option>
        </select>
      </Field>
    );
  }
  return (
    <Field id={inputId} label={t("workflowEditor.inspector.filterValue")} hint={field?.type === "timestamp" ? t("workflowEditor.inspector.filterTimestampHint") : null}>
      <input
        id={inputId}
        type={field?.type === "date" ? "date" : "text"}
        inputMode={field?.type === "integer" || field?.type === "decimal" ? "decimal" : undefined}
        value={condition.value ?? ""}
        onChange={(event) => updateCondition({...condition, value: event.target.value})}
      />
    </Field>
  );
}

function FilterConfig({ node, update, fields, errors, legacyExpression, onReplaceLegacy }) {
  const { t } = useI18n();
  if (legacyExpression) {
    return (
      <div className="workflow-filter-legacy" role="alert">
        <strong>{t("workflowEditor.inspector.filterLegacyTitle")}</strong>
        <p>{t("workflowEditor.inspector.filterLegacyBody")}</p>
        <Button type="button" onClick={onReplaceLegacy}>{t("workflowEditor.inspector.filterReplace")}</Button>
      </div>
    );
  }
  const predicate = node.config?.predicate ?? createFilterConfig(fields).predicate;
  const updateCondition = (index, condition) => {
    const conditions = predicate.conditions.map((item, candidateIndex) => candidateIndex === index ? condition : item);
    update({predicate: {...predicate, conditions}});
  };
  const removeCondition = (index) => {
    update({predicate: {...predicate, conditions: predicate.conditions.filter((_, candidateIndex) => candidateIndex !== index)}});
  };
  const addCondition = () => {
    if (fields.length === 0 || predicate.conditions.length >= 32) return;
    update({predicate: {...predicate, conditions: [...predicate.conditions, createFilterCondition(fields[0])]}});
  };

  return (
    <div className="workflow-filter-config">
      <p className="workflow-inspector-help">{t("workflowEditor.inspector.filterHint")}</p>
      {fields.length === 0 ? (
        <div className="workflow-filter-empty" role="status">{t("workflowEditor.inspector.filterNoFields")}</div>
      ) : (
        <>
          <Field id={`filter-${node.id}-combinator`} label={t("workflowEditor.inspector.filterMatch")}>
            <select
              id={`filter-${node.id}-combinator`}
              value={predicate.combinator}
              onChange={(event) => update({predicate: {...predicate, combinator: event.target.value}})}
            >
              <option value="and">{t("workflowEditor.inspector.filterMatchAll")}</option>
              <option value="or">{t("workflowEditor.inspector.filterMatchAny")}</option>
            </select>
          </Field>
          <div className="workflow-filter-conditions">
            {predicate.conditions.map((condition, index) => {
              const field = fields.find((candidate) => candidate.name === condition.field);
              const operators = field ? filterOperatorsForField(field) : [];
              const error = errors.find((candidate) => candidate.conditionIndex === index);
              return (
                <fieldset className={`workflow-filter-condition${error ? " is-invalid" : ""}`} key={index}>
                  <legend>{t("workflowEditor.inspector.filterCondition", {number: index + 1})}</legend>
                  <div className="workflow-filter-condition-header">
                    <Field id={`filter-${node.id}-field-${index}`} label={t("workflowEditor.inspector.filterField")}>
                      <select
                        id={`filter-${node.id}-field-${index}`}
                        value={condition.field}
                        aria-invalid={error?.code === "FILTER_FIELD_UNKNOWN" || undefined}
                        onChange={(event) => {
                          const nextField = fields.find((candidate) => candidate.name === event.target.value);
                          const nextOperator = filterOperatorsForField(nextField).includes(condition.operator) ? condition.operator : "eq";
                          updateCondition(index, nextConditionShape(condition, nextField, nextOperator));
                        }}
                      >
                        {!field && condition.field && <option value={condition.field}>{condition.field} · {t("workflowEditor.inspector.filterMissingField")}</option>}
                        {fields.map((candidate) => <option value={candidate.name} key={candidate.name}>{candidate.name} · {candidate.type}</option>)}
                      </select>
                    </Field>
                    <Field id={`filter-${node.id}-operator-${index}`} label={t("workflowEditor.inspector.filterOperator")}>
                      <select
                        id={`filter-${node.id}-operator-${index}`}
                        value={condition.operator}
                        disabled={!field}
                        onChange={(event) => updateCondition(index, nextConditionShape(condition, field, event.target.value))}
                      >
                        {!operators.includes(condition.operator) && <option value={condition.operator}>{condition.operator}</option>}
                        {operators.map((operator) => (
                          <option value={operator} key={operator}>{t(`workflowEditor.inspector.filterOperator.${operator}`)}</option>
                        ))}
                      </select>
                    </Field>
                    <IconButton label={t("workflowEditor.inspector.filterRemove")} onClick={() => removeCondition(index)}>
                      <Trash size={17} aria-hidden="true" />
                    </IconButton>
                  </div>
                  <FilterValueInput nodeId={node.id} index={index} condition={condition} field={field} updateCondition={(value) => updateCondition(index, value)} />
                  {error && <p className="workflow-filter-error" role="alert">{t(`workflowEditor.inspector.filterError.${error.code}`)}</p>}
                </fieldset>
              );
            })}
          </div>
          <Button type="button" icon={Plus} disabled={predicate.conditions.length >= 32} onClick={addCondition}>
            {t("workflowEditor.inspector.filterAdd")}
          </Button>
        </>
      )}
      {errors.some((error) => error.conditionIndex === null) && (
        <p className="workflow-filter-error" role="alert">
          {t(`workflowEditor.inspector.filterError.${errors.find((error) => error.conditionIndex === null).code}`)}
        </p>
      )}
    </div>
  );
}

function SortConfig({node, update, fields, errors}) {
  const {t} = useI18n();
  const config = node.config && Array.isArray(node.config.orderBy)
    ? node.config
    : createSortConfig(fields);
  const orderBy = config.orderBy;
  const usedFields = new Set(orderBy.map((ordering) => ordering.field));
  const availableField = fields.find((field) => !usedFields.has(field.name));
  const updateOrdering = (index, ordering) => {
    update({...config, orderBy: orderBy.map((item, candidateIndex) => candidateIndex === index ? ordering : item)});
  };
  const moveOrdering = (index, offset) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= orderBy.length) return;
    const next = [...orderBy];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    update({...config, orderBy: next});
  };
  const removeOrdering = (index) => {
    update({...config, orderBy: orderBy.filter((_, candidateIndex) => candidateIndex !== index)});
  };
  const addOrdering = () => {
    if (!availableField || orderBy.length >= 8) return;
    update({...config, orderBy: [...orderBy, {field: availableField.name, direction: "asc", nulls: "last"}]});
  };

  return (
    <div className="workflow-sort-config">
      <p className="workflow-inspector-help">{t("workflowEditor.inspector.sortHint")}</p>
      {fields.length === 0 ? (
        <div className="workflow-sort-empty" role="status">{t("workflowEditor.inspector.sortNoFields")}</div>
      ) : (
        <>
          <div className="workflow-sort-orderings">
            {orderBy.map((ordering, index) => {
              const field = fields.find((candidate) => candidate.name === ordering.field);
              const error = errors.find((candidate) => candidate.orderIndex === index);
              return (
                <fieldset className={`workflow-sort-ordering${error ? " is-invalid" : ""}`} key={`${ordering.field}-${index}`}>
                  <legend>{t("workflowEditor.inspector.sortPriority", {number: index + 1})}</legend>
                  <div className="workflow-sort-ordering-grid">
                    <Field id={`sort-${node.id}-field-${index}`} label={t("workflowEditor.inspector.sortField")}>
                      <select
                        id={`sort-${node.id}-field-${index}`}
                        value={ordering.field}
                        aria-invalid={error?.code === "SORT_FIELD_UNKNOWN" || error?.code === "SORT_FIELD_DUPLICATED" || undefined}
                        onChange={(event) => updateOrdering(index, {...ordering, field: event.target.value})}
                      >
                        {!field && ordering.field && <option value={ordering.field}>{ordering.field} · {t("workflowEditor.inspector.sortMissingField")}</option>}
                        {fields.map((candidate) => (
                          <option
                            value={candidate.name}
                            key={candidate.name}
                            disabled={usedFields.has(candidate.name) && candidate.name !== ordering.field}
                          >
                            {candidate.name} · {candidate.type}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id={`sort-${node.id}-direction-${index}`} label={t("workflowEditor.inspector.sortDirection")}>
                      <select
                        id={`sort-${node.id}-direction-${index}`}
                        value={ordering.direction}
                        onChange={(event) => updateOrdering(index, {...ordering, direction: event.target.value})}
                      >
                        <option value="asc">{t("workflowEditor.inspector.sortAscending")}</option>
                        <option value="desc">{t("workflowEditor.inspector.sortDescending")}</option>
                      </select>
                    </Field>
                    <Field id={`sort-${node.id}-nulls-${index}`} label={t("workflowEditor.inspector.sortNulls")}>
                      <select
                        id={`sort-${node.id}-nulls-${index}`}
                        value={ordering.nulls}
                        onChange={(event) => updateOrdering(index, {...ordering, nulls: event.target.value})}
                      >
                        <option value="last">{t("workflowEditor.inspector.sortNullsLast")}</option>
                        <option value="first">{t("workflowEditor.inspector.sortNullsFirst")}</option>
                      </select>
                    </Field>
                  </div>
                  <div className="workflow-sort-ordering-actions">
                    <IconButton type="button" label={t("workflowEditor.inspector.sortMoveUp")} disabled={index === 0} onClick={() => moveOrdering(index, -1)}>
                      <ArrowUp size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton type="button" label={t("workflowEditor.inspector.sortMoveDown")} disabled={index === orderBy.length - 1} onClick={() => moveOrdering(index, 1)}>
                      <ArrowDown size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton type="button" label={t("workflowEditor.inspector.sortRemove")} onClick={() => removeOrdering(index)}>
                      <Trash size={16} aria-hidden="true" />
                    </IconButton>
                  </div>
                  {error && <p className="workflow-sort-error" role="alert">{t(`workflowEditor.inspector.sortError.${error.code}`)}</p>}
                </fieldset>
              );
            })}
          </div>
          <Button type="button" icon={Plus} disabled={!availableField || orderBy.length >= 8} onClick={addOrdering}>
            {t("workflowEditor.inspector.sortAdd")}
          </Button>
        </>
      )}
      <Field id={`sort-${node.id}-limit`} label={t("workflowEditor.inspector.sortLimit")} hint={t("workflowEditor.inspector.sortLimitHint")}>
        <input
          id={`sort-${node.id}-limit`}
          type="number"
          min="1"
          max="10000"
          step="1"
          value={config.limit ?? ""}
          aria-invalid={errors.some((error) => error.code === "SORT_LIMIT_INVALID") || undefined}
          placeholder={t("workflowEditor.inspector.sortLimitPlaceholder")}
          onChange={(event) => update({...config, limit: event.target.value === "" ? null : Number(event.target.value)})}
        />
      </Field>
      {errors.some((error) => error.orderIndex === null) && (
        <p className="workflow-sort-error" role="alert">
          {t(`workflowEditor.inspector.sortError.${errors.find((error) => error.orderIndex === null).code}`)}
        </p>
      )}
    </div>
  );
}

function parseAdvancedMapExpression(text, fields) {
  try {
    const expression = JSON.parse(text);
    const inspection = inspectMapExpression(expression, fields);
    return inspection.error ? {expression, error: inspection.error} : {expression, field: inspection.field, error: null};
  } catch {
    return {expression: null, field: null, error: "MAP_EXPRESSION_JSON_INVALID"};
  }
}

function MapConfig({node, update, fields, errors, onPendingChange}) {
  const { t } = useI18n();
  const transformGroups = ["basic", "type", "time", "text", "null", "numeric"];
  const [advancedEditor, setAdvancedEditor] = useState(null);
  const isEditingAdvanced = advancedEditor !== null;

  useEffect(() => {
    onPendingChange?.(isEditingAdvanced);
    return () => onPendingChange?.(false);
  }, [isEditingAdvanced, onPendingChange]);

  useEffect(() => {
    setAdvancedEditor(null);
  }, [node.id]);

  if (node.config?.recipe) {
    return (
      <Field id={`map-recipe-${node.id}`} label={t("workflowEditor.inspector.recipe")}>
        <input id={`map-recipe-${node.id}`} value={node.config.recipe} readOnly />
      </Field>
    );
  }
  const config = Array.isArray(node.config?.fields) ? node.config : editableMapConfig(node.config);
  const definitions = config.fields ?? [];
  const addDefinition = () => {
    const definition = createMapDefinition(fields, definitions.map((item) => item.name));
    if (definition && definitions.length < 32) update({...config, fields: [...definitions, definition]});
  };
  const updateDefinition = (index, definition) => {
    update({...config, fields: definitions.map((item, candidateIndex) => candidateIndex === index ? definition : item)});
  };
  const removeDefinition = (index) => {
    if (advancedEditor?.index === index) setAdvancedEditor(null);
    update({...config, fields: definitions.filter((_, candidateIndex) => candidateIndex !== index)});
  };
  return (
    <div className="workflow-map-config">
      <p className="workflow-inspector-help">{t("workflowEditor.inspector.mappingHint")}</p>
      <Field id={`map-${node.id}-mode`} label={t("workflowEditor.inspector.mapMode")}>
        <select id={`map-${node.id}-mode`} value={config.mode} onChange={(event) => update({...config, mode: event.target.value})}>
          <option value="extend">{t("workflowEditor.inspector.mapModeExtend")}</option>
          <option value="project">{t("workflowEditor.inspector.mapModeProject")}</option>
        </select>
      </Field>
      <div className="workflow-map-schema" role="group" aria-label={t("workflowEditor.inspector.mapInputSchema")}>
        <span className="workflow-inspector-subtitle">{t("workflowEditor.inspector.mapInputSchema")}</span>
        {fields.length === 0 ? (
          <div className="workflow-map-empty" role="status">{t("workflowEditor.inspector.mapNoFields")}</div>
        ) : (
          <ul>
            {fields.map((field) => <li key={field.name}><code>{field.name}</code><span>{field.type}</span></li>)}
          </ul>
        )}
      </div>
      <div className="workflow-map-definitions">
        {definitions.map((definition, index) => {
          const editorExpression = mapExpressionEditor(definition.expression);
          const selectedField = fields.find((field) => field.name === editorExpression.sourceField);
          const secondaryField = fields.find((field) => field.name === editorExpression.secondaryField);
          const availableTransforms = mapTransformsForField(selectedField ?? fields[0]);
          const textualFields = fields.filter((field) => ["string", "id", "address", "bytes"].includes(field.type));
          const error = errors.find((candidate) => candidate.fieldIndex === index);
          const expressionInspection = inspectMapExpression(definition.expression, fields);
          const expressionFields = mapExpressionFieldNames(definition.expression);
          const advancedDraft = advancedEditor?.index === index
            ? parseAdvancedMapExpression(advancedEditor.text, fields)
            : null;
          const expressionOptions = (kind, sourceField, overrides = {}) => {
            const source = fields.find((field) => field.name === sourceField);
            const preferredSecondary = overrides.secondaryField ?? editorExpression.secondaryField;
            const compatibleSecondary = textualFields.some((field) => field.name === preferredSecondary)
              ? preferredSecondary
              : textualFields[0]?.name ?? sourceField;
            const sourceChanged = sourceField !== editorExpression.sourceField;
            return {
              sourceType: source?.type,
              secondaryField: compatibleSecondary,
              fallbackValue: overrides.fallbackValue
                ?? (sourceChanged ? defaultMapFallbackValue(source?.type) : editorExpression.fallbackValue),
            };
          };
          return (
            <fieldset className={`workflow-map-definition${error ? " is-invalid" : ""}`} key={index}>
              <legend>{t("workflowEditor.inspector.mapDefinition", {number: index + 1})}</legend>
              <div className={`workflow-map-definition-grid${editorExpression.kind === "advanced" ? " is-advanced" : ""}`}>
                <Field id={`map-${node.id}-name-${index}`} label={t("workflowEditor.inspector.mapOutputField")}>
                  <input
                    id={`map-${node.id}-name-${index}`}
                    value={definition.name ?? ""}
                    aria-invalid={error?.code === "MAP_FIELD_NAME_INVALID" || error?.code === "MAP_FIELD_NAME_DUPLICATED" || undefined}
                    onChange={(event) => updateDefinition(index, {...definition, name: event.target.value})}
                  />
                </Field>
                <Field
                  id={`map-${node.id}-transform-${index}`}
                  label={editorExpression.kind === "advanced"
                    ? t("workflowEditor.inspector.mapAdvancedReplace")
                    : t("workflowEditor.inspector.mapTransform")}
                  hint={editorExpression.kind === "advanced"
                    ? t("workflowEditor.inspector.mapAdvancedReplaceHint")
                    : null}
                >
                  <select
                    id={`map-${node.id}-transform-${index}`}
                    value={editorExpression.kind}
                    onChange={(event) => {
                      const sourceField = editorExpression.sourceField ?? fields[0]?.name ?? "";
                      const kind = event.target.value;
                      updateDefinition(index, {
                        ...definition,
                        expression: mapExpressionForEditor(kind, sourceField, expressionOptions(kind, sourceField)),
                      });
                    }}
                  >
                    {transformGroups.map((group) => {
                      const options = availableTransforms.filter((transform) => transform.group === group);
                      if (options.length === 0) return null;
                      return (
                        <optgroup label={t(`workflowEditor.inspector.mapTransformGroup.${group}`)} key={group}>
                          {options.map((transform) => (
                            <option value={transform.kind} key={transform.kind}>
                              {t(`workflowEditor.inspector.mapTransform.${transform.kind}`)}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {editorExpression.kind !== "advanced" && !availableTransforms.some((transform) => transform.kind === editorExpression.kind) && (
                      <option value={editorExpression.kind} disabled>{t(`workflowEditor.inspector.mapTransform.${editorExpression.kind}`)}</option>
                    )}
                    {editorExpression.kind === "advanced" && <option value="advanced" disabled>{t("workflowEditor.inspector.mapTransformAdvanced")}</option>}
                  </select>
                </Field>
                {editorExpression.kind !== "advanced" && <Field id={`map-${node.id}-source-${index}`} label={t("workflowEditor.inspector.mapSourceField")}>
                  <select
                    id={`map-${node.id}-source-${index}`}
                    value={editorExpression.sourceField ?? ""}
                    disabled={editorExpression.kind === "advanced" || fields.length === 0}
                    aria-invalid={error?.code === "MAP_SOURCE_FIELD_UNKNOWN" || undefined}
                    onChange={(event) => updateDefinition(index, {
                      ...definition,
                      expression: mapExpressionForEditor(
                        editorExpression.kind,
                        event.target.value,
                        expressionOptions(editorExpression.kind, event.target.value),
                      ),
                    })}
                  >
                    {!selectedField && editorExpression.sourceField && (
                      <option value={editorExpression.sourceField}>{editorExpression.sourceField} · {t("workflowEditor.inspector.mapMissingField")}</option>
                    )}
                    {fields.map((field) => <option value={field.name} key={field.name}>{field.name} · {field.type}</option>)}
                  </select>
                </Field>}
                <IconButton type="button" label={t("workflowEditor.inspector.mapRemove")} onClick={() => removeDefinition(index)}>
                  <Trash size={17} aria-hidden="true" />
                </IconButton>
              </div>
              <div className="workflow-map-unit">
                <Field
                  id={`map-${node.id}-unit-${index}`}
                  label={t("workflowEditor.inspector.mapUnit")}
                  hint={t("workflowEditor.inspector.mapUnitHint")}
                >
                  <input
                    id={`map-${node.id}-unit-${index}`}
                    value={definition.unit ?? ""}
                    maxLength="40"
                    placeholder={expressionInspection.field?.unit ?? t("workflowEditor.inspector.mapUnitPlaceholder")}
                    aria-invalid={["MAP_UNIT_INVALID", "MAP_UNIT_CONFLICT"].includes(error?.code) || undefined}
                    onChange={(event) => updateDefinition(index, {
                      ...definition,
                      unit: event.target.value === "" ? null : event.target.value,
                    })}
                  />
                </Field>
              </div>
              {editorExpression.kind === "concat" && (
                <Field id={`map-${node.id}-secondary-${index}`} label={t("workflowEditor.inspector.mapSecondSourceField")}>
                  <select
                    id={`map-${node.id}-secondary-${index}`}
                    value={editorExpression.secondaryField ?? ""}
                    disabled={textualFields.length === 0}
                    onChange={(event) => updateDefinition(index, {
                      ...definition,
                      expression: mapExpressionForEditor("concat", editorExpression.sourceField, expressionOptions("concat", editorExpression.sourceField, {
                        secondaryField: event.target.value,
                      })),
                    })}
                  >
                    {!secondaryField && editorExpression.secondaryField && (
                      <option value={editorExpression.secondaryField}>{editorExpression.secondaryField} · {t("workflowEditor.inspector.mapMissingField")}</option>
                    )}
                    {textualFields.map((field) => <option value={field.name} key={field.name}>{field.name} · {field.type}</option>)}
                  </select>
                </Field>
              )}
              {editorExpression.kind === "coalesce" && (
                <Field
                  id={`map-${node.id}-fallback-${index}`}
                  label={t("workflowEditor.inspector.mapFallbackValue")}
                  hint={t("workflowEditor.inspector.mapFallbackHint")}
                >
                  {selectedField?.type === "boolean" ? (
                    <select
                      id={`map-${node.id}-fallback-${index}`}
                      value={String(editorExpression.fallbackValue)}
                      onChange={(event) => updateDefinition(index, {
                        ...definition,
                        expression: mapExpressionForEditor("coalesce", editorExpression.sourceField, expressionOptions("coalesce", editorExpression.sourceField, {
                          fallbackValue: event.target.value === "true",
                        })),
                      })}
                    >
                      <option value="false">{t("common.no")}</option>
                      <option value="true">{t("common.yes")}</option>
                    </select>
                  ) : (
                    <input
                      id={`map-${node.id}-fallback-${index}`}
                      value={editorExpression.fallbackValue ?? ""}
                      onChange={(event) => updateDefinition(index, {
                        ...definition,
                        expression: mapExpressionForEditor("coalesce", editorExpression.sourceField, expressionOptions("coalesce", editorExpression.sourceField, {
                          fallbackValue: event.target.value,
                        })),
                      })}
                    />
                  )}
                </Field>
              )}
              {editorExpression.kind === "advanced" && (
                <section className="workflow-map-advanced" aria-label={t("workflowEditor.inspector.mapAdvancedTitle")}>
                  <div className="workflow-map-advanced-header">
                    <div>
                      <strong>{t("workflowEditor.inspector.mapAdvancedTitle")}</strong>
                      <p>{t("workflowEditor.inspector.mapAdvancedHint")}</p>
                    </div>
                    {advancedEditor?.index !== index && (
                      <Button
                        type="button"
                        onClick={() => setAdvancedEditor({index, text: JSON.stringify(definition.expression, null, 2) ?? ""})}
                      >
                        {t("workflowEditor.inspector.mapAdvancedEdit")}
                      </Button>
                    )}
                  </div>
                  <div className="workflow-map-expression-preview">
                    <span>{t("workflowEditor.inspector.mapAdvancedFormula")}</span>
                    <code>{formatMapExpression(definition.expression)}</code>
                  </div>
                  <dl className="workflow-map-expression-meta">
                    <div>
                      <dt>{t("workflowEditor.inspector.mapAdvancedFields")}</dt>
                      <dd>
                        {expressionFields.length > 0
                          ? expressionFields.map((fieldName) => <code key={fieldName}>{fieldName}</code>)
                          : t("workflowEditor.inspector.mapAdvancedNoFields")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("workflowEditor.inspector.mapAdvancedOutputType")}</dt>
                      <dd>
                        <code>{expressionInspection.field?.type ?? t("workflowEditor.inspector.mapAdvancedUnknownType")}</code>
                        {expressionInspection.field?.nullable && <span>{t("workflowEditor.inspector.mapAdvancedNullable")}</span>}
                      </dd>
                    </div>
                  </dl>
                  {advancedEditor?.index === index && (
                    <div className="workflow-map-expression-editor">
                      <Field
                        id={`map-${node.id}-expression-${index}`}
                        label={t("workflowEditor.inspector.mapAdvancedEditorLabel")}
                        hint={t("workflowEditor.inspector.mapAdvancedEditorHint")}
                      >
                        <textarea
                          id={`map-${node.id}-expression-${index}`}
                          value={advancedEditor.text}
                          rows="12"
                          spellCheck="false"
                          aria-invalid={Boolean(advancedDraft?.error) || undefined}
                          aria-describedby={`map-${node.id}-expression-${index}-hint`}
                          onChange={(event) => setAdvancedEditor({index, text: event.target.value})}
                        />
                      </Field>
                      {advancedDraft?.error && (
                        <p className="workflow-map-error" role="alert">
                          {advancedDraft.error === "MAP_EXPRESSION_JSON_INVALID"
                            ? t("workflowEditor.inspector.mapAdvancedJsonError")
                            : t(`workflowEditor.inspector.mapError.${advancedDraft.error}`)}
                        </p>
                      )}
                      {!advancedDraft?.error && advancedDraft?.field && (
                        <p className="workflow-map-expression-valid" role="status">
                          <CheckCircle size={16} weight="fill" aria-hidden="true" />
                          {t("workflowEditor.inspector.mapAdvancedValid", {type: advancedDraft.field.type})}
                        </p>
                      )}
                      <div className="workflow-map-expression-actions">
                        <Button type="button" onClick={() => setAdvancedEditor(null)}>
                          {t("common.cancel")}
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          disabled={Boolean(advancedDraft?.error) || !advancedDraft?.expression}
                          onClick={() => {
                            if (advancedDraft?.error || !advancedDraft?.expression) return;
                            updateDefinition(index, {...definition, expression: advancedDraft.expression});
                            setAdvancedEditor(null);
                          }}
                        >
                          {t("workflowEditor.inspector.mapAdvancedApply")}
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {error && <p className="workflow-map-error" role="alert">{t(`workflowEditor.inspector.mapError.${error.code}`)}</p>}
            </fieldset>
          );
        })}
      </div>
      <Button type="button" icon={Plus} disabled={fields.length === 0 || definitions.length >= 32} onClick={addDefinition}>
        {t("workflowEditor.inspector.mapAdd")}
      </Button>
      {errors.some((error) => error.fieldIndex === null) && (
        <p className="workflow-map-error" role="alert">
          {t(`workflowEditor.inspector.mapError.${errors.find((error) => error.fieldIndex === null).code}`)}
        </p>
      )}
    </div>
  );
}

function AggregateConfig({node, update, fields, errors}) {
  const {t} = useI18n();
  const config = editableAggregateConfig(node.config);
  const groupBy = config.groupBy;
  const measures = config.measures;
  const operations = aggregateOperations();
  const usedGroupFields = new Set(groupBy);
  const availableGroupField = fields.find((field) => !usedGroupFields.has(field.name));
  const updateGroup = (index, fieldName) => {
    update({...config, groupBy: groupBy.map((item, candidateIndex) => candidateIndex === index ? fieldName : item)});
  };
  const removeGroup = (index) => {
    update({...config, groupBy: groupBy.filter((_, candidateIndex) => candidateIndex !== index)});
  };
  const addGroup = () => {
    if (!availableGroupField || groupBy.length >= 16) return;
    update({...config, groupBy: [...groupBy, availableGroupField.name]});
  };
  const updateMeasure = (index, measure) => {
    update({...config, measures: measures.map((item, candidateIndex) => candidateIndex === index ? measure : item)});
  };
  const removeMeasure = (index) => {
    update({...config, measures: measures.filter((_, candidateIndex) => candidateIndex !== index)});
  };
  const addMeasure = () => {
    if (measures.length >= 32) return;
    const names = [...groupBy, ...measures.map((measure) => measure.name)];
    update({...config, measures: [...measures, createAggregateMeasure(names)]});
  };

  return (
    <div className="workflow-aggregate-config">
      <p className="workflow-inspector-help">{t("workflowEditor.inspector.aggregateHint")}</p>
      <div className="workflow-aggregate-schema" role="group" aria-label={t("workflowEditor.inspector.aggregateInputSchema")}>
        <span className="workflow-inspector-subtitle">{t("workflowEditor.inspector.aggregateInputSchema")}</span>
        {fields.length === 0 ? (
          <div className="workflow-aggregate-empty" role="status">{t("workflowEditor.inspector.aggregateNoFields")}</div>
        ) : (
          <ul>
            {fields.map((field) => <li key={field.name}><code>{field.name}</code><span>{field.type}</span></li>)}
          </ul>
        )}
      </div>

      <div className="workflow-aggregate-groups">
        <span className="workflow-inspector-subtitle">{t("workflowEditor.inspector.groupBy")}</span>
        {groupBy.length === 0 && <div className="workflow-aggregate-empty">{t("workflowEditor.inspector.aggregateNoGroups")}</div>}
        {groupBy.map((fieldName, index) => {
          const field = fields.find((candidate) => candidate.name === fieldName);
          const error = errors.find((candidate) => candidate.groupIndex === index);
          return (
            <div className={`workflow-aggregate-group${error ? " is-invalid" : ""}`} key={`${fieldName}-${index}`}>
              <div className="workflow-aggregate-group-row">
                <Field id={`aggregate-${node.id}-group-${index}`} label={t("workflowEditor.inspector.aggregateGroupField")}>
                  <select
                    id={`aggregate-${node.id}-group-${index}`}
                    value={fieldName}
                    aria-invalid={Boolean(error) || undefined}
                    onChange={(event) => updateGroup(index, event.target.value)}
                  >
                    {!field && fieldName && <option value={fieldName}>{fieldName} · {t("workflowEditor.inspector.aggregateMissingField")}</option>}
                    {fields.map((candidate) => (
                      <option
                        value={candidate.name}
                        key={candidate.name}
                        disabled={usedGroupFields.has(candidate.name) && candidate.name !== fieldName}
                      >
                        {candidate.name} · {candidate.type}
                      </option>
                    ))}
                  </select>
                </Field>
                <IconButton type="button" label={t("workflowEditor.inspector.aggregateRemoveGroup")} onClick={() => removeGroup(index)}>
                  <Trash size={17} aria-hidden="true" />
                </IconButton>
              </div>
              {error && <p className="workflow-aggregate-error" role="alert">{t(`workflowEditor.inspector.aggregateError.${error.code}`)}</p>}
            </div>
          );
        })}
        <Button type="button" icon={Plus} disabled={!availableGroupField || groupBy.length >= 16} onClick={addGroup}>
          {t("workflowEditor.inspector.aggregateAddGroup")}
        </Button>
      </div>

      <div className="workflow-aggregate-measures">
        <span className="workflow-inspector-subtitle">{t("workflowEditor.inspector.measures")}</span>
        {measures.length === 0 && <div className="workflow-aggregate-empty">{t("workflowEditor.inspector.aggregateNoMeasures")}</div>}
        {measures.map((measure, index) => {
          const operation = operations.find((candidate) => candidate.op === measure.op);
          const compatibleFields = aggregateFieldsForOperation(fields, measure.op);
          const selectedField = fields.find((field) => field.name === measure.field);
          const selectedFieldIsCompatible = compatibleFields.some((field) => field.name === measure.field);
          const error = errors.find((candidate) => candidate.measureIndex === index);
          return (
            <fieldset className={`workflow-aggregate-measure${error ? " is-invalid" : ""}`} key={`${measure.name}-${measure.op}-${index}`}>
              <legend>{t("workflowEditor.inspector.aggregateMeasure", {number: index + 1})}</legend>
              <div className="workflow-aggregate-measure-grid">
                <Field id={`aggregate-${node.id}-measure-name-${index}`} label={t("workflowEditor.inspector.aggregateOutputField")}>
                  <input
                    id={`aggregate-${node.id}-measure-name-${index}`}
                    value={measure.name ?? ""}
                    aria-invalid={error?.code === "AGGREGATE_OUTPUT_NAME_INVALID" || error?.code === "AGGREGATE_OUTPUT_NAME_DUPLICATED" || undefined}
                    onChange={(event) => updateMeasure(index, {...measure, name: event.target.value})}
                  />
                </Field>
                <Field id={`aggregate-${node.id}-measure-op-${index}`} label={t("workflowEditor.inspector.aggregateOperation")}>
                  <select
                    id={`aggregate-${node.id}-measure-op-${index}`}
                    value={measure.op ?? ""}
                    aria-invalid={error?.code === "AGGREGATE_OPERATION_INVALID" || undefined}
                    onChange={(event) => {
                      const op = event.target.value;
                      const nextOperation = operations.find((candidate) => candidate.op === op);
                      const nextFields = aggregateFieldsForOperation(fields, op);
                      const field = nextOperation?.requiresField
                        ? (nextFields.some((candidate) => candidate.name === measure.field) ? measure.field : nextFields[0]?.name ?? "")
                        : null;
                      updateMeasure(index, {...measure, op, field});
                    }}
                  >
                    {!operation && measure.op && <option value={measure.op} disabled>{measure.op}</option>}
                    {operations.map(({op}) => <option value={op} key={op}>{t(`workflowEditor.inspector.aggregateOperation.${op}`)}</option>)}
                  </select>
                </Field>
                <IconButton type="button" label={t("workflowEditor.inspector.aggregateRemoveMeasure")} onClick={() => removeMeasure(index)}>
                  <Trash size={17} aria-hidden="true" />
                </IconButton>
              </div>
              {operation?.requiresField && (
                <Field id={`aggregate-${node.id}-measure-field-${index}`} label={t("workflowEditor.inspector.aggregateSourceField")}>
                  <select
                    id={`aggregate-${node.id}-measure-field-${index}`}
                    value={measure.field ?? ""}
                    aria-invalid={error?.code === "AGGREGATE_FIELD_UNKNOWN" || error?.code === "AGGREGATE_FIELD_TYPE_INVALID" || undefined}
                    onChange={(event) => updateMeasure(index, {...measure, field: event.target.value})}
                  >
                    {measure.field && !selectedFieldIsCompatible && (
                      <option value={measure.field}>
                        {measure.field} · {t(selectedField ? "workflowEditor.inspector.aggregateIncompatibleField" : "workflowEditor.inspector.aggregateMissingField")}
                      </option>
                    )}
                    <option value="" disabled>{t("workflowEditor.inspector.aggregateSelectField")}</option>
                    {compatibleFields.map((field) => <option value={field.name} key={field.name}>{field.name} · {field.type}</option>)}
                  </select>
                </Field>
              )}
              {error && <p className="workflow-aggregate-error" role="alert">{t(`workflowEditor.inspector.aggregateError.${error.code}`)}</p>}
            </fieldset>
          );
        })}
        <Button type="button" icon={Plus} disabled={measures.length >= 32} onClick={addMeasure}>
          {t("workflowEditor.inspector.aggregateAddMeasure")}
        </Button>
      </div>
      {errors.some((error) => error.groupIndex === null && error.measureIndex === null) && (
        <p className="workflow-aggregate-error" role="alert">
          {t(`workflowEditor.inspector.aggregateError.${errors.find((error) => error.groupIndex === null && error.measureIndex === null).code}`)}
        </p>
      )}
    </div>
  );
}

function UnionConfig({ node, update }) {
  const { t } = useI18n();
  return (
    <Field id={`union-mode-${node.id}`} label={t("workflowEditor.inspector.unionMode")}>
      <select id={`union-mode-${node.id}`} value={node.config?.mode ?? "append_compatible_rows"} onChange={(event) => update({...node.config, mode: event.target.value})}>
        <option value="append_compatible_rows">append_compatible_rows</option>
      </select>
    </Field>
  );
}

function JoinConfig({ node, update }) {
  const { t } = useI18n();
  const keyNames = (node.config?.keys ?? []).map((key) => typeof key === "string" ? key : key.left).filter(Boolean);
  return (
    <>
      <Field id={`join-keys-${node.id}`} label={t("workflowEditor.inspector.joinKeys")} hint={t("workflowEditor.inspector.listHint")}>
        <input id={`join-keys-${node.id}`} value={listValue(keyNames)} onChange={(event) => update({ ...node.config, keys: parseList(event.target.value).map((key) => ({left: key, right: key})) })} />
      </Field>
      <Field id={`join-type-${node.id}`} label={t("workflowEditor.inspector.joinType")}>
        <select id={`join-type-${node.id}`} value={node.config?.type ?? "inner"} onChange={(event) => update({ ...node.config, type: event.target.value })}>
          <option value="inner">inner</option>
          <option value="left">left</option>
        </select>
      </Field>
      <Field id={`join-cardinality-${node.id}`} label={t("workflowEditor.inspector.cardinality")}>
        <select id={`join-cardinality-${node.id}`} value={node.config?.cardinality ?? "one_to_one"} onChange={(event) => update({ ...node.config, cardinality: event.target.value })}>
          <option value="one_to_one">one_to_one</option>
          <option value="bounded_many_to_one">bounded_many_to_one</option>
        </select>
      </Field>
    </>
  );
}

function OutputConfig({ node, fields }) {
  const { t } = useI18n();
  const selected = Array.isArray(node.config?.fields) && node.config.fields.length > 0
    ? new Set(node.config.fields)
    : null;
  const publishedFields = selected ? fields.filter((field) => selected.has(field.name)) : fields;
  return (
    <div className="workflow-map-schema">
      <p className="workflow-inspector-help">{t("workflowEditor.inspector.outputHint")}</p>
      <span className="workflow-inspector-subtitle">{t("workflowEditor.inspector.outputFields")}</span>
      {publishedFields.length > 0 ? (
        <ul>
          {publishedFields.map((field) => <li key={field.name}><code>{field.name}</code><span>{field.type}</span></li>)}
        </ul>
      ) : <p className="workflow-inspector-empty">{t("workflowEditor.inspector.outputNoFields")}</p>}
    </div>
  );
}

function cloneConfig(config) {
  if (typeof structuredClone === "function") return structuredClone(config ?? {});
  return JSON.parse(JSON.stringify(config ?? {}));
}

export function NodeInspector({ editor, nodeId, onClose, sourceDiscovery }) {
  const { t } = useI18n();
  const node = editor.nodes.find((item) => item.id === nodeId)?.data?.node;
  const inspectorRef = useRef(null);
  const [draftConfig, setDraftConfig] = useState({});
  const [sourceMode, setSourceMode] = useState("discovered");
  const [pendingSource, setPendingSource] = useState(null);
  const [legacyFilterExpression, setLegacyFilterExpression] = useState(false);
  const [mapExpressionEditing, setMapExpressionEditing] = useState(false);

  useEffect(() => {
    if (nodeId) {
      const editable = node?.type === "filter"
        ? editableFilterConfig(node?.config)
        : {
          config: node?.type === "map"
            ? editableMapConfig(node?.config)
            : node?.type === "aggregate"
              ? editableAggregateConfig(node?.config)
              : node?.config,
          legacyExpression: false,
        };
      setDraftConfig(cloneConfig(editable.config));
      setLegacyFilterExpression(editable.legacyExpression);
      setSourceMode("discovered");
      setPendingSource(null);
      setMapExpressionEditing(false);
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
  const filterFields = node.type === "filter" ? deriveFilterInputFields(editor, node.id) : [];
  const filterErrors = node.type === "filter" && !legacyFilterExpression ? validateFilterConfig(draftConfig, filterFields) : [];
  const sortFields = node.type === "sort" ? deriveDirectInputFields(editor, node.id) : [];
  const sortErrors = node.type === "sort" ? validateSortConfig(draftConfig, sortFields) : [];
  const mapFields = node.type === "map" ? deriveDirectInputFields(editor, node.id) : [];
  const mapErrors = node.type === "map" ? validateMapConfig(draftConfig, mapFields) : [];
  const aggregateFields = node.type === "aggregate" ? deriveDirectInputFields(editor, node.id) : [];
  const aggregateErrors = node.type === "aggregate" ? validateAggregateConfig(draftConfig, aggregateFields) : [];
  const outputFields = node.type === "output" ? deriveDirectInputFields(editor, node.id) : [];
  const canConfirm = (node.type !== "source"
      || (sourceMode === "discovered" && Boolean(draftConfig.sourceId ?? draftConfig.sourceKey))
      || (sourceMode === "add" && Boolean(pendingSource)))
    && (node.type !== "filter" || (!legacyFilterExpression && filterErrors.length === 0))
    && (node.type !== "sort" || sortErrors.length === 0)
    && (node.type !== "map" || (mapErrors.length === 0 && !mapExpressionEditing))
    && (node.type !== "aggregate" || aggregateErrors.length === 0);
  const confirm = () => {
    if (!canConfirm) return;
    if (node.type === "source" && sourceMode === "add") {
      editor.configureSource(node.id, draftConfig, pendingSource);
    } else {
      editor.updateConfig(node.id, draftConfig);
    }
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
              onModeChange={(nextMode) => {
                setSourceMode(nextMode);
                setPendingSource(null);
                if (nextMode === "discovered") setDraftConfig(cloneConfig(node.config));
              }}
              sourceDiscovery={sourceDiscovery}
              onVerifiedSource={setPendingSource}
            />
          )}
          {node.type === "filter" && (
            <FilterConfig
              node={draftNode}
              update={update}
              fields={filterFields}
              errors={filterErrors}
              legacyExpression={legacyFilterExpression}
              onReplaceLegacy={() => {
                setDraftConfig(createFilterConfig(filterFields));
                setLegacyFilterExpression(false);
              }}
            />
          )}
          {node.type === "sort" && <SortConfig node={draftNode} update={update} fields={sortFields} errors={sortErrors} />}
          {node.type === "map" && (
            <MapConfig
              node={draftNode}
              update={update}
              fields={mapFields}
              errors={mapErrors}
              onPendingChange={setMapExpressionEditing}
            />
          )}
          {node.type === "aggregate" && <AggregateConfig node={draftNode} update={update} fields={aggregateFields} errors={aggregateErrors} />}
          {node.type === "union" && <UnionConfig node={draftNode} update={update} />}
          {node.type === "join" && <JoinConfig node={draftNode} update={update} />}
          {node.type === "output" && <OutputConfig node={draftNode} fields={outputFields} />}
        </div>
        <div className="workflow-inspector-actions">
          <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="button" variant="primary" disabled={!canConfirm} onClick={confirm}>{t("common.confirm")}</Button>
        </div>
      </section>
    </div>
  );
}
