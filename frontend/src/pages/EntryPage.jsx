import {
  ArrowRight,
  Coins,
  Database,
  Eye,
  Graph,
  Sparkle,
  TerminalWindow,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/Button.jsx";
import { Status } from "../components/ui/Status.jsx";
import { productSlug } from "../data/demoProduct.js";
import { LanguageSwitcher } from "../components/navigation/LanguageSwitcher.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

const proofSteps = [
  [Sparkle, "entry.proof.intent.title", "entry.proof.intent.detail"],
  [Graph, "entry.proof.dag.title", "entry.proof.dag.detail"],
  [Database, "entry.proof.graph.title", "entry.proof.graph.detail"],
  [TerminalWindow, "entry.proof.api.title", "entry.proof.api.detail"],
  [Coins, "entry.proof.payment.title", "entry.proof.payment.detail"],
];

export function EntryPage({ navigate }) {
  const { t } = useI18n();

  return (
    <main className="entry-page">
      <header className="entry-nav">
        <button className="brand" onClick={() => navigate("/")}>Sprue</button>
        <div>
          <button className="text-link" onClick={() => navigate(`/p/${productSlug}`)}>{t("entry.consumerDemo")}</button>
          <LanguageSwitcher />
          <Button onClick={() => navigate("/app")}>{t("entry.openPrototype")}</Button>
        </div>
      </header>

      <section className="entry-hero">
        <div className="entry-copy">
          <Status tone="violet">{t("entry.prototypeBadge")}</Status>
          <h1>{t("entry.title")}</h1>
          <p>{t("entry.description")}</p>
          <div className="entry-actions">
            <Button variant="primary" icon={ArrowRight} onClick={() => navigate("/app")}>{t("entry.enterWorkspace")}</Button>
            <Button icon={Eye} onClick={() => navigate(`/p/${productSlug}`)}>{t("entry.tryPaidFlow")}</Button>
          </div>
          <span className="entry-disclaimer">{t("entry.disclaimer")}</span>
        </div>

        <div className="entry-proof">
          <span className="section-label">{t("entry.traceableChain")}</span>
          {proofSteps.map(([Icon, titleKey, descriptionKey], index) => (
            <div className="proof-step" key={titleKey}>
              <span>{index + 1}</span>
              <Icon size={22} />
              <div><strong>{t(titleKey)}</strong><small>{t(descriptionKey)}</small></div>
              {index < proofSteps.length - 1 && <ArrowRight size={17} />}
            </div>
          ))}
        </div>
      </section>

      <footer className="entry-footer">
        <span>The Graph</span><span>Privy</span><span>Hedera</span><span>Blocky402</span>
      </footer>
    </main>
  );
}
