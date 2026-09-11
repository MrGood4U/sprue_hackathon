import { useMemo, useState } from "react";
import { useDelegatedActions } from "@privy-io/react-auth";
import { CheckCircle, CircleNotch, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { formatUnits } from "viem";
import { Button } from "../../components/ui/Button.jsx";
import { Field } from "../../components/ui/Field.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { Status } from "../../components/ui/Status.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { synchronizePaymentAuthorization } from "../../services/api/wallet.js";
import { parseExactAmount } from "./transfer.js";

export function PaymentAuthorizationModal({
  wallet,
  address,
  walletAccess,
  workspaceId,
  getAccessToken,
  onUpdated,
  onClose,
}) {
  const { t } = useI18n();
  const { delegateWallet } = useDelegatedActions();
  const currentGrant = walletAccess?.signerGrants?.find(
    (item) => item.walletId === wallet?.id && ["pending", "active"].includes(item.status),
  ) ?? null;
  const currentPolicy = walletAccess?.spendingPolicies?.find(
    (item) => item.walletSignerGrantId === currentGrant?.id && ["draft", "active"].includes(item.status),
  ) ?? null;
  const initialLimit = useMemo(
    () => currentPolicy ? formatUnits(BigInt(currentPolicy.maxPerPeriodAtomic), 6) : "",
    [currentPolicy],
  );
  const [dailyLimit, setDailyLimit] = useState(initialLimit);
  const [state, setState] = useState("idle");

  const save = async (event) => {
    event.preventDefault();
    if (!wallet?.id || !address?.address || !workspaceId || state === "saving") return;
    let dailyLimitAtomic;
    try {
      dailyLimitAtomic = parseExactAmount(dailyLimit, 6).toString();
      if (!/^[1-9][0-9]{0,77}$/.test(dailyLimitAtomic)) throw new Error("INVALID_LIMIT");
    } catch {
      setState("invalid");
      return;
    }
    setState("saving");
    try {
      if (!currentGrant) {
        await delegateWallet({address: address.address, chainType: "ethereum"});
      }
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("AUTH_REQUIRED");
      const updated = await synchronizePaymentAuthorization(
        {walletId: wallet.id, dailyLimitAtomic},
        {workspaceId, accessToken},
      );
      const updatedGrant = updated.signerGrants.find(
        (item) => item.walletId === wallet.id && ["pending", "active"].includes(item.status),
      );
      const updatedPolicy = updated.spendingPolicies.find(
        (item) => item.walletSignerGrantId === updatedGrant?.id && ["draft", "active"].includes(item.status),
      );
      if (updatedPolicy) {
        setDailyLimit(formatUnits(BigInt(updatedPolicy.maxPerPeriodAtomic), 6));
      }
      onUpdated(updated);
      setState("saved");
    } catch (error) {
      setState(error?.message === "CAPABILITY_DISABLED" ? "notConfigured" : "error");
    }
  };

  const failed = ["error", "invalid", "notConfigured"].includes(state);
  const submitLabel = state === "saving"
    ? t("wallet.savingAuthorization")
    : currentGrant
      ? t("wallet.saveDailyLimit")
      : t("wallet.authorizeAndSave");

  return (
    <Modal
      title={t("wallet.walletSettingsTitle")}
      eyebrow={t("wallet.walletSettingsEyebrow")}
      className="wallet-settings-modal"
      width="600px"
      onClose={onClose}
      closeDisabled={state === "saving"}
      footer={
        <>
          <Button onClick={onClose} disabled={state === "saving"}>{t("common.cancel")}</Button>
          <Button
            type="submit"
            form="wallet-settings-form"
            variant="primary"
            icon={state === "saving" ? CircleNotch : currentGrant ? CheckCircle : ShieldCheck}
            className={state === "saving" ? "is-loading" : ""}
            disabled={!wallet || !address || state === "saving"}
            aria-busy={state === "saving"}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <p className="wallet-settings-detail">{t("wallet.walletSettingsDetail")}</p>
      <div className="wallet-settings-statuses">
        <div>
          <span>{t("wallet.privyAuthorizationStatus")}</span>
          <Status tone={currentGrant?.status === "active" ? "green" : "neutral"}>
            {currentGrant?.status === "active"
              ? t("wallet.authorizationActive")
              : currentGrant
                ? t("wallet.authorizationObserved")
                : t("wallet.authorizationInactive")}
          </Status>
        </div>
        <div>
          <span>{t("wallet.dailyBudgetStatus")}</span>
          <strong>{currentPolicy ? `${initialLimit} USDC` : t("wallet.notSet")}</strong>
        </div>
      </div>
      <form id="wallet-settings-form" className="wallet-settings-form" onSubmit={save}>
        <Field
          htmlFor="wallet-daily-limit"
          label={t("wallet.dailyLimit")}
          hint={t("wallet.dailyLimitHint")}
        >
          <div className="wallet-limit-input">
            <input
              id="wallet-daily-limit"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={dailyLimit}
              onChange={(event) => {
                setDailyLimit(event.target.value);
                setState("idle");
              }}
              placeholder="10.00"
              aria-invalid={state === "invalid"}
              aria-describedby={state === "invalid" ? "wallet-daily-limit-error" : undefined}
              disabled={state === "saving"}
            />
            <span>USDC</span>
          </div>
        </Field>
        <p
          id={state === "invalid" ? "wallet-daily-limit-error" : undefined}
          className={`wallet-authorization-feedback ${failed ? "is-error" : ""}`}
          role={failed ? "alert" : "status"}
          aria-live="polite"
        >
          {state === "saved" ? t("wallet.authorizationSaved")
            : state === "invalid" ? t("wallet.dailyLimitInvalid")
              : state === "notConfigured" ? t("wallet.authorizationNotConfigured")
                : state === "error" ? t("wallet.authorizationError") : ""}
        </p>
      </form>
      <div className="wallet-authorization-note">
        <WarningCircle size={17} />
        <span>{t("wallet.authorizationBoundary")}</span>
      </div>
    </Modal>
  );
}
