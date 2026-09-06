import { Sidebar } from "../components/navigation/Sidebar.jsx";
import { ApiDeploymentPage } from "../pages/ApiDeploymentPage.jsx";
import { AgentPage } from "../pages/AgentPage.jsx";
import { DashboardPage } from "../pages/DashboardPage.jsx";
import { MonetizationRevenuePage } from "../pages/MonetizationRevenuePage.jsx";
import { ModelServicePage } from "../pages/ModelServicePage.jsx";
import { ProductBuilderPage } from "../pages/ProductBuilderPage.jsx";
import { WalletAccessPage } from "../pages/WalletAccessPage.jsx";

function resolveCreatorPage(path, navigate) {
  if (path === "/app/wallet") return <WalletAccessPage />;
  if (path === "/app/model") return <ModelServicePage />;
  if (path.endsWith("/agent")) return <AgentPage navigate={navigate} />;
  if (path.endsWith("/build")) return <ProductBuilderPage navigate={navigate} />;
  if (path.endsWith("/api")) return <ApiDeploymentPage navigate={navigate} />;
  if (path.endsWith("/monetize")) return <MonetizationRevenuePage navigate={navigate} />;
  return <DashboardPage navigate={navigate} />;
}

export function AppShell({ path, navigate }) {
  return (
    <div className="app-shell">
      <Sidebar path={path} navigate={navigate} />
      <div className="app-main">{resolveCreatorPage(path, navigate)}</div>
    </div>
  );
}
