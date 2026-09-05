import { useState } from "react";
import {
  ArrowSquareOut,
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
import { product } from "../services/demo/fixtures/product.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useRequestTest } from "../features/deployment/useRequestTest.js";

export function ApiDeploymentPage({ navigate }) {
  const { t } = useI18n();
  const { response, result, runTest } = useRequestTest();
  const [copied, setCopied] = useState(false);

  const copyEndpoint = async () => {
    await navigator.clipboard?.writeText(product.endpoint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="product-page">
      <ProductHeader active="api" navigate={navigate} buildStatus={t("api.endpointReady")} />
      <main className="product-content">
        <div className="content-heading">
          <div>
            <span className="eyebrow">{t("api.eyebrow")}</span>
            <h1>{t("api.title")}</h1>
            <p>{t("api.description")}</p>
          </div>
          <Button variant="primary" icon={RocketLaunch}>{t("api.deploy")}</Button>
        </div>

        <section className="endpoint-strip">
          <span className="method">GET</span>
          <code>{product.endpoint}</code>
          <IconButton label={t("api.copyEndpoint")} onClick={copyEndpoint}>
            {copied ? <Check size={18} className="green-text" /> : <Copy size={18} />}
          </IconButton>
          <Status>{t("api.healthy")}</Status>
        </section>

        <div className="api-grid">
          <section className="panel api-contract">
            <div className="panel-title"><FileCode size={19} /><h3>{t("api.contract")}</h3><Status tone="violet">v1</Status></div>
            <div className="contract-row"><span>{t("api.authentication")}</span><strong>{t("api.x402Payment")}</strong></div>
            <div className="contract-row"><span>{t("api.response")}</span><strong>application/json</strong></div>
            <div className="contract-row"><span>{t("api.cache")}</span><strong>{t("api.fiveMinutes")}</strong></div>
            <div className="contract-row"><span>{t("api.rateLimit")}</span><strong>{t("api.requestsPerMinute")}</strong></div>
            <div className="code-tabs"><button className="active">cURL</button><button>JavaScript</button><button>Python</button></div>
            <pre className="code-block">curl --request GET \{"\n"}  --url {product.endpoint} \{"\n"}  --header 'accept: application/json'</pre>
          </section>

          <section className="panel request-tester">
            <div className="panel-title"><TerminalWindow size={19} /><h3>{t("api.requestTester")}</h3><span className="mock-chip">{t("common.mockResponse")}</span></div>
            <Field label={t("api.limit")}><input defaultValue="10" /></Field>
            <Button variant="primary" icon={Play} onClick={runTest} disabled={response === "loading"}>
              {t(response === "loading" ? "api.sending" : "api.sendTest")}
            </Button>
            <div className="response-box">
              {!response && <div className="empty-response"><TerminalWindow size={26} /><span>{t("api.runToInspect")}</span></div>}
              {response === "loading" && <div className="loading-lines"><span /><span /><span /></div>}
              {response === "error" && <p className="inline-notice" role="alert">{t("common.operationFailed")}</p>}
              {response === "success" && (
                <>
                  <div className="response-head"><Status>200 OK</Status><span>{t("api.cachedTiming")}</span></div>
                  <pre>{JSON.stringify(result, null, 2)}</pre>
                </>
              )}
            </div>
          </section>
        </div>

        <section className="panel deployment-table">
          <div className="panel-toolbar">
            <div><h2>{t("api.deploymentEvidence")}</h2><p>{t("api.deploymentEvidenceDetail")}</p></div>
            <Button icon={ArrowSquareOut}>{t("api.openLogs")}</Button>
          </div>
          <div className="evidence-grid">
            <div><span>{t("api.artifactDigest")}</span><code>sha256:7f2c…a9d1</code></div>
            <div><span>{t("api.region")}</span><strong>us-east</strong></div>
            <div><span>{t("api.lastDeployed")}</span><strong>{t("api.lastDeployedValue")}</strong></div>
            <div><span>{t("api.sourceVersion")}</span><strong>{t("api.immutable")}</strong></div>
          </div>
        </section>
      </main>
    </div>
  );
}
