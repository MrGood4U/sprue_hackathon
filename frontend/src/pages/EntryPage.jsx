import {
  ArrowRight,
  Coins,
  Database,
  Eye,
  Graph,
  GithubLogo,
  GoogleLogo,
  Sparkle,
  TerminalWindow,
  Wallet,
} from "@phosphor-icons/react";
import { Button } from "../components/ui/Button.jsx";
import { Status } from "../components/ui/Status.jsx";
import { LanguageSwitcher } from "../components/navigation/LanguageSwitcher.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";

const proofSteps = [
  [Sparkle, "entry.proof.intent.title", "entry.proof.intent.detail"],
  [Graph, "entry.proof.dag.title", "entry.proof.dag.detail"],
  [Database, "entry.proof.graph.title", "entry.proof.graph.detail"],
  [TerminalWindow, "entry.proof.api.title", "entry.proof.api.detail"],
  [Coins, "entry.proof.payment.title", "entry.proof.payment.detail"],
];

export function EntryPage({ navigate }) {
  const { t } = useI18n();
  const {
    status,
    configured,
    authenticated,
    appConfig,
    accountLabel,
    error,
    loginWith,
    signOut,
  } = useAuth();
  const productPath =
    appConfig?.demoProductUrl ?? "/p/cross-chain-dex-trader-footprint";
  const loginDisabled =
    !configured || status === "loading" || status === "initializing";

  return (
    <main className="entry-page">
      <header className="entry-nav">
        <button className="brand" onClick={() => navigate("/")}>Sprue</button>
        <div>
          <button className="text-link" onClick={() => navigate(productPath)}>{t("entry.consumerDemo")}</button>
          <LanguageSwitcher />
          {authenticated && <Button onClick={() => navigate("/app")}>{t("entry.openConsole")}</Button>}
        </div>
      </header>

      <section className="entry-hero">
        <div className="entry-copy">
          <Status tone="violet">{t("entry.productBadge")}</Status>
          <h1>{t("entry.title")}</h1>
          <p>{t("entry.description")}</p>
          <div className="entry-actions">
            <Button icon={Eye} onClick={() => navigate(productPath)}>{t("entry.tryPaidFlow")}</Button>
          </div>
          <span className="entry-disclaimer">{t("entry.disclaimer")}</span>
          <section className="entry-auth panel" aria-labelledby="creator-sign-in-title">
            <div className="entry-auth-copy">
              <strong id="creator-sign-in-title">
                {authenticated ? t("auth.signedInTitle") : t("auth.signInTitle")}
              </strong>
              <span>
                {authenticated
                  ? t("auth.signedInDetail", {
                      account: accountLabel ?? t("auth.accountFallback"),
                    })
                  : t("auth.signInDetail")}
              </span>
            </div>
            {authenticated ? (
              <div className="entry-auth-actions">
                <Button variant="primary" icon={ArrowRight} onClick={() => navigate("/app")}>{t("auth.openConsole")}</Button>
                <Button onClick={() => signOut()}>{t("auth.signOut")}</Button>
              </div>
            ) : (
              <div className="auth-provider-list" aria-label={t("auth.methodsLabel")}>
                <Button icon={GoogleLogo} disabled={loginDisabled} onClick={() => loginWith("google")}>{t("auth.google")}</Button>
                <Button icon={GithubLogo} disabled={loginDisabled} onClick={() => loginWith("github")}>{t("auth.github")}</Button>
                <Button icon={Wallet} disabled={loginDisabled} onClick={() => loginWith("wallet")}>{t("auth.metamask")}</Button>
              </div>
            )}
            {!configured && status !== "loading" && <span className="entry-auth-note">{t("auth.unavailable")}</span>}
            {status === "loading" && <span className="entry-auth-note">{t("auth.preparing")}</span>}
            {status === "error" && (
              <span className="auth-error" role="alert">
                {t("auth.loginError")}{error?.message ? ` (${error.message})` : ""}
              </span>
            )}
          </section>
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
