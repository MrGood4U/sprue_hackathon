import { useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  Eye,
  RocketLaunch,
  ShieldCheck,
  UserCircle,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { ProductHeader } from "../components/product/ProductHeader.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Status } from "../components/ui/Status.jsx";
import { product, productSlug } from "../data/demoProduct.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function MonetizationRevenuePage({ navigate }) {
  const { t } = useI18n();
  const [published, setPublished] = useState(false);
  const [price, setPrice] = useState("0.20");
  const numericPrice = Number(price) || 0;

  return (
    <div className="product-page">
      <ProductHeader
        active="monetize"
        navigate={navigate}
        buildStatus={t(published ? "monetize.published" : "monetize.ready")}
      />
      <main className="product-content">
        <div className="content-heading">
          <div>
            <span className="eyebrow">Hedera x402</span>
            <h1>{t("monetize.title")}</h1>
            <p>{t("monetize.description")}</p>
          </div>
          <Status tone={published ? "green" : "amber"}>{t(published ? "monetize.livePrototype" : "common.draft")}</Status>
        </div>

        <div className="monetize-grid">
          <section className="panel publish-steps">
            <div className="publish-step complete">
              <span>1</span><div><strong>{t("monetize.endpointSelected")}</strong><small>{product.endpoint}</small></div><CheckCircle size={19} weight="fill" />
            </div>
            <div className="publish-step active">
              <span>2</span><div><strong>{t("monetize.priceSplit")}</strong><small>{t("monetize.priceSplitDetail")}</small></div>
            </div>
            <div className="pricing-editor">
              <div className="field-grid">
                <Field label={t("monetize.buyerPrice")}>
                  <div className="input-suffix"><input value={price} onChange={(event) => setPrice(event.target.value)} /><span>HBAR</span></div>
                </Field>
                <Field label={t("monetize.sprueFee")}>
                  <div className="input-suffix"><input defaultValue="5" /><span>%</span></div>
                </Field>
              </div>
              <div className="split-bar"><span style={{ width: "95%" }} /><i /></div>
              <div className="split-legend">
                <span><i className="creator-color" />{t("monetize.creatorReceivesPercent")}</span>
                <span><i className="sprue-color" />{t("monetize.sprueReceivesPercent")}</span>
              </div>
            </div>
            <div className="publish-step">
              <span>3</span><div><strong>{t("monetize.revenueDestination")}</strong><small>{t("monetize.hederaAccount")}</small></div><Status>{t("common.verified")}</Status>
            </div>
            <div className="publish-step">
              <span>4</span><div><strong>{t("monetize.publishBlocky")}</strong><small>{t("monetize.publishBlockyDetail")}</small></div>
            </div>
            <Button variant="primary" icon={RocketLaunch} onClick={() => setPublished(true)} disabled={published}>
              {t(published ? "monetize.publishedMock" : "monetize.publishEndpoint")}
            </Button>
            <div className="inline-notice">
              <WarningCircle size={18} />
              <span>{t("monetize.simulationNotice")}</span>
            </div>
          </section>

          <aside className="panel settlement-preview">
            <span className="section-label">{t("monetize.settlementPreview")}</span>
            <div className="settlement-amount"><strong>{price || "0.00"}</strong><span>{t("monetize.perRequest")}</span></div>
            <div className="settlement-flow">
              <div><UserCircle size={20} /><span>{t("monetize.buyer")}</span></div><ArrowRight size={20} />
              <div><ShieldCheck size={20} /><span>Blocky402</span></div><ArrowRight size={20} />
              <div><Wallet size={20} /><span>{t("monetize.creator")}</span></div>
            </div>
            <dl className="detail-list">
              <div><dt>{t("monetize.creatorReceives")}</dt><dd>{(numericPrice * 0.95).toFixed(3)} HBAR</dd></div>
              <div><dt>{t("monetize.serviceFee")}</dt><dd>{(numericPrice * 0.05).toFixed(3)} HBAR</dd></div>
              <div><dt>{t("monetize.network")}</dt><dd>{t("monetize.hederaTestnet")}</dd></div>
              <div><dt>{t("monetize.asset")}</dt><dd>HBAR</dd></div>
            </dl>
            <div className="evidence-callout">
              <ShieldCheck size={19} />
              <div><strong>{t("monetize.evidenceRetained")}</strong><span>{t("monetize.evidenceDetail")}</span></div>
            </div>
            {published && <Button icon={Eye} onClick={() => navigate(`/p/${productSlug}`)}>{t("monetize.openPublic")}</Button>}
          </aside>
        </div>
      </main>
    </div>
  );
}
