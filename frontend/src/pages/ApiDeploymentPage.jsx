import {useEffect, useRef, useState} from "react";
import {Check, Copy, Database, DownloadSimple, FileCode, Key, Play, RocketLaunch, SpinnerGap, StopCircle, TerminalWindow, WarningCircle} from "@phosphor-icons/react";
import {ProductHeader} from "../components/product/ProductHeader.jsx";
import {Button, IconButton} from "../components/ui/Button.jsx";
import {Field} from "../components/ui/Field.jsx";
import {Status} from "../components/ui/Status.jsx";
import {Modal} from "../components/ui/Modal.jsx";
import {useProductDelivery} from "../features/delivery/useProductDelivery.js";
import {executeLiveProduct} from "../services/api/delivery.js";
import {productRefFromPath} from "../features/products/productRoute.js";
import {copyText} from "../features/wallet/copyText.js";
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
  const product = delivery.product ?? (delivery.status === "error" ? {name: t("api.unknownProduct"), slug: productRef} : null);
  return <><ProductHeader product={product} productRef={productRef} active="api" navigate={navigate} /><main className="runtime-gate builder-route-state"><div className="panel"><span className="section-label">{t("api.eyebrow")}</span><h1>{t(delivery.status === "loading" ? "api.loading" : "api.loadError")}</h1><p>{t(delivery.status === "loading" ? "api.loadingDetail" : "api.loadErrorDetail")}</p>{delivery.status === "error" && <Button variant="primary" onClick={() => delivery.refresh()}>{t("common.retry")}</Button>}</div></main></>;
}

function LoadedApiPage({delivery, productRef, navigate}) {
  const {t} = useI18n();
  const {product} = delivery;
  const api = delivery.delivery.api;
  const contract = api.contract;
  const parameter = contract?.parameterSchema?.[0] ?? null;
  const [limit, setLimit] = useState(String(parameter?.default ?? 100));
  const [copied, setCopied] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const deployIdempotencyKey = useRef(null);
  const [alias, setAlias] = useState("");
  const [deployState, setDeployState] = useState({status: "idle", error: null});
  const [issuedKey, setIssuedKey] = useState(null);
  const [apiKeyCopyStatus, setApiKeyCopyStatus] = useState("idle");
  const apiKeyCopyTimer = useRef(null);
  const [apiKey, setApiKey] = useState("");
  const [requestState, setRequestState] = useState({status: "idle", body: null, error: null});
  const [exportState, setExportState] = useState({status: "idle", error: null});
  const [stopOpen, setStopOpen] = useState(false);
  const [stopState, setStopState] = useState({status: "idle", error: null});
  const parsedLimit = Number(limit);
  const limitIsValid = parameter ? Number.isInteger(parsedLimit) && parsedLimit >= parameter.minimum && parsedLimit <= parameter.maximum : false;
  const requestUrl = contract && parameter ? `${contract.endpointUrl}?${parameter.name}=${limitIsValid ? parsedLimit : parameter.default}` : null;
  const fields = contract ? fieldRows(contract.responseSchema.outputSchema) : [];
  const statusTone = api.readiness === "available" ? "green" : api.readiness === "deploying" ? "violet" : "amber";

  useEffect(() => () => window.clearTimeout(apiKeyCopyTimer.current), []);

  const copyEndpoint = async () => {
    if (!contract?.endpointUrl) return;
    await navigator.clipboard?.writeText(contract.endpointUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const submitDeployment = async () => {
    setDeployState({status: "loading", error: null});
    try {
      deployIdempotencyKey.current ??= `sprue-deploy-${globalThis.crypto.randomUUID()}`;
      const result = await delivery.deploy(alias.trim(), deployIdempotencyKey.current);
      setIssuedKey(result.apiKey);
      setApiKeyCopyStatus("idle");
      setApiKey(result.apiKey.apiKey);
      deployIdempotencyKey.current = null;
      setDeployOpen(false);
      setDeployState({status: "idle", error: null});
    } catch (error) {
      setDeployState({status: "error", error});
    }
  };

  const copyApiKey = async () => {
    if (!issuedKey?.apiKey) return;
    window.clearTimeout(apiKeyCopyTimer.current);
    setApiKeyCopyStatus("copying");
    try {
      await copyText(issuedKey.apiKey);
      setApiKeyCopyStatus("copied");
    } catch {
      setApiKeyCopyStatus("failed");
    }
    apiKeyCopyTimer.current = window.setTimeout(() => setApiKeyCopyStatus("idle"), 4000);
  };

  const downloadExport = async () => {
    setExportState({status: "loading", error: null});
    try {
      const blob = await delivery.exportPrivate();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `sprue-${product.id}-private-deployment.json`;
      link.click();
      URL.revokeObjectURL(href);
      setExportState({status: "idle", error: null});
    } catch (error) {
      setExportState({status: "error", error});
    }
  };

  const sendRequest = async () => {
    if (!contract || !limitIsValid) return;
    setRequestState({status: "loading", body: null, error: null});
    try {
      const body = await executeLiveProduct(contract.endpointUrl, apiKey.trim(), parsedLimit);
      setRequestState({status: "success", body, error: null});
    } catch (error) {
      setRequestState({status: "error", body: null, error});
    }
  };

  const stopDeployment = async () => {
    if (!api.deployment?.id) return;
    setStopState({status: "loading", error: null});
    try {
      await delivery.suspend(api.deployment.id);
      setApiKey("");
      setIssuedKey(null);
      setRequestState({status: "idle", body: null, error: null});
      setStopState({status: "idle", error: null});
      setStopOpen(false);
    } catch (error) {
      setStopState({status: "error", error});
    }
  };

  return <>
    <ProductHeader product={product} productRef={productRef} active="api" navigate={navigate} onRename={delivery.rename} />
    <main className="product-content">
      <div className="content-heading"><div><span className="eyebrow">{t("api.eyebrow")}</span><h1>{product.name}</h1><p>{product.description || product.originalIntent}</p></div><div className="api-heading-actions"><Button icon={exportState.status === "loading" ? SpinnerGap : DownloadSimple} className={exportState.status === "loading" ? "is-loading" : ""} disabled={!delivery.delivery.capabilities.privateExport || exportState.status === "loading"} onClick={downloadExport}>{t("api.privateDeploy")}</Button>{api.deployment?.status === "healthy" && <Button variant="danger" icon={StopCircle} onClick={() => { setStopState({status: "idle", error: null}); setStopOpen(true); }}>{t("api.stopDeployment")}</Button>}<Button variant="primary" icon={RocketLaunch} disabled={!delivery.delivery.capabilities.deploy} onClick={() => { deployIdempotencyKey.current = null; setDeployOpen(true); }}>{t(delivery.delivery.capabilities.deploy ? (contract ? "api.redeploy" : "api.deploy") : "api.deployUnavailable")}</Button></div></div>

      {exportState.status === "error" && <div className="inline-notice api-action-error"><WarningCircle size={18} /><span>{t("api.exportFailed")}</span></div>}

      {contract ? <section className="endpoint-strip"><span className="method">{contract.method}</span><code>{contract.endpointUrl}</code><IconButton label={t("api.copyEndpoint")} onClick={copyEndpoint}>{copied ? <Check size={18} className="green-text" /> : <Copy size={18} />}</IconButton><Status tone={statusTone}>{t(`api.readiness.${api.readiness}`)}</Status></section> : <section className="panel delivery-empty-state"><Database size={22} /><div><h2>{t("api.noContract")}</h2><p>{t(`api.readinessDetail.${api.readiness}`)}</p></div><Status tone={statusTone}>{t(`api.readiness.${api.readiness}`)}</Status></section>}

      {api.blockers.length > 0 && <div className="delivery-blockers" role="status">{api.blockers.map((blocker) => <div className="inline-notice" key={blocker.code}><WarningCircle size={18} /><span>{blockerText(t, blocker)}</span></div>)}</div>}

      {contract && <div className="api-grid">
        <section className="panel api-contract">
          <div className="panel-title"><FileCode size={19} /><h3>{t("api.contract")}</h3><Status tone="violet">v{api.activeVersion?.versionNo}</Status></div>
          <div className="contract-row"><span>{t("api.authentication")}</span><strong>{t(`api.accessMode.${contract.accessMode}`)}</strong></div><div className="contract-row"><span>{t("api.response")}</span><strong>{contract.responseSchema.mediaType}</strong></div><div className="contract-row"><span>{t("api.serveMode")}</span><strong>{contract.serveMode}</strong></div>
          <div className="api-subsection"><div className="api-subsection-heading"><h4>{t("api.requestFormat")}</h4><span>{t("api.requestFormatDetail")}</span></div><div className="api-format-table api-parameter-table" role="table" aria-label={t("api.requestFormat")}><div className="api-format-head" role="row"><span role="columnheader">{t("api.parameter")}</span><span role="columnheader">{t("api.location")}</span><span role="columnheader">{t("api.type")}</span><span role="columnheader">{t("api.requirement")}</span><span role="columnheader">{t("api.rules")}</span></div>{contract.parameterSchema.map((item) => <div className="api-format-row" role="row" key={item.name}><code role="cell">{item.name}</code><code role="cell">{item.location}</code><code role="cell">{item.type}</code><span role="cell">{t(item.required ? "api.required" : "api.optional")}</span><span role="cell">{t("api.parameterRules", item)}</span></div>)}</div></div>
          <div className="api-subsection response-format"><div className="api-subsection-heading response-format-heading"><div><h4>{t("api.responseFormat")}</h4><span>{t("api.responseFormatDetail")}</span></div><span className="response-media">{contract.responseSchema.mediaType}</span></div><div className="api-format-table api-response-table" role="table" aria-label={t("api.responseFormat")}><div className="api-format-head" role="row"><span role="columnheader">{t("api.fieldPath")}</span><span role="columnheader">{t("api.type")}</span><span role="columnheader">{t("api.requirement")}</span></div><div className="api-format-row" role="row"><code role="cell">data</code><code role="cell">array</code><span role="cell">{t("api.required")}</span></div>{fields.map((field) => <div className="api-format-row" role="row" key={field.path}><code role="cell">{field.path}</code><code role="cell">{field.type}</code><span role="cell">{t(field.required ? "api.required" : "api.optional")}</span></div>)}</div></div>
          {requestUrl && <><div className="code-tabs"><button className="active">cURL</button></div><pre className="code-block">curl --request GET {"\n"}  --url '{requestUrl}' {"\n"}  --header 'accept: application/json' {"\n"}  --header 'authorization: Bearer YOUR_SPRUE_API_KEY'</pre></>}
        </section>
        <section className="panel request-tester">
          <div className="panel-title"><TerminalWindow size={19} /><h3>{t("api.requestTester")}</h3></div>
          <Field htmlFor="api-key" label={t("api.apiKey")} hint={t("api.apiKeyHint")}><input id="api-key" type="password" autoComplete="off" value={apiKey} placeholder="sprue_live_..." onChange={(event) => setApiKey(event.target.value)} /></Field>
          {parameter && <Field htmlFor="api-limit" label={t("api.limit")} hint={t(limitIsValid ? "api.limitHint" : "api.limitInvalid", parameter)}><input id="api-limit" type="number" min={parameter.minimum} max={parameter.maximum} step="1" value={limit} aria-invalid={!limitIsValid} onChange={(event) => setLimit(event.target.value)} /></Field>}
          <Button variant="primary" icon={requestState.status === "loading" ? SpinnerGap : Play} className={requestState.status === "loading" ? "is-loading" : ""} disabled={!delivery.delivery.capabilities.privateRequest || !limitIsValid || !apiKey.trim() || requestState.status === "loading"} onClick={sendRequest}>{t(requestState.status === "loading" ? "api.sending" : "api.sendTest")}</Button>
          {requestState.status === "error" && <div className="inline-notice"><WarningCircle size={18} /><span>{t("api.requestFailed")}: {requestState.error?.message}</span></div>}
          <div className="response-box"><div className="response-head"><Status tone={requestState.status === "success" ? "green" : "violet"}>{t("api.liveResponse")}</Status><span>{contract.responseSchema.mediaType}</span></div>{requestState.body ? <pre>{JSON.stringify(requestState.body, null, 2)}</pre> : contract.exampleBody ? <pre>{JSON.stringify(contract.exampleBody, null, 2)}</pre> : <div className="empty-response"><Database size={22} /><span>{t("api.noLiveResponse")}</span></div>}</div>
        </section>
      </div>}
    </main>
    {deployOpen && <Modal title={t(contract ? "api.redeployTitle" : "api.deployTitle")} eyebrow={t("api.hostedRuntime")} width="520px" onClose={() => deployState.status !== "loading" && setDeployOpen(false)} footer={<><Button disabled={deployState.status === "loading"} onClick={() => setDeployOpen(false)}>{t("common.cancel")}</Button><Button variant="primary" icon={deployState.status === "loading" ? SpinnerGap : RocketLaunch} className={deployState.status === "loading" ? "is-loading" : ""} disabled={deployState.status === "loading"} onClick={submitDeployment}>{t(deployState.status === "loading" ? "api.deploying" : "api.confirmDeploy")}</Button></>}><p className="modal-copy">{t("api.deployDetail")}</p><Field htmlFor="deployment-alias" label={t("api.alias")} hint={t("api.aliasHint")}><input id="deployment-alias" value={alias} placeholder={product.id} onChange={(event) => { deployIdempotencyKey.current = null; setAlias(event.target.value); }} /></Field>{deployState.status === "error" && <div className="inline-notice"><WarningCircle size={18} /><span>{t("api.deployFailed")}: {deployState.error?.message}</span></div>}</Modal>}
    {issuedKey && <Modal title={t("api.keyIssuedTitle")} eyebrow={t("api.keyIssuedEyebrow")} width="560px" onClose={() => setIssuedKey(null)} footer={<Button variant="primary" onClick={() => setIssuedKey(null)}>{t("common.done")}</Button>}><div className="inline-notice"><Key size={18} /><span>{t("api.keyIssuedWarning")}</span></div><div className={`api-key-value is-${apiKeyCopyStatus}`}><code>{issuedKey.apiKey}</code><IconButton label={t(apiKeyCopyStatus === "copied" ? "api.apiKeyCopied" : apiKeyCopyStatus === "failed" ? "api.retryCopyApiKey" : "api.copyApiKey")} disabled={apiKeyCopyStatus === "copying"} onClick={copyApiKey}>{apiKeyCopyStatus === "copied" ? <Check size={18} /> : apiKeyCopyStatus === "failed" ? <WarningCircle size={18} /> : <Copy size={18} />}</IconButton></div><span className={`api-key-copy-feedback is-${apiKeyCopyStatus}`} role="status" aria-live="polite">{apiKeyCopyStatus === "copied" ? t("api.apiKeyCopied") : apiKeyCopyStatus === "failed" ? t("api.apiKeyCopyFailed") : ""}</span><p className="modal-copy">{t("api.keyIssuedDetail")}</p></Modal>}
    {stopOpen && <Modal title={t("api.stopDeploymentTitle")} eyebrow={t("api.hostedRuntime")} width="520px" onClose={() => stopState.status !== "loading" && setStopOpen(false)} footer={<><Button disabled={stopState.status === "loading"} onClick={() => setStopOpen(false)}>{t("common.cancel")}</Button><Button variant="danger" icon={stopState.status === "loading" ? SpinnerGap : StopCircle} className={stopState.status === "loading" ? "is-loading" : ""} disabled={stopState.status === "loading"} onClick={stopDeployment}>{t(stopState.status === "loading" ? "api.stoppingDeployment" : "api.confirmStopDeployment")}</Button></>}><div className="product-delete-warning"><WarningCircle size={19} /><div><strong>{t("api.stopDeploymentWarning")}</strong><p>{t("api.stopDeploymentDetail")}</p></div></div>{stopState.status === "error" && <div className="inline-notice api-action-error"><WarningCircle size={18} /><span>{t("api.stopDeploymentFailed")}: {stopState.error?.message}</span></div>}</Modal>}
  </>;
}

export function ApiDeploymentPage({path, navigate}) {
  const productRef = productRefFromPath(path);
  const delivery = useProductDelivery(productRef);
  return <div className="product-page">{delivery.status === "ready" ? <LoadedApiPage delivery={delivery} productRef={productRef} navigate={navigate} /> : <ApiRouteState delivery={delivery} productRef={productRef} navigate={navigate} />}</div>;
}
