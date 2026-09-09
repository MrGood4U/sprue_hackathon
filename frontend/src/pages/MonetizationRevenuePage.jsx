import {ArrowRight, CheckCircle, Coins, RocketLaunch, ShieldCheck, UserCircle, Wallet, WarningCircle} from "@phosphor-icons/react";
import {ProductHeader} from "../components/product/ProductHeader.jsx";
import {Button} from "../components/ui/Button.jsx";
import {Status} from "../components/ui/Status.jsx";
import {useProductDelivery} from "../features/delivery/useProductDelivery.js";
import {productRefFromPath} from "../features/products/productRoute.js";
import {useI18n} from "../i18n/I18nProvider.jsx";

function blockerText(t, blocker) {
  const key = `delivery.blocker.${blocker.code}`;
  const translated = t(key);
  return translated === key ? blocker.message : translated;
}

function formatAtomic(money) {
  if (!money) return "--";
  const negative = money.amountAtomic.startsWith("-");
  const digits = (negative ? money.amountAtomic.slice(1) : money.amountAtomic).padStart(money.decimals + 1, "0");
  const whole = money.decimals === 0 ? digits : digits.slice(0, -money.decimals);
  const fraction = money.decimals === 0 ? "" : digits.slice(-money.decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""} ${money.symbol}`;
}

function MonetizeRouteState({delivery, productRef, navigate}) {
  const {t} = useI18n();
  const product = delivery.product ?? {name: productRef || t("monetize.unknownProduct"), slug: productRef};
  return <><ProductHeader product={product} productRef={productRef} active="monetize" navigate={navigate} /><main className="runtime-gate builder-route-state"><div className="panel"><span className="section-label">{t("monetize.liveData")}</span><h1>{t(delivery.status === "loading" ? "monetize.loading" : "monetize.loadError")}</h1><p>{t(delivery.status === "loading" ? "monetize.loadingDetail" : "monetize.loadErrorDetail")}</p>{delivery.status === "error" && <Button variant="primary" onClick={() => delivery.refresh()}>{t("common.retry")}</Button>}</div></main></>;
}

function MoneyList({title, rows, empty, icon: Icon}) {
  return <article className="money-card"><div><Icon size={18} /><span>{title}</span></div>{rows.length > 0 ? rows.map((money) => <strong key={`${money.networkId}:${money.assetId}`}>{formatAtomic(money)}</strong>) : <small>{empty}</small>}</article>;
}

function LoadedMonetizationPage({delivery, productRef, navigate}) {
  const {t} = useI18n();
  const {product} = delivery;
  const api = delivery.delivery.api;
  const monetization = delivery.delivery.monetization;
  const publication = monetization.publication;
  const recipient = publication?.recipient;
  const price = publication?.price;
  const isActive = monetization.readiness === "active";
  const readinessTone = isActive ? "green" : monetization.readiness === "draft" ? "violet" : "amber";

  return <>
    <ProductHeader product={product} productRef={productRef} active="monetize" navigate={navigate} onRename={delivery.rename} />
    <main className="product-content">
      <div className="content-heading"><div><span className="eyebrow">Hedera x402</span><h1>{t("monetize.title")}</h1><p>{t("monetize.description")}</p></div><Status tone={readinessTone}>{t(`monetize.readiness.${monetization.readiness}`)}</Status></div>

      {monetization.blockers.length > 0 && <div className="delivery-blockers" role="status">{monetization.blockers.map((blocker) => <div className="inline-notice" key={blocker.code}><WarningCircle size={18} /><span>{blockerText(t, blocker)}</span></div>)}</div>}

      <div className="monetize-grid">
        <section className="panel publish-steps">
          <div className={`publish-step ${api.readiness === "available" ? "complete" : ""}`}><span>1</span><div><strong>{t("monetize.endpointSelected")}</strong><small>{api.contract?.endpointUrl ?? t("monetize.endpointMissing")}</small></div>{api.readiness === "available" && <CheckCircle size={19} weight="fill" />}</div>
          <div className={`publish-step ${price ? "complete" : ""}`}><span>2</span><div><strong>{t("monetize.pricing")}</strong><small>{price ? formatAtomic(price) : t("monetize.priceMissing")}</small></div>{price && <CheckCircle size={19} weight="fill" />}</div>
          <div className={`publish-step ${recipient?.identityStatus === "resolved" ? "complete" : ""}`}><span>3</span><div><strong>{t("monetize.revenueDestination")}</strong><small>{recipient?.networkAccountRef ?? t("monetize.recipientMissing")}</small></div>{recipient?.identityStatus === "resolved" && <Status>{t("common.verified")}</Status>}</div>
          <div className={`publish-step ${recipient?.canReceive && recipient?.canSpend ? "complete" : ""}`}><span>4</span><div><strong>{t("monetize.recipientCapability")}</strong><small>{t(recipient?.canReceive && recipient?.canSpend ? "monetize.capabilityVerified" : "monetize.capabilityMissing")}</small></div>{recipient?.canReceive && recipient?.canSpend && <CheckCircle size={19} weight="fill" />}</div>
          <div className={`publish-step ${isActive ? "complete" : ""}`}><span>5</span><div><strong>{t("monetize.publishBlocky")}</strong><small>{publication ? `${publication.facilitator ?? "--"} · ${publication.paymentProtocolVersion ?? "--"} · ${publication.status}` : t("monetize.publicationMissing")}</small></div>{isActive && <CheckCircle size={19} weight="fill" />}</div>
          <Button variant="primary" icon={RocketLaunch} disabled={!delivery.delivery.capabilities.publishX402 || isActive}>{t(isActive ? "monetize.publicationComplete" : "monetize.publishUnavailable")}</Button>
          {!delivery.delivery.capabilities.publishX402 && <div className="inline-notice"><WarningCircle size={18} /><span>{t("monetize.publishUnavailableDetail")}</span></div>}
        </section>

        <aside className="panel settlement-preview">
          <span className="section-label">{t("monetize.settlementFacts")}</span>
          <div className="settlement-amount"><strong>{price ? formatAtomic(price) : "--"}</strong><span>{t("monetize.perRequest")}</span></div>
          <div className="settlement-flow"><div><UserCircle size={20} /><span>{t("monetize.buyer")}</span></div><ArrowRight size={20} /><div><ShieldCheck size={20} /><span>{publication?.facilitator ?? "--"}</span></div><ArrowRight size={20} /><div><Wallet size={20} /><span>{t("monetize.creator")}</span></div></div>
          <dl className="detail-list"><div><dt>{t("monetize.creatorReceives")}</dt><dd>{price ? formatAtomic(price) : t("common.notAvailable")}</dd></div><div><dt>{t("monetize.network")}</dt><dd>{price?.network ?? t("common.notAvailable")}</dd></div><div><dt>{t("monetize.asset")}</dt><dd>{price?.symbol ?? t("common.notAvailable")}</dd></div><div><dt>{t("monetize.protocol")}</dt><dd>{publication?.paymentProtocolVersion ?? t("common.notAvailable")}</dd></div><div><dt>{t("monetize.scheme")}</dt><dd>{publication?.paymentScheme ?? t("common.notAvailable")}</dd></div></dl>
        </aside>
      </div>

      <section className="panel revenue-section"><div className="panel-title"><Coins size={19} /><h3>{t("monetize.confirmedRevenue")}</h3><Status tone="violet">{t("monetize.liveData")}</Status></div><div className="money-grid"><MoneyList title={t("monetize.grossSales")} rows={monetization.revenue.grossSales} empty={t("monetize.noRevenue")} icon={Coins} /><MoneyList title={t("monetize.creatorProceeds")} rows={monetization.revenue.creatorProceeds} empty={t("monetize.noRevenue")} icon={Wallet} /><MoneyList title={t("monetize.providerFees")} rows={monetization.revenue.providerFees} empty={t("monetize.noRevenue")} icon={ShieldCheck} /></div></section>

      <section className="panel sales-section"><div className="panel-title"><Coins size={19} /><h3>{t("monetize.sales")}</h3><span>{t("monetize.latestSales", {count: monetization.sales.length})}</span></div>{monetization.sales.length === 0 ? <div className="delivery-empty-inline"><Coins size={22} /><span>{t("monetize.noSales")}</span></div> : <div className="sales-table" role="table" aria-label={t("monetize.sales")}><div className="sales-row sales-head" role="row"><span>{t("monetize.correlation")}</span><span>{t("monetize.status")}</span><span>{t("monetize.amount")}</span><span>{t("monetize.startedAt")}</span></div>{monetization.sales.map((sale) => <div className="sales-row" role="row" key={sale.id}><code>{sale.correlationId}</code><Status tone={sale.status === "served" ? "green" : sale.status === "failed" ? "amber" : "violet"}>{sale.status}</Status><span>{formatAtomic(sale.amount)}</span><time dateTime={sale.startedAt}>{sale.startedAt}</time></div>)}</div>}</section>
    </main>
  </>;
}

export function MonetizationRevenuePage({path, navigate}) {
  const productRef = productRefFromPath(path);
  const delivery = useProductDelivery(productRef);
  return <div className="product-page">{delivery.status === "ready" ? <LoadedMonetizationPage delivery={delivery} productRef={productRef} navigate={navigate} /> : <MonetizeRouteState delivery={delivery} productRef={productRef} navigate={navigate} />}</div>;
}
