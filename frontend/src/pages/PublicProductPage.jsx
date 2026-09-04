import { useState } from "react";
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
import { product } from "../data/demoProduct.js";
import { LanguageSwitcher } from "../components/navigation/LanguageSwitcher.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

const stageKeys = ["public.stage.request", "public.stage.terms", "public.stage.settle", "public.stage.response"];
const paidResponse = {
  payment: {
    network: "hedera:testnet",
    asset: "HBAR",
    amount: "0.20",
    transaction_id: "0.0.7392014@1788556321.441",
  },
  data: [
    { protocol: "Aerodrome", stickiness_score: 0.684, unique_wallets: 4821, total_wallets: 7048 },
    { protocol: "Uniswap", stickiness_score: 0.591, unique_wallets: 3194, total_wallets: 5404 },
  ],
};

function progressMessage(stage, t) {
  if (stage === 1) return [t("public.progress.402"), t("public.progress.402Detail")];
  if (stage === 2) return [t("public.progress.accepted"), t("public.progress.acceptedDetail")];
  return [t("public.progress.confirmed"), t("public.progress.confirmedDetail")];
}

export function PublicProductPage({ navigate }) {
  const { t } = useI18n();
  const [stage, setStage] = useState(0);

  const run = () => {
    setStage(1);
    window.setTimeout(() => setStage(2), 700);
    window.setTimeout(() => setStage(3), 1400);
    window.setTimeout(() => setStage(4), 2100);
  };

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
          <p>{t("product.description")}</p>
          <div className="public-meta">
            <Status>{t("public.graphVerified")}</Status>
            <Status tone="violet">{t("public.updated")}</Status>
            <Status tone="amber">{t("public.price")}</Status>
          </div>
        </div>
        <div className="publisher-card">
          <span>{t("public.publishedBy")}</span>
          <strong>0x71F2…9C84</strong>
          <small>{t("public.revenueDestination")}</small>
        </div>
      </section>

      <section className="consumer-console">
        <div className="request-pane">
          <div className="console-head">
            <div><TerminalWindow size={19} /><strong>{t("public.consumerRequest")}</strong></div>
            <span className="mock-chip">{t("common.safeSimulation")}</span>
          </div>
          <label className="endpoint-line"><span>GET</span><code>{product.endpoint}</code></label>
          <div className="consumer-actions">
            <Button variant="primary" icon={Play} onClick={run} disabled={stage > 0 && stage < 4}>
              {t(stage > 0 && stage < 4 ? "public.running" : stage === 4 ? "public.runAgain" : "public.requestPaidData")}
            </Button>
            <Button icon={Copy}>{t("public.copyCurl")}</Button>
          </div>
          <div className="flow-timeline">
            {stageKeys.map((labelKey, index) => (
              <div className={stage > index ? "complete" : stage === index + 1 ? "active" : ""} key={labelKey}>
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
          <div className="console-head">
            <div><BracketsCurly size={19} /><strong>{t("public.response")}</strong></div>
            {stage === 4 ? <Status>200 OK</Status> : stage > 0 ? <Status tone="amber">{t("common.processing")}</Status> : <span>{t("common.awaitingRequest")}</span>}
          </div>
          {stage === 0 && (
            <div className="empty-response tall"><Code size={34} /><span>{t("public.runToReveal")}</span></div>
          )}
          {stage > 0 && stage < 4 && (
            <div className="payment-progress">
              <ShieldCheck size={34} className="amber-text" />
              <strong>{progressTitle}</strong>
              <span>{progressDetail}</span>
            </div>
          )}
          {stage === 4 && <pre className="public-json">{JSON.stringify(paidResponse, null, 2)}</pre>}
        </div>
      </section>

      <section className="public-details">
        <div><span>{t("public.schema")}</span><strong>{t("public.schemaValue")}</strong></div>
        <div><span>{t("public.freshness")}</span><strong>{t("public.freshnessValue")}</strong></div>
        <div><span>{t("public.provenance")}</span><strong>base-dex@v1.4.2</strong></div>
        <div><span>{t("public.settlement")}</span><strong>Hedera x402</strong></div>
      </section>
    </main>
  );
}
