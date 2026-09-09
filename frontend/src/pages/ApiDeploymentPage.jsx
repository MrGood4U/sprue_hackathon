import {useState} from "react";
import {Check, Copy, Database, FileCode, Play, RocketLaunch, TerminalWindow, WarningCircle} from "@phosphor-icons/react";
import {ProductHeader} from "../components/product/ProductHeader.jsx";
import {Button, IconButton} from "../components/ui/Button.jsx";
import {Field} from "../components/ui/Field.jsx";
import {Status} from "../components/ui/Status.jsx";
import {useProductDelivery} from "../features/delivery/useProductDelivery.js";
import {productRefFromPath} from "../features/products/productRoute.js";
import {useI18n} from "../i18n/I18nProvider.jsx";

function blockerText(t, blocker) {
  const key = `delivery.blocker.${blocker.code}`;
  const translated = t(key);
  return translated === key ? blocker.message : translated;
}

function fieldRows(outputSchema) {
  if (Array.isArray(outputSchema?.fields)) {
    return outputSchema.fields
      .filter((field) => typeof field?.name === "string")
      .map((field) => ({path: `data[].${field.name}`, type: typeof field.type === "string" ? field.type : "unknown", required: field.nullable !== true}));
  }
  const properties = outputSchema?.items?.properties ?? outputSchema?.properties;
  const required = new Set(outputSchema?.items?.required ?? outputSchema?.required ?? []);
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.entries(properties).map(([name, definition]) => ({path: `data[].${name}`, type: typeof definition?.type === "string" ? definition.type : "unknown", required: required.has(name)}));
}

function ApiRouteState({delivery, productRef, navigate}) {
  const {t} = useI18n();
  const product = delivery.product ?? {name: productRef || t("api.unknownProduct"), slug: productRef};
  return <><ProductHeader product={product} productRef={productRef} active="api" navigate={navigate} /><main className="runtime-gate builder-route-state"><div className="panel"><span className="section-label">{t("api.liveData")}</span><h1>{t(delivery.status === "loading" ? "api.loading" : "api.loadError")}</h1><p>{t(delivery.status === "loading" ? "api.loadingDetail" : "api.loadErrorDetail")}</p>{delivery.status === "error" && <Button variant="primary" onClick={() => delivery.refresh()}>{t("common.retry")}</Button>}</div></main></>;
}

function LoadedApiPage({delivery, productRef, navigate}) {
  const {t} = useI18n();
  const {product} = delivery;
  const api = delivery.delivery.api;
  const contract = api.contract;
  const parameter = contract?.parameterSchema?.[0] ?? null;
  const [limit, setLimit] = useState(String(parameter?.default ?? 100));
  const [copied, setCopied] = useState(false);
  const parsedLimit = Number(limit);
  const limitIsValid = parameter ? Number.isInteger(parsedLimit) && parsedLimit >= parameter.minimum && parsedLimit <= parameter.maximum : false;
  const requestUrl = contract && parameter ? `${contract.endpointUrl}?${parameter.name}=${limitIsValid ? parsedLimit : parameter.default}` : null;
  const fields = contract ? fieldRows(contract.responseSchema.outputSchema) : [];
  const statusTone = api.readiness === "available" ? "green" : api.readiness === "deploying" ? "violet" : "amber";

  const copyEndpoint = async () => {
    if (!contract?.endpointUrl) return;
    await navigator.clipboard?.writeText(contract.endpointUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return <>
    <ProductHeader product={product} productRef={productRef} active="api" navigate={navigate} onRename={delivery.rename} />
    <main className="product-content">
      <div className="content-heading"><div><span className="eyebrow">{t("api.eyebrow")}</span><h1>{product.name}</h1><p>{product.description || product.originalIntent}</p></div><Button variant="primary" icon={RocketLaunch} disabled={!delivery.delivery.capabilities.deploy}>{t(delivery.delivery.capabilities.deploy ? "api.deploy" : "api.deployUnavailable")}</Button></div>

      {contract ? <section className="endpoint-strip"><span className="method">{contract.method}</span><code>{contract.endpointUrl}</code><IconButton label={t("api.copyEndpoint")} onClick={copyEndpoint}>{copied ? <Check size={18} className="green-text" /> : <Copy size={18} />}</IconButton><Status tone={statusTone}>{t(`api.readiness.${api.readiness}`)}</Status></section> : <section className="panel delivery-empty-state"><Database size={22} /><div><h2>{t("api.noContract")}</h2><p>{t(`api.readinessDetail.${api.readiness}`)}</p></div><Status tone={statusTone}>{t(`api.readiness.${api.readiness}`)}</Status></section>}

      {api.blockers.length > 0 && <div className="delivery-blockers" role="status">{api.blockers.map((blocker) => <div className="inline-notice" key={blocker.code}><WarningCircle size={18} /><span>{blockerText(t, blocker)}</span></div>)}</div>}

      <section className="panel delivery-facts"><div className="panel-title"><Database size={19} /><h3>{t("api.backendFacts")}</h3><Status tone="violet">{t("api.liveData")}</Status></div><dl className="detail-list"><div><dt>{t("api.latestVersion")}</dt><dd>{api.latestVersion ? `v${api.latestVersion.versionNo} · ${api.latestVersion.status}` : t("common.notAvailable")}</dd></div><div><dt>{t("api.activeVersion")}</dt><dd>{api.activeVersion ? `v${api.activeVersion.versionNo} · ${api.activeVersion.status}` : t("common.notAvailable")}</dd></div><div><dt>{t("api.deployment")}</dt><dd>{api.deployment ? `${api.deployment.provider} · ${api.deployment.environment} · ${api.deployment.status}` : t("common.notAvailable")}</dd></div><div><dt>{t("api.sourceFreshness")}</dt><dd>{api.deployment?.sourceFreshnessAt ?? t("common.notAvailable")}</dd></div></dl></section>

      {contract && <div className="api-grid">
        <section className="panel api-contract">
          <div className="panel-title"><FileCode size={19} /><h3>{t("api.contract")}</h3><Status tone="violet">v{api.activeVersion?.versionNo}</Status></div>
          <div className="contract-row"><span>{t("api.authentication")}</span><strong>{t(`api.accessMode.${contract.accessMode}`)}</strong></div><div className="contract-row"><span>{t("api.response")}</span><strong>{contract.responseSchema.mediaType}</strong></div><div className="contract-row"><span>{t("api.serveMode")}</span><strong>{contract.serveMode}</strong></div>
          <div className="api-subsection"><div className="api-subsection-heading"><h4>{t("api.requestFormat")}</h4><span>{t("api.requestFormatDetail")}</span></div><div className="api-format-table api-parameter-table" role="table" aria-label={t("api.requestFormat")}><div className="api-format-head" role="row"><span role="columnheader">{t("api.parameter")}</span><span role="columnheader">{t("api.location")}</span><span role="columnheader">{t("api.type")}</span><span role="columnheader">{t("api.requirement")}</span><span role="columnheader">{t("api.rules")}</span></div>{contract.parameterSchema.map((item) => <div className="api-format-row" role="row" key={item.name}><code role="cell">{item.name}</code><code role="cell">{item.location}</code><code role="cell">{item.type}</code><span role="cell">{t(item.required ? "api.required" : "api.optional")}</span><span role="cell">{t("api.parameterRules", item)}</span></div>)}</div></div>
          {requestUrl && <><div className="code-tabs"><button className="active">cURL</button></div><pre className="code-block">curl --request GET {"\n"}  --url '{requestUrl}' {"\n"}  --header 'accept: application/json'</pre></>}
        </section>
        <section className="panel request-tester">
          <div className="panel-title"><TerminalWindow size={19} /><h3>{t("api.requestTester")}</h3><Status tone="violet">{t("api.liveData")}</Status></div>
          {parameter && <Field htmlFor="api-limit" label={t("api.limit")} hint={t(limitIsValid ? "api.limitHint" : "api.limitInvalid", parameter)}><input id="api-limit" type="number" min={parameter.minimum} max={parameter.maximum} step="1" value={limit} aria-invalid={!limitIsValid} onChange={(event) => setLimit(event.target.value)} /></Field>}
          <Button variant="primary" icon={Play} disabled={!delivery.delivery.capabilities.privateRequest || !limitIsValid}>{t("api.testUnavailable")}</Button><div className="inline-notice"><WarningCircle size={18} /><span>{t("api.testUnavailableDetail")}</span></div>
          <div className="api-subsection response-format"><div className="api-subsection-heading response-format-heading"><div><h4>{t("api.responseFormat")}</h4><span>{t("api.responseFormatDetail")}</span></div><span className="response-media">{contract.responseSchema.mediaType}</span></div><div className="api-format-table api-response-table" role="table" aria-label={t("api.responseFormat")}><div className="api-format-head" role="row"><span role="columnheader">{t("api.fieldPath")}</span><span role="columnheader">{t("api.type")}</span><span role="columnheader">{t("api.requirement")}</span></div><div className="api-format-row" role="row"><code role="cell">data</code><code role="cell">array</code><span role="cell">{t("api.required")}</span></div>{fields.map((field) => <div className="api-format-row" role="row" key={field.path}><code role="cell">{field.path}</code><code role="cell">{field.type}</code><span role="cell">{t(field.required ? "api.required" : "api.optional")}</span></div>)}</div></div>
          <div className="response-box"><div className="response-head"><Status tone="violet">{t("api.materializedSample")}</Status><span>{contract.responseSchema.mediaType}</span></div>{contract.exampleBody ? <pre>{JSON.stringify(contract.exampleBody, null, 2)}</pre> : <div className="empty-response"><Database size={22} /><span>{t("api.noMaterializedSample")}</span></div>}</div>
        </section>
      </div>}
    </main>
  </>;
}

export function ApiDeploymentPage({path, navigate}) {
  const productRef = productRefFromPath(path);
  const delivery = useProductDelivery(productRef);
  return <div className="product-page">{delivery.status === "ready" ? <LoadedApiPage delivery={delivery} productRef={productRef} navigate={navigate} /> : <ApiRouteState delivery={delivery} productRef={productRef} navigate={navigate} />}</div>;
}
