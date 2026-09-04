import { TerminalWindow } from "@phosphor-icons/react";
import { EntryPage } from "../pages/EntryPage.jsx";
import { PublicProductPage } from "../pages/PublicProductPage.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { AppShell } from "./AppShell.jsx";
import { useRoute } from "./useRoute.js";

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

  let page = <EntryPage navigate={navigate} />;
  if (path.startsWith("/p/")) page = <PublicProductPage navigate={navigate} />;
  if (path.startsWith("/app")) page = <AppShell path={path} navigate={navigate} />;

  return <><DesktopGate />{page}</>;
}
