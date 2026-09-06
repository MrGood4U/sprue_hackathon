import { TerminalWindow } from "@phosphor-icons/react";
import { EntryPage } from "../pages/EntryPage.jsx";
import { LoginPage } from "../pages/LoginPage.jsx";
import { PublicProductPage } from "../pages/PublicProductPage.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { AppShell } from "./AppShell.jsx";
import { useRoute } from "./useRoute.js";
import {
  DemoRuntimeProvider,
  useDemoRuntime,
} from "../features/runtime/DemoRuntimeProvider.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { Button } from "../components/ui/Button.jsx";

function DesktopGate() {
  const { t } = useI18n();

  return (
    <div className="desktop-gate">
      <TerminalWindow size={28} />
      <strong>{t("desktopGate.title")}</strong>
      <span>{t("desktopGate.detail")}</span>
    </div>
  );
}

function RuntimeGate({ children }) {
  const { status, error, refresh } = useDemoRuntime();
  const { t } = useI18n();

  if (status === "loading") {
    return <main className="runtime-gate"><div className="panel"><span className="section-label">{t("runtime.loadingLabel")}</span><h1>{t("runtime.loadingTitle")}</h1><p>{t("runtime.loadingDetail")}</p></div></main>;
  }

  if (status === "error") {
    return <main className="runtime-gate"><div className="panel"><span className="section-label">{t("runtime.errorLabel")}</span><h1>{t("runtime.errorTitle")}</h1><p>{t("runtime.errorDetail")}</p><button className="button button-primary" onClick={() => refresh().catch(() => {})}>{t("runtime.retry")}</button>{error?.message && <code>{error.message}</code>}</div></main>;
  }

  return children;
}

function RuntimeBoundary({ children }) {
  return (
    <DemoRuntimeProvider>
      <RuntimeGate>{children}</RuntimeGate>
    </DemoRuntimeProvider>
  );
}

function CreatorRoute({ path, navigate }) {
  const { status, error, retry, signOut } = useAuth();
  const { t } = useI18n();

  if (["unauthenticated", "unavailable"].includes(status))
    return <LoginPage navigate={navigate} />;
  if (["loading", "initializing"].includes(status))
    return (
      <main className="runtime-gate">
        <div className="panel">
          <span className="section-label">{t("auth.loadingLabel")}</span>
          <h1>{t("auth.loadingTitle")}</h1>
          <p>{t("auth.loadingDetail")}</p>
        </div>
      </main>
    );
  if (status === "error")
    return (
      <main className="runtime-gate">
        <div className="panel">
          <span className="section-label">{t("auth.errorLabel")}</span>
          <h1>{t("auth.errorTitle")}</h1>
          <p>{t("auth.errorDetail")}</p>
          <div className="auth-actions">
            <Button variant="primary" onClick={() => retry()}>
              {t("auth.retry")}
            </Button>
            <Button onClick={() => signOut().then(() => navigate("/"))}>
              {t("auth.signOut")}
            </Button>
          </div>
          {error?.message && <code>{error.message}</code>}
        </div>
      </main>
    );
  return (
    <RuntimeBoundary>
      <AppShell path={path} navigate={navigate} />
    </RuntimeBoundary>
  );
}

export function App() {
  const { path, navigate } = useRoute();

  let page = <EntryPage navigate={navigate} />;
  if (path === "/login") page = <LoginPage navigate={navigate} />;
  if (path.startsWith("/p/"))
    page = (
      <RuntimeBoundary>
        <PublicProductPage navigate={navigate} />
      </RuntimeBoundary>
    );
  if (path.startsWith("/app"))
    page = <CreatorRoute path={path} navigate={navigate} />;

  return <><DesktopGate />{page}</>;
}
