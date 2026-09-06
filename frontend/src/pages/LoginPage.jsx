import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect } from "react";
import { LanguageSwitcher } from "../components/navigation/LanguageSwitcher.jsx";
import { Button } from "../components/ui/Button.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { GitHubBrandMark, GoogleBrandMark } from "../features/auth/BrandMarks.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function LoginPage({ navigate }) {
  const { t } = useI18n();
  const {
    status,
    configured,
    authenticated,
    error,
    loginWith,
  } = useAuth();
  const loginDisabled =
    !configured || status === "loading" || status === "initializing";

  useEffect(() => {
    if (authenticated) navigate("/app");
  }, [authenticated, navigate]);

  if (authenticated) return null;

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
            <h1 id="creator-sign-in-title">{t("auth.signInTitle")}</h1>
            <p>{t("auth.signInDetail")}</p>
          </div>

          <div className="auth-provider-list" aria-label={t("auth.methodsLabel")}>
            <Button icon={GoogleBrandMark} disabled={loginDisabled} onClick={() => loginWith("google")}>{t("auth.google")}</Button>
            <Button icon={GitHubBrandMark} disabled={loginDisabled} onClick={() => loginWith("github")}>{t("auth.github")}</Button>
          </div>

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
