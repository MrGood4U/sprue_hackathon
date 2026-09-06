import { useEffect, useRef, useState } from "react";
import {
  Brain,
  SignOut,
  SquaresFour,
  Wallet,
} from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { useAuth } from "./AuthProvider.jsx";

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)';

function accountInitial(label) {
  return label.trim().charAt(0).toLocaleUpperCase() || "S";
}

export function AccountMenu({ navigate }) {
  const { t } = useI18n();
  const { accountLabel, identity, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const label = accountLabel ?? t("auth.accountFallback");
  const workspace = identity?.workspaces?.find(
    (candidate) => candidate.id === identity.defaultWorkspaceId,
  ) ?? identity?.workspaces?.[0];
  const workspaceLabel = workspace?.name
    ?? workspace?.slug
    ?? t("auth.workspaceFallback");

  useEffect(() => {
    if (!open) return undefined;

    menuRef.current?.querySelector(MENU_ITEM_SELECTOR)?.focus();

    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeFromEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  const goTo = (path) => {
    setOpen(false);
    navigate(path);
  };

  const moveMenuFocus = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll(MENU_ITEM_SELECTOR) ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex].focus();
  };

  return (
    <div
      className="account-menu"
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="account-menu-trigger"
        ref={triggerRef}
        aria-label={t("auth.openAccountMenu", { account: label })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "creator-account-menu" : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="account-avatar" aria-hidden="true">
          {accountInitial(label)}
        </span>
      </button>

      {open && (
        <div
          id="creator-account-menu"
          className="account-menu-popover"
          role="menu"
          aria-label={t("auth.accountMenu")}
          ref={menuRef}
          onKeyDown={moveMenuFocus}
        >
          <div className="account-menu-profile">
            <span className="account-avatar account-avatar-large" aria-hidden="true">
              {accountInitial(label)}
            </span>
            <strong className="account-menu-identity">{label}</strong>
            <span className="account-menu-workspace">{workspaceLabel}</span>
            <span className="account-menu-role">{t("auth.ownerRole")}</span>
          </div>

          <div className="account-menu-list">
            <button type="button" role="menuitem" onClick={() => goTo("/app")}>
              <SquaresFour size={18} aria-hidden="true" />
              <span>{t("auth.dashboard")}</span>
            </button>
            <button type="button" role="menuitem" onClick={() => goTo("/app/wallet")}>
              <Wallet size={18} aria-hidden="true" />
              <span>{t("sidebar.walletAccess")}</span>
            </button>
            <button type="button" role="menuitem" onClick={() => goTo("/app/model")}>
              <Brain size={18} aria-hidden="true" />
              <span>{t("sidebar.modelService")}</span>
            </button>
            <button
              type="button"
              className="account-menu-sign-out"
              role="menuitem"
              onClick={() => signOut().then(() => navigate("/"))}
            >
              <SignOut size={18} aria-hidden="true" />
              <span>{t("auth.signOut")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
