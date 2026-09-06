import {
  ArrowLeft,
  Books,
  Brain,
  Gear,
  SignOut,
  SquaresFour,
  UserCircle,
  Wallet,
} from "@phosphor-icons/react";
import { IconButton } from "../ui/Button.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { useAuth } from "../../features/auth/AuthProvider.jsx";

export function Sidebar({ path, navigate }) {
  const { t } = useI18n();
  const { accountLabel, signOut } = useAuth();
  const isProducts = path === "/app" || path.includes("/products/");

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <button className="brand" onClick={() => navigate("/app")}>Sprue</button>
        <IconButton label={t("sidebar.collapse")}><ArrowLeft size={16} /></IconButton>
      </div>

      <nav className="side-nav" aria-label={t("sidebar.primaryNavigation")}>
        <button className={isProducts ? "active" : ""} onClick={() => navigate("/app")}>
          <SquaresFour size={20} />
          <span>{t("sidebar.products")}</span>
        </button>
        <button className={path === "/app/wallet" ? "active" : ""} onClick={() => navigate("/app/wallet")}>
          <Wallet size={20} />
          <span>{t("sidebar.walletAccess")}</span>
        </button>
        <button className={path === "/app/model" ? "active" : ""} onClick={() => navigate("/app/model")}>
          <Brain size={20} />
          <span>{t("sidebar.modelService")}</span>
        </button>
      </nav>

      <nav className="side-nav side-nav-bottom" aria-label={t("sidebar.secondaryNavigation")}>
        <button onClick={() => alert(t("sidebar.docsAlert"))}>
          <Books size={20} />
          <span>{t("sidebar.docs")}</span>
        </button>
        <button onClick={() => alert(t("sidebar.settingsAlert"))}>
          <Gear size={20} />
          <span>{t("sidebar.settings")}</span>
        </button>
      </nav>
      <div className="sidebar-account">
        <UserCircle size={20} />
        <div className="sidebar-account-copy">
          <strong>{t("auth.accountTitle")}</strong>
          <span>{accountLabel ?? t("auth.accountFallback")}</span>
        </div>
        <button
          className="sidebar-sign-out"
          onClick={() => signOut().then(() => navigate("/"))}
        >
          <SignOut size={15} />
          <span>{t("auth.signOut")}</span>
        </button>
      </div>
      <div className="workspace-status">{t("sidebar.workspaceStatus")}</div>
    </aside>
  );
}
