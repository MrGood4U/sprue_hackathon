import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowUpRight,
  Check,
  CheckCircle,
  CircleNotch,
  Copy,
  CreditCard,
  CurrencyDollar,
  GearSix,
  Key,
  LockKey,
  Plus,
  Trash,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { AppHeader } from "../components/layout/AppHeader.jsx";
import { Button, IconButton } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Status } from "../components/ui/Status.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { copyText } from "../features/wallet/copyText.js";
import { GRAPH_ACCESS_MODE, showsGraphCredentials } from "../features/wallet/graphAccessMode.js";
import { PaymentAuthorizationModal } from "../features/wallet/PaymentAuthorizationModal.jsx";
import { WalletTransferModal } from "../features/wallet/WalletTransferModal.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import {
  createGraphCredential,
  createHederaAccount,
  deleteGraphCredential,
  getWalletAccess,
  selectGraphCredential,
  validateGraphCredential,
} from "../services/api/wallet.js";

export function WalletAccessPage({ navigate }) {
  const { t } = useI18n();
  const { identity, getAccessToken } = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const [walletAccess, setWalletAccess] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [modal, setModal] = useState(null);
  const [mode, setMode] = useState(GRAPH_ACCESS_MODE.X402);
  const [copyStatus, setCopyStatus] = useState({wallet: "idle", graph: "idle", hedera: "idle"});
  const [credentialForm, setCredentialForm] = useState({ label: "", apiKey: "" });
  const [credentialState, setCredentialState] = useState("idle");
  const [credentialAction, setCredentialAction] = useState(null);
  const [hederaCreateState, setHederaCreateState] = useState("idle");
  const copyFeedbackTimers = useRef({});
  const walletSettingsTrigger = useRef(null);
  const credentialsVisible = showsGraphCredentials(mode);
  const visibleCredentials = walletAccess?.credentials?.filter(
    (credential) => credential.status !== "revoked",
  ) ?? [];

  const loadWalletAccess = useCallback(async (signal) => {
    if (!workspaceId) return;
    setLoadState("loading");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("AUTH_REQUIRED");
      const data = await getWalletAccess({ workspaceId, accessToken, signal });
      setWalletAccess(data);
      setLoadState("ready");
    } catch (error) {
      if (error?.name === "AbortError") return;
      setLoadState("error");
    }
  }, [getAccessToken, workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadWalletAccess(controller.signal);
    return () => controller.abort();
  }, [loadWalletAccess, reloadToken]);

  useEffect(() => () => {
    Object.values(copyFeedbackTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  const wallet = walletAccess?.wallets?.[0] ?? null;
  const address = wallet?.addresses?.find(
    (item) => item.addressKind === "evm" && item.network === "Base Sepolia" && item.status === "active",
  ) ?? null;
  const hederaAddress = wallet?.addresses?.find(
    (item) => item.addressKind === "hedera_account_id" && item.status === "active",
  ) ?? null;
  const graphBalance = walletAccess?.balances?.find(
    (item) => item.walletAddressId === address?.id && item.symbol === "USDC",
  ) ?? null;
  const hederaBalance = walletAccess?.balances?.find(
    (item) => item.walletAddressId === hederaAddress?.id && item.symbol === "HBAR",
  ) ?? null;

  const createHedera = async () => {
    if (!wallet?.id || !workspaceId || hederaCreateState === "loading") return;
    setHederaCreateState("loading");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("AUTH_REQUIRED");
      const data = await createHederaAccount(
        {walletId: wallet.id},
        {workspaceId, accessToken},
      );
      setWalletAccess(data);
      setHederaCreateState("idle");
    } catch {
      setHederaCreateState("error");
    }
  };

  const copyWalletAddress = async (kind, value) => {
    if (!value) return;
    window.clearTimeout(copyFeedbackTimers.current[kind]);
    setCopyStatus((current) => ({...current, [kind]: "copying"}));
    try {
      await copyText(value);
      setCopyStatus((current) => ({...current, [kind]: "copied"}));
    } catch {
      setCopyStatus((current) => ({...current, [kind]: "failed"}));
    }
    copyFeedbackTimers.current[kind] = window.setTimeout(
      () => setCopyStatus((current) => ({...current, [kind]: "idle"})),
      4000,
    );
  };

  const copyFeedback = (kind) => copyStatus[kind] === "copied"
    ? t(kind === "hedera"
      ? "wallet.hederaAddressCopied"
      : kind === "graph"
        ? "wallet.graphAddressCopied"
        : "wallet.privyAddressCopied")
    : copyStatus[kind] === "failed"
      ? t("wallet.addressCopyFailed")
      : "";

  const openWalletSettings = () => {
    walletSettingsTrigger.current = document.activeElement;
    setModal("walletSettings");
  };

  const closeWalletSettings = () => {
    setModal(null);
    window.requestAnimationFrame(() => walletSettingsTrigger.current?.focus?.());
  };

  const openCredentialModal = () => {
    setCredentialForm({ label: "", apiKey: "" });
    setCredentialState("idle");
    setModal("credential");
  };

  const closeCredentialModal = () => {
    setCredentialForm({ label: "", apiKey: "" });
    setCredentialState("idle");
    setModal(null);
  };

  const saveCredential = async (event) => {
    event.preventDefault();
    const label = credentialForm.label.trim();
    const apiKey = credentialForm.apiKey.trim();
    if (!label || !apiKey || label.length > 80 || apiKey.length > 4096) {
      setCredentialState("invalid");
      return;
    }
    setCredentialState("saving");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken || !workspaceId) throw new Error("AUTH_REQUIRED");
      await createGraphCredential({ label, apiKey }, { workspaceId, accessToken });
      setCredentialForm({ label: "", apiKey: "" });
      setModal(null);
      setReloadToken((value) => value + 1);
    } catch {
      setCredentialState("error");
    }
  };

  const runCredentialAction = async (type, credential) => {
    if (credentialAction?.state === "loading" || !workspaceId) return false;
    setCredentialAction({type, credentialId: credential.id, state: "loading"});
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("AUTH_REQUIRED");
      const input = {
        credentialId: credential.id,
        lockVersion: credential.lockVersion,
      };
      const operation = type === "validate"
        ? validateGraphCredential
        : type === "select"
          ? selectGraphCredential
          : deleteGraphCredential;
      const updated = await operation(input, {workspaceId, accessToken});
      setWalletAccess((current) => current ? {
        ...current,
        credentials: type === "delete"
          ? current.credentials.filter((item) => item.id !== credential.id)
          : current.credentials.map((item) => item.id === updated.id
            ? updated
            : type === "select"
              ? {...item, isSelected: false}
              : item),
      } : current);
      setCredentialAction({
        type,
        credentialId: credential.id,
        state: "success",
        resultStatus: updated.status,
      });
      setReloadToken((value) => value + 1);
      return true;
    } catch (error) {
      setCredentialAction({
        type,
        credentialId: credential.id,
        state: "error",
        errorCode: error?.message,
      });
      return false;
    }
  };

  const confirmCredentialDelete = async () => {
    const credential = modal?.type === "deleteCredential" ? modal.credential : null;
    if (!credential) return;
    if (await runCredentialAction("delete", credential)) setModal(null);
  };

  const credentialFeedback = (credential) => {
    if (credentialAction?.credentialId !== credential.id || credentialAction.state === "loading") {
      return "";
    }
    if (credentialAction.state === "error") {
      return credentialAction.errorCode === "PRECONDITION_FAILED"
        ? t("wallet.credentialChangedError")
        : t(`wallet.credential${credentialAction.type === "validate" ? "Validation" : credentialAction.type === "select" ? "Selection" : "Delete"}Error`);
    }
    if (credentialAction.type === "validate") {
      return credentialAction.resultStatus === "active"
        ? t("wallet.credentialValidated")
        : t("wallet.credentialRejected");
    }
    return credentialAction.type === "select"
      ? t("wallet.credentialSelected")
      : "";
  };

  if (loadState === "loading" && !walletAccess) {
    return (
      <div className="page">
        <AppHeader title={t("wallet.title")} subtitle={t("wallet.subtitle")} navigate={navigate} />
        <section className="panel wallet-page-state" aria-live="polite">
          <CircleNotch className="is-spinning" size={22} />
          <p>{t("wallet.loading")}</p>
        </section>
      </div>
    );
  }

  if (loadState === "error" && !walletAccess) {
    return (
      <div className="page">
        <AppHeader title={t("wallet.title")} subtitle={t("wallet.subtitle")} navigate={navigate} />
        <section className="panel wallet-page-state" role="alert">
          <WarningCircle size={22} />
          <div><h2>{t("wallet.loadErrorTitle")}</h2><p>{t("wallet.loadErrorDetail")}</p></div>
          <Button icon={ArrowClockwise} onClick={() => setReloadToken((value) => value + 1)}>{t("wallet.retry")}</Button>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <AppHeader title={t("wallet.title")} subtitle={t("wallet.subtitle")} navigate={navigate} />

      <div className="wallet-grid">
        <section className="panel wallet-hero">
          <div className="panel-kicker"><Wallet size={18} /> {t("wallet.embeddedWallet")}</div>
          <div className="wallet-address-row">
            <div>
              <span>{t("wallet.creatorWallet")}</span>
              <div className="wallet-address-copy-line">
                <strong>{address?.address ?? t("wallet.addressUnavailable")}</strong>
                {address && (
                  <IconButton
                    className={`wallet-inline-copy is-${copyStatus.wallet}`}
                    label={copyStatus.wallet === "copied" ? t("wallet.privyAddressCopied") : t("wallet.copyPrivyAddress")}
                    onClick={() => void copyWalletAddress("wallet", address.address)}
                    disabled={copyStatus.wallet === "copying"}
                  >
                    {copyStatus.wallet === "copied" ? <Check size={18} /> : <Copy size={18} />}
                  </IconButton>
                )}
              </div>
              <small>{address ? t("wallet.addressNetwork", { network: address.network }) : t("wallet.walletUnavailable")}</small>
              <span className={`wallet-copy-feedback ${copyStatus.wallet === "failed" ? "is-error" : ""}`} role={copyStatus.wallet === "failed" ? "alert" : "status"} aria-live="polite">{copyFeedback("wallet")}</span>
            </div>
          </div>
          <div className="wallet-balance-grid">
            <article className="wallet-balance-card">
              <div className="wallet-balance-heading">
                <span>{t("wallet.graphBalance")}</span>
                <Status tone={graphBalance ? "green" : "neutral"}>{graphBalance ? t("wallet.liveBalance") : t("wallet.balanceUnavailable")}</Status>
              </div>
              <strong>{graphBalance?.displayAmount ?? "\u2014"} USDC</strong>
              <div className="wallet-balance-address">
                <small>{address?.network ?? "Base Sepolia"} {"\u00b7"} {address?.address ?? t("wallet.addressUnavailable")}</small>
                {address && (
                  <IconButton
                    className={`wallet-inline-copy is-${copyStatus.graph}`}
                    label={copyStatus.graph === "copied" ? t("wallet.graphAddressCopied") : t("wallet.copyGraphAddress")}
                    onClick={() => void copyWalletAddress("graph", address.address)}
                    disabled={copyStatus.graph === "copying"}
                  >
                    {copyStatus.graph === "copied" ? <Check size={16} /> : <Copy size={16} />}
                  </IconButton>
                )}
              </div>
              <span className={`wallet-copy-feedback ${copyStatus.graph === "failed" ? "is-error" : ""}`} role={copyStatus.graph === "failed" ? "alert" : "status"} aria-live="polite">{copyFeedback("graph")}</span>
              <p>{t("wallet.graphBalanceDetail")}</p>
              <div className="wallet-balance-actions">
                <Button variant="primary" icon={CreditCard} onClick={() => setModal("fund")} disabled={!address}>{t("wallet.fund")}</Button>
                <Button
                  icon={ArrowUpRight}
                  onClick={() => setModal({ type: "transfer", balance: graphBalance })}
                  disabled={!address || !graphBalance}
                >
                  {t("wallet.transferOut")}
                </Button>
                <Button icon={GearSix} onClick={openWalletSettings} disabled={!wallet || !address}>
                  {t("wallet.settings")}
                </Button>
              </div>
            </article>
            <article className="wallet-balance-card">
              <div className="wallet-balance-heading">
                <span>{t("wallet.revenueBalance")}</span>
                <Status tone={hederaBalance ? "green" : "neutral"}>
                  {hederaBalance ? t("wallet.hederaLiveBalance") : t("wallet.notConnected")}
                </Status>
              </div>
              <strong>{hederaBalance?.displayAmount ?? "\u2014"} HBAR</strong>
              <div className="wallet-balance-address">
                <small>
                  {hederaAddress
                    ? `${hederaAddress.network} \u00b7 ${hederaAddress.address}`
                    : t("wallet.hederaAccountUnavailable")}
                </small>
                {hederaAddress && (
                  <IconButton
                    className={`wallet-inline-copy is-${copyStatus.hedera}`}
                    label={copyStatus.hedera === "copied" ? t("wallet.hederaAddressCopied") : t("wallet.copyHederaAddress")}
                    onClick={() => void copyWalletAddress("hedera", hederaAddress.address)}
                    disabled={copyStatus.hedera === "copying"}
                  >
                    {copyStatus.hedera === "copied" ? <Check size={16} /> : <Copy size={16} />}
                  </IconButton>
                )}
              </div>
              <span className={`wallet-copy-feedback ${copyStatus.hedera === "failed" ? "is-error" : ""}`} role={copyStatus.hedera === "failed" ? "alert" : "status"} aria-live="polite">{copyFeedback("hedera")}</span>
              <p>
                {hederaAddress
                  ? t("wallet.hederaAccountCreatedDetail")
                  : t("wallet.revenueBalancePendingDetail")}
              </p>
              <div className="wallet-balance-actions">
                {!hederaAddress ? (
                  <Button
                    variant="primary"
                    icon={hederaCreateState === "loading" ? CircleNotch : undefined}
                    className={hederaCreateState === "loading" ? "wallet-create-hedera is-loading" : "wallet-create-hedera"}
                    disabled={!wallet || hederaCreateState === "loading"}
                    aria-busy={hederaCreateState === "loading"}
                    onClick={createHedera}
                  >
                    {hederaCreateState === "loading"
                      ? t("wallet.creatingHederaAccount")
                      : t("wallet.createHederaAccount")}
                  </Button>
                ) : (
                  <Button
                    icon={ArrowUpRight}
                    onClick={() => setModal({ type: "transfer", balance: hederaBalance })}
                    disabled={!address || !hederaAddress.canSpend || !hederaBalance}
                  >
                    {t("wallet.transferOut")}
                  </Button>
                )}
              </div>
              {hederaCreateState === "error" && (
                <div className="wallet-card-error" role="alert">
                  <WarningCircle size={17} />
                  <span>{t("wallet.hederaAccountCreateError")}</span>
                </div>
              )}
            </article>
          </div>
          <div className="security-line">
            <LockKey size={17} />
            <span>{t("wallet.securityDetail")}</span>
          </div>
        </section>

      </div>

      <section className="panel access-panel">
        <div className="panel-toolbar">
          <div><h2>{t("wallet.graphAccess")}</h2><p>{t("wallet.graphAccessDetail")}</p></div>
          <Status tone={visibleCredentials.length ? "green" : "neutral"}>
            {visibleCredentials.length ? t("common.configured") : t("wallet.notConfigured")}
          </Status>
        </div>
        <div className="segmented" role="radiogroup" aria-label={t("wallet.accessMode")}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === GRAPH_ACCESS_MODE.API_KEY}
            className={mode === GRAPH_ACCESS_MODE.API_KEY ? "active" : ""}
            onClick={() => setMode(GRAPH_ACCESS_MODE.API_KEY)}
          >
            <Key size={18} /><span><strong>{t("wallet.apiKey")}</strong><small>{t("wallet.apiKeyDetail")}</small></span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === GRAPH_ACCESS_MODE.X402}
            className={mode === GRAPH_ACCESS_MODE.X402 ? "active" : ""}
            onClick={() => setMode(GRAPH_ACCESS_MODE.X402)}
          >
            <CurrencyDollar size={18} /><span><strong>{t("wallet.x402")}</strong><small>{t("wallet.x402Detail")}</small></span>
          </button>
        </div>
        <div className="access-detail">
          {mode === GRAPH_ACCESS_MODE.X402 ? (
            <><Status tone="amber">{t("wallet.x402Pending")}</Status><p>{t("wallet.x402PendingDetail")}</p></>
          ) : (
            <><Status tone="violet">{t("wallet.credentialVault")}</Status><p>{t("wallet.credentialVaultDetail")}</p></>
          )}
        </div>
      </section>

      {credentialsVisible && (
        <section className="panel">
          <div className="panel-toolbar">
            <div><h2>{t("wallet.credentials")}</h2><p>{t("wallet.credentialsDetail")}</p></div>
            <Button icon={Plus} onClick={openCredentialModal}>{t("wallet.addCredential")}</Button>
          </div>
          {visibleCredentials.length ? visibleCredentials.map((credential) => (
            <div className={`credential-row ${credential.isSelected ? "is-selected" : ""}`.trim()} key={credential.id}>
              <span className="credential-icon"><Key size={19} /></span>
              <span className="credential-summary"><strong>{credential.label}</strong><small>{credential.publicPrefix ?? "\u2022\u2022\u2022\u2022"} {"\u00b7"} {credential.fingerprint.slice(0, 12)}</small></span>
              <div className="credential-actions" aria-label={t("wallet.credentialActions")}>
                <Status tone={credential.status === "active" ? "green" : "amber"}>{t(`wallet.credentialStatus.${credential.status}`)}</Status>
                <label className="credential-choice">
                  <input
                    type="radio"
                    name="selected-graph-credential"
                    checked={credential.isSelected}
                    disabled={credential.status !== "active" || credentialAction?.state === "loading"}
                    onChange={() => void runCredentialAction("select", credential)}
                  />
                  <span>{credential.isSelected ? t("wallet.selectedCredential") : t("wallet.useCredential")}</span>
                </label>
                <Button
                  icon={credentialAction?.state === "loading" && credentialAction.credentialId === credential.id && credentialAction.type === "validate" ? CircleNotch : CheckCircle}
                  className={credentialAction?.state === "loading" && credentialAction.credentialId === credential.id && credentialAction.type === "validate" ? "is-loading" : ""}
                  disabled={credentialAction?.state === "loading"}
                  aria-busy={credentialAction?.state === "loading" && credentialAction.credentialId === credential.id && credentialAction.type === "validate"}
                  onClick={() => void runCredentialAction("validate", credential)}
                >
                  {credentialAction?.state === "loading" && credentialAction.credentialId === credential.id && credentialAction.type === "validate"
                    ? t("wallet.validatingCredential")
                    : t("wallet.validateCredential")}
                </Button>
                <IconButton
                  label={t("wallet.deleteCredential")}
                  disabled={credentialAction?.state === "loading"}
                  onClick={() => setModal({type: "deleteCredential", credential})}
                >
                  <Trash size={18} />
                </IconButton>
              </div>
              {credentialFeedback(credential) && (
                <p className={`credential-feedback ${credentialAction?.state === "error" || credentialAction?.resultStatus === "invalid" ? "is-error" : "is-success"}`} role={credentialAction?.state === "error" ? "alert" : "status"}>
                  {credentialFeedback(credential)}
                </p>
              )}
            </div>
          )) : (
            <div className="wallet-empty-state"><Key size={20} /><p>{t("wallet.noCredentials")}</p></div>
          )}
          <div className="credential-validation-notice">
            <WarningCircle size={17} />
            <p>{t("wallet.credentialValidationNotice")}</p>
          </div>
        </section>
      )}

      {modal === "credential" && (
        <Modal
          title={t("wallet.addCredentialTitle")}
          eyebrow={t("wallet.encryptedReference")}
          onClose={closeCredentialModal}
          footer={
            <>
              <Button onClick={closeCredentialModal} disabled={credentialState === "saving"}>{t("common.cancel")}</Button>
              <Button type="submit" form="graph-credential-form" variant="primary" disabled={credentialState === "saving"}>
                {credentialState === "saving" ? t("wallet.savingCredential") : t("wallet.saveReference")}
              </Button>
            </>
          }
        >
          <form id="graph-credential-form" className="wallet-credential-form" onSubmit={saveCredential}>
            <Field htmlFor="graph-credential-label" label={t("wallet.credentialName")}>
              <input id="graph-credential-label" value={credentialForm.label} onChange={(event) => setCredentialForm((value) => ({ ...value, label: event.target.value }))} autoComplete="off" disabled={credentialState === "saving"} />
            </Field>
            <Field htmlFor="graph-api-key" label={t("wallet.apiKey")} hint={t("wallet.secretHint")}>
              <input id="graph-api-key" value={credentialForm.apiKey} onChange={(event) => setCredentialForm((value) => ({ ...value, apiKey: event.target.value }))} type="password" placeholder={t("wallet.secretPlaceholder")} autoComplete="new-password" disabled={credentialState === "saving"} />
            </Field>
            {(credentialState === "invalid" || credentialState === "error") && (
              <div className="inline-notice" role="alert"><WarningCircle size={18} /><span>{t(credentialState === "invalid" ? "wallet.credentialInvalid" : "wallet.credentialSaveError")}</span></div>
            )}
          </form>
        </Modal>
      )}
      {modal?.type === "deleteCredential" && (
        <Modal
          title={t("wallet.deleteCredentialTitle")}
          eyebrow={t("wallet.credentialActions")}
          onClose={() => credentialAction?.state !== "loading" && setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)} disabled={credentialAction?.state === "loading"}>{t("common.cancel")}</Button>
              <Button
                variant="danger"
                icon={credentialAction?.state === "loading" ? CircleNotch : Trash}
                className={credentialAction?.state === "loading" ? "is-loading" : ""}
                disabled={credentialAction?.state === "loading"}
                aria-busy={credentialAction?.state === "loading"}
                onClick={() => void confirmCredentialDelete()}
              >
                {credentialAction?.state === "loading" ? t("wallet.deletingCredential") : t("wallet.deleteCredential")}
              </Button>
            </>
          }
        >
          <p>{t("wallet.deleteCredentialDetail", {name: modal.credential.label})}</p>
          {credentialAction?.state === "error" && credentialAction.type === "delete" && (
            <div className="inline-notice" role="alert"><WarningCircle size={18} /><span>{t("wallet.credentialDeleteError")}</span></div>
          )}
        </Modal>
      )}
      {modal === "fund" && address && (
        <Modal
          title={t("wallet.fundTitle")}
          eyebrow={t("wallet.liveFunding")}
          onClose={() => setModal(null)}
          footer={<><Button onClick={() => setModal(null)}>{t("common.close")}</Button><Button variant="primary" icon={Copy} onClick={() => void copyWalletAddress("wallet", address.address)}>{t("wallet.copyAddress")}</Button></>}
        >
          <div className="transfer-balance-summary">
            <span>{t("wallet.fundingNetwork")}</span>
            <strong>{address.network}</strong>
            <small>{address.address}</small>
          </div>
          <div className="inline-notice"><WarningCircle size={18} /><span>{t("wallet.fundingWarning")}</span></div>
        </Modal>
      )}
      {modal?.type === "transfer" && modal.balance && address && (
        <WalletTransferModal
          balance={modal.balance}
          senderAddress={address.address}
          onClose={() => setModal(null)}
          onRefresh={() => setReloadToken((value) => value + 1)}
        />
      )}
      {modal === "walletSettings" && wallet && address && (
        <PaymentAuthorizationModal
          wallet={wallet}
          address={address}
          walletAccess={walletAccess}
          workspaceId={workspaceId}
          getAccessToken={getAccessToken}
          onUpdated={setWalletAccess}
          onClose={closeWalletSettings}
        />
      )}
    </div>
  );
}
