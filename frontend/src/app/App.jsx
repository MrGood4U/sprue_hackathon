import { TerminalWindow } from "@phosphor-icons/react";
import { EntryPage } from "../pages/EntryPage.jsx";
import { PublicProductPage } from "../pages/PublicProductPage.jsx";
import { AppShell } from "./AppShell.jsx";
import { useRoute } from "./useRoute.js";

function DesktopGate() {
  return (
    <div className="desktop-gate">
      <TerminalWindow size={28} />
      <strong>Open Sprue in a wider browser window</strong>
      <span>This prototype is designed for web browsers at 1024 px or wider.</span>
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
