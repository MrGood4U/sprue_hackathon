import {
  BracketsCurly,
  Check,
  CheckCircle,
  Code,
  Copy,
  Play,
  ShieldCheck,
  TerminalWindow,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/Button.jsx";
import { Status } from "../components/ui/Status.jsx";
import { LanguageSwitcher } from "../components/navigation/LanguageSwitcher.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useConsumerRequest } from "../features/consumer/useConsumerRequest.js";
import { useDemoRuntime } from "../features/runtime/DemoRuntimeProvider.jsx";

const stageKeys = ["public.stage.request", "public.stage.terms", "public.stage.settle", "public.stage.response"];

function progressMessage(stage, t) {
  if (stage === 1) return [t("public.progress.402"), t("public.progress.402Detail")];
  if (stage === 2) return [t("public.progress.accepted"), t("public.progress.acceptedDetail")];
  return [t("public.progress.confirmed"), t("public.progress.confirmedDetail")];
}

export function PublicProductPage({ navigate }) {
  const { t } = useI18n();
  const { state } = useDemoRuntime();
  const { product, public: publicProduct, api } = state;
  const { stage, result, status, run } = useConsumerRequest();

  const [progressTitle, progressDetail] = progressMessage(stage, t);

  return (
    <main className="public-page">
      <header className="public-nav">
        <button className="brand" onClick={() => navigate("/")}>Sprue</button>
        <span className="hosted-badge"><CheckCircle size={16} weight="fill" />{t("public.hostedProduct")}</span>
        <div className="public-nav-actions">
          <LanguageSwitcher />
          <Button onClick={() => navigate("/app")}>{t("public.creatorConsole")}</Button>
        </div>
      </header>

      <section className="public-hero">
        <div>
          <span className="eyebrow">{t("public.eyebrow")}</span>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <div className="public-meta">
            <Status>{t("public.graphVerified")}</Status>
            <Status tone="violet">{t("public.updated")}</Status>
            <Status tone="amber">{publicProduct.price}</Status>
          </div>
        </div>
        <div className="publisher-card">
          <span>{t("public.publishedBy")}</span>
          <strong>{publicProduct.publisher}</strong>
          <small>{t("public.revenueDestination")}</small>
        </div>
      </section>

      <section className="consumer-console">
        <div className="request-pane">
          <div className="console-head">
            <div><TerminalWindow size={19} /><strong>{t("public.consumerRequest")}</strong></div>
            <span className="mock-chip">{t("common.backendResponse")}</span>
          </div>
          <label className="endpoint-line"><span>{api.method}</span><code>{api.endpoint}</code></label>
          <div className="consumer-actions">
            <Button variant="primary" icon={Play} onClick={run} disabled={status === "loading"}>
              {t(status === "loading" ? "public.running" : stage === 4 ? "public.runAgain" : "public.requestPaidData")}
            </Button>
            <Button icon={Copy}>{t("public.copyCurl")}</Button>
          </div>
          <div className="flow-timeline">
            {stageKeys.map((labelKey, index) => (
              <div className={stage > index ? "complete" : status === "loading" && stage === index ? "active" : ""} aria-current={status === "loading" && stage === index ? "step" : undefined} key={labelKey}>
                <span>{stage > index ? <Check size={14} weight="bold" /> : index + 1}</span>
                <strong>{t(labelKey)}</strong>
              </div>
            ))}
          </div>
          <div className="inline-notice">
            <WarningCircle size={18} />
            <span>{t("public.simulationNotice")}</span>
          </div>
        </div>

        <div className="response-pane">
          <div className="console-head" role="status">
            <div><BracketsCurly size={19} /><strong>{t("public.response")}</strong></div>
            {status === "error" ? <Status tone="amber">{t("common.operationFailed")}</Status> : stage === 4 ? <Status>200 OK</Status> : stage > 0 ? <Status tone="amber">{t("common.processing")}</Status> : <span>{t("common.awaitingRequest")}</span>}
          </div>
          {status === "error" && <p className="inline-notice" role="alert">{t("common.operationFailed")}</p>}
          {status === "idle" && (
            <div className="empty-response tall"><Code size={34} /><span>{t("public.runToReveal")}</span></div>
          )}
          {status === "loading" && (
            <div className="payment-progress">
              <ShieldCheck size={34} className="amber-text" />
              <strong>{progressTitle}</strong>
              <span>{progressDetail}</span>
            </div>
          )}
          {stage === 4 && <pre className="public-json">{JSON.stringify(result, null, 2)}</pre>}
        </div>
      </section>

      <section className="public-details">
        <div><span>{t("public.schema")}</span><strong>{publicProduct.schema}</strong></div>
        <div><span>{t("public.freshness")}</span><strong>{publicProduct.freshness}</strong></div>
        <div><span>{t("public.provenance")}</span><strong>{publicProduct.provenance}</strong></div>
        <div><span>{t("public.settlement")}</span><strong>{publicProduct.settlement}</strong></div>
      </section>
    </main>
  );
}
