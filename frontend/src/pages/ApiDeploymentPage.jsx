import { useState } from "react";
import {
  Check,
  Copy,
  FileCode,
  Play,
  RocketLaunch,
  TerminalWindow,
} from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button, IconButton } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Status } from "../components/ui/Status.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useRequestTest } from "../features/deployment/useRequestTest.js";
import { useDemoRuntime } from "../features/runtime/DemoRuntimeProvider.jsx";

export function ApiDeploymentPage({ navigate }) {
  const { t } = useI18n();
  const { state } = useDemoRuntime();
  const { product, api } = state;
  const parameter = api.requestParameters[0];
  const [limit, setLimit] = useState(String(parameter.default));
  const parsedLimit = Number(limit);
  const limitIsValid = Number.isInteger(parsedLimit)
    && parsedLimit >= parameter.minimum
    && parsedLimit <= parameter.maximum;
  const requestLimit = limitIsValid ? parsedLimit : parameter.default;
  const requestUrl = `${api.endpoint}?limit=${requestLimit}`;
  const { response, result, runTest } = useRequestTest(requestLimit);
  const [copied, setCopied] = useState(false);

  const copyEndpoint = async () => {
    await navigator.clipboard?.writeText(api.endpoint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="product-page">
      <ProductHeader product={product} active="api" navigate={navigate} />
      <main className="product-content">
        <div className="content-heading">
          <div>
            <span className="eyebrow">{t("api.eyebrow")}</span>
            <h1>{product.name}</h1>
            <p>{product.description}</p>
          </div>
          <Button variant="primary" icon={RocketLaunch}>{t("api.deploy")}</Button>
        </div>

        <section className="endpoint-strip">
          <span className="method">{api.method}</span>
          <code>{api.endpoint}</code>
          <IconButton label={t("api.copyEndpoint")} onClick={copyEndpoint}>
            {copied ? <Check size={18} className="green-text" /> : <Copy size={18} />}
          </IconButton>
          <Status>{api.status}</Status>
        </section>

        <div className="api-grid">
          <section className="panel api-contract">
            <div className="panel-title"><FileCode size={19} /><h3>{t("api.contract")}</h3><Status tone="violet">{api.contract.version}</Status></div>
            <div className="contract-row"><span>{t("api.authentication")}</span><strong>{api.contract.authentication}</strong></div>
            <div className="contract-row"><span>{t("api.response")}</span><strong>{api.contract.response}</strong></div>
            <div className="contract-row"><span>{t("api.cache")}</span><strong>{api.contract.cache}</strong></div>
            <div className="contract-row"><span>{t("api.rateLimit")}</span><strong>{api.contract.rateLimit}</strong></div>

            <div className="api-subsection">
              <div className="api-subsection-heading">
                <h4>{t("api.requestFormat")}</h4>
                <span>{t("api.requestFormatDetail")}</span>
              </div>
              <div className="api-format-table api-parameter-table" role="table" aria-label={t("api.requestFormat")}>
                <div className="api-format-head" role="row">
                  <span role="columnheader">{t("api.parameter")}</span>
                  <span role="columnheader">{t("api.location")}</span>
                  <span role="columnheader">{t("api.type")}</span>
                  <span role="columnheader">{t("api.requirement")}</span>
                  <span role="columnheader">{t("api.rules")}</span>
                </div>
                {api.requestParameters.map((item) => (
                  <div className="api-format-row" role="row" key={item.name}>
                    <code role="cell">{item.name}</code>
                    <code role="cell">{item.location}</code>
                    <code role="cell">{item.type}</code>
                    <span role="cell">{t(item.required ? "api.required" : "api.optional")}</span>
                    <span role="cell">{t("api.parameterRules", item)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="code-tabs"><button className="active">cURL</button><button>JavaScript</button><button>Python</button></div>
            <pre className="code-block">curl --request GET \{"\n"}  --url '{requestUrl}' \{"\n"}  --header 'accept: application/json'</pre>
          </section>

          <section className="panel request-tester">
            <div className="panel-title"><TerminalWindow size={19} /><h3>{t("api.requestTester")}</h3><span className="mock-chip">{t("common.backendResponse")}</span></div>
            <Field htmlFor="api-limit" label={t("api.limit")} hint={t(limitIsValid ? "api.limitHint" : "api.limitInvalid", parameter)}>
              <input
                id="api-limit"
                type="number"
                min={parameter.minimum}
                max={parameter.maximum}
                step="1"
                value={limit}
                aria-invalid={!limitIsValid}
                onChange={(event) => setLimit(event.target.value)}
              />
            </Field>
            <Button variant="primary" icon={Play} onClick={runTest} disabled={response === "loading" || !limitIsValid}>
              {t(response === "loading" ? "api.sending" : "api.sendTest")}
            </Button>

            <div className="api-subsection response-format">
              <div className="api-subsection-heading response-format-heading">
                <div>
                  <h4>{t("api.responseFormat")}</h4>
                  <span>{t("api.responseFormatDetail")}</span>
                </div>
                <span className="response-media"><strong>{api.responseSchema.status}</strong> {api.responseSchema.mediaType}</span>
              </div>
              <div className="api-format-table api-response-table" role="table" aria-label={t("api.responseFormat")}>
                <div className="api-format-head" role="row">
                  <span role="columnheader">{t("api.fieldPath")}</span>
                  <span role="columnheader">{t("api.type")}</span>
                  <span role="columnheader">{t("api.requirement")}</span>
                </div>
                {api.responseSchema.fields.map((field) => (
                  <div className="api-format-row" role="row" key={field.path}>
                    <code role="cell">{field.path}</code>
                    <code role="cell">{field.type}</code>
                    <span role="cell">{t(field.required ? "api.required" : "api.optional")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="response-box">
              {!response && (
                <>
                  <div className="response-head"><Status tone="violet">{t("api.exampleResponse")}</Status><span>{api.responseSchema.mediaType}</span></div>
                  <pre>{JSON.stringify(api.responseExample, null, 2)}</pre>
                </>
              )}
              {response === "loading" && <div className="loading-lines"><span /><span /><span /></div>}
              {response === "error" && <p className="inline-notice" role="alert">{t("common.operationFailed")}</p>}
              {response === "success" && (
                <>
                  <div className="response-head"><Status>200 OK</Status><span>{api.responseSchema.mediaType}</span></div>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
