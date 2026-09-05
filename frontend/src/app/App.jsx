import { TerminalWindow } from "@phosphor-icons/react";
import { EntryPage } from "../pages/EntryPage.jsx";
import { PublicProductPage } from "../pages/PublicProductPage.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { AppShell } from "./AppShell.jsx";
import { useRoute } from "./useRoute.js";
import { useDemoRuntime } from "../features/runtime/DemoRuntimeProvider.jsx";

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

export function App() {
  const { path, navigate } = useRoute();
  const { status, error, refresh } = useDemoRuntime();
  const { t } = useI18n();

  if (status === "loading") {
    return <main className="runtime-gate"><div className="panel"><span className="section-label">{t("runtime.loadingLabel")}</span><h1>{t("runtime.loadingTitle")}</h1><p>{t("runtime.loadingDetail")}</p></div></main>;
  }

  if (status === "error") {
    return <main className="runtime-gate"><div className="panel"><span className="section-label">{t("runtime.errorLabel")}</span><h1>{t("runtime.errorTitle")}</h1><p>{t("runtime.errorDetail")}</p><button className="button button-primary" onClick={() => refresh().catch(() => {})}>{t("runtime.retry")}</button>{error?.message && <code>{error.message}</code>}</div></main>;
  }

  let page = <EntryPage navigate={navigate} />;
  if (path.startsWith("/p/")) page = <PublicProductPage navigate={navigate} />;
  if (path.startsWith("/app")) page = <AppShell path={path} navigate={navigate} />;

  return <><DesktopGate />{page}</>;
}
