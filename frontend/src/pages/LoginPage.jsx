import {
  ArrowLeft,
  ArrowRight,
  GithubLogo,
  GoogleLogo,
  Wallet,
} from "@phosphor-icons/react";
import { LanguageSwitcher } from "../components/navigation/LanguageSwitcher.jsx";
import { Button } from "../components/ui/Button.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function LoginPage({ navigate }) {
  const { t } = useI18n();
  const {
    status,
    configured,
    authenticated,
    accountLabel,
    error,
    loginWith,
    signOut,
  } = useAuth();
  const loginDisabled =
    !configured || status === "loading" || status === "initializing";

  return (
    <main className="login-page">
      <header className="login-nav">
        <button className="brand" onClick={() => navigate("/")}>Sprue</button>
        <LanguageSwitcher />
      </header>

      <section className="login-main" aria-labelledby="creator-sign-in-title">
        <div className="login-card panel">
          <button className="text-link login-back" onClick={() => navigate("/")}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("auth.backHome")}
          </button>
          <div className="login-copy">
            <span className="section-label">{t("auth.eyebrow")}</span>
            <h1 id="creator-sign-in-title">
              {authenticated ? t("auth.signedInTitle") : t("auth.signInTitle")}
            </h1>
            <p>
              {authenticated
                ? t("auth.signedInDetail", {
                    account: accountLabel ?? t("auth.accountFallback"),
                  })
                : t("auth.signInDetail")}
            </p>
          </div>

          {authenticated ? (
            <div className="auth-actions">
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

          {!configured && status !== "loading" && <span className="auth-note">{t("auth.unavailable")}</span>}
          {status === "loading" && <span className="auth-note" role="status">{t("auth.preparing")}</span>}
          {status === "initializing" && <span className="auth-note" role="status">{t("auth.loadingDetail")}</span>}
          {status === "error" && (
            <span className="auth-error" role="alert">
              {t("auth.loginError")}{error?.message ? ` (${error.message})` : ""}
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
