import { useMemo, useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { Button } from "../../components/ui/Button.jsx";
import { Field } from "../../components/ui/Field.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import {
  hasSpendableBalance,
  prepareWalletTransfer,
  resolveTransferProfile,
  TransferValidationError,
  transferEvidenceUrl,
  waitForTransferReceipt,
} from "./transfer.js";

const TERMINAL_PHASES = new Set(["confirmed", "submitted", "reverted"]);

function providerErrorKey(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return /cancel|reject|denied|declin/.test(message)
    ? "wallet.transferCancelled"
    : "wallet.transferProviderError";
}

export function WalletTransferModal({ balance, senderAddress, onClose, onRefresh }) {
  const { t } = useI18n();
  const { sendTransaction } = useSendTransaction();
  const [form, setForm] = useState({ destination: "", amount: "" });
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("idle");
  const [feedbackKey, setFeedbackKey] = useState(null);
  const [hash, setHash] = useState(null);
  const [submittedProfile, setSubmittedProfile] = useState(null);
  const profile = useMemo(() => {
    try {
      return resolveTransferProfile(balance);
    } catch {
      return null;
    }
  }, [balance]);
  const submitting = phase === "submitting";
  const finished = TERMINAL_PHASES.has(phase);
  const spendable = hasSpendableBalance(balance);
  const inputsDisabled = !spendable || submitting || phase === "confirming" || finished;

  const closeSafely = () => {
    if (!submitting) onClose();
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null }));
    if (phase === "error") {
      setPhase("idle");
      setFeedbackKey(null);
    }
  };

  const submitTransfer = async (event) => {
    event.preventDefault();
    setErrors({});
    setFeedbackKey(null);
    if (!spendable) {
      setFeedbackKey("wallet.transferNoBalance");
      setPhase("error");
      return;
    }
    let prepared;
    try {
      prepared = prepareWalletTransfer({
        balance,
        destination: form.destination,
        amount: form.amount,
      });
    } catch (error) {
      const validationError = error instanceof TransferValidationError
        ? error
        : new TransferValidationError("TRANSFER_INVALID");
      const key = `wallet.transferError.${validationError.code}`;
      if (validationError.field) setErrors({ [validationError.field]: t(key) });
      else setFeedbackKey(key);
      setPhase("error");
      return;
    }

    setPhase("submitting");
    try {
      const result = await sendTransaction(prepared.transaction, {
        address: senderAddress,
        uiOptions: {
          showWalletUIs: true,
          isCancellable: true,
          description: t("wallet.transferPrivyDescription", {
            amount: prepared.displayAmount,
            asset: prepared.profile.symbol,
          }),
          buttonText: t("wallet.transferConfirmInPrivy"),
          transactionInfo: {
            title: t("wallet.transferDetails"),
            action: t("wallet.transferAction"),
            ...(prepared.profile.kind === "erc20" ? {
              contractInfo: {
                name: "USDC",
                url: `${prepared.profile.chain.blockExplorers.default.url}/address/${prepared.profile.assetIdentifier}`,
              },
            } : {}),
          },
          successHeader: t("wallet.transferSubmittedTitle"),
          successDescription: t("wallet.transferSubmittedPrivyDetail"),
        },
      });
      setHash(result.hash);
      setSubmittedProfile(prepared.profile);
      setPhase("confirming");
      onRefresh?.();
      const outcome = await waitForTransferReceipt(prepared.profile, result.hash);
      setPhase(outcome);
      onRefresh?.();
    } catch (error) {
      setFeedbackKey(providerErrorKey(error));
      setPhase("error");
    }
  };

  const evidenceUrl = submittedProfile && hash
    ? transferEvidenceUrl(submittedProfile, hash)
    : null;

  return (
    <Modal
      title={t("wallet.transferTitle", { asset: balance.symbol })}
      eyebrow={t("wallet.transferEyebrow", { network: balance.network })}
      onClose={closeSafely}
      footer={finished ? (
        <Button variant="primary" onClick={onClose}>{t("common.done")}</Button>
      ) : (
        <>
          <Button onClick={closeSafely} disabled={submitting}>{t("common.cancel")}</Button>
          <Button
            type="submit"
            form="wallet-transfer-form"
            variant="primary"
            icon={submitting || phase === "confirming" ? CircleNotch : ArrowSquareOut}
            className={submitting || phase === "confirming" ? "is-loading" : ""}
            disabled={!spendable || submitting || phase === "confirming" || !profile}
            aria-busy={submitting || phase === "confirming"}
          >
            {submitting
              ? t("wallet.transferAwaitingPrivy")
              : phase === "confirming"
                ? t("wallet.transferConfirming")
                : t("wallet.transferReview")}
          </Button>
        </>
      )}
    >
      <form id="wallet-transfer-form" className="wallet-transfer-form" onSubmit={submitTransfer} noValidate>
        <div className="transfer-balance-summary">
          <span>{t("wallet.transferAvailable")}</span>
          <strong>{balance.displayAmount} {balance.symbol}</strong>
          <small>{balance.network} {"\u00b7"} {senderAddress}</small>
        </div>

        {!finished && (
          <div className="field-grid wallet-transfer-fields">
            <Field
              htmlFor="wallet-transfer-destination"
              label={t("wallet.transferDestination")}
              hint={errors.destination || (balance.symbol === "HBAR"
                ? t("wallet.transferHederaDestinationHint")
                : t("wallet.transferEvmDestinationHint"))}
            >
              <input
                id="wallet-transfer-destination"
                value={form.destination}
                onChange={(event) => updateField("destination", event.target.value)}
                placeholder={t(balance.symbol === "HBAR"
                  ? "wallet.transferHederaDestinationPlaceholder"
                  : "wallet.transferDestinationPlaceholder")}
                autoComplete="off"
                spellCheck="false"
                disabled={inputsDisabled}
                aria-invalid={Boolean(errors.destination)}
              />
            </Field>
            <Field
              htmlFor="wallet-transfer-amount"
              label={t("wallet.transferAmount")}
              hint={errors.amount || t("wallet.transferAmountHint", { decimals: balance.decimals })}
            >
              <div className="input-suffix">
                <input
                  id="wallet-transfer-amount"
                  value={form.amount}
                  onChange={(event) => updateField("amount", event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={inputsDisabled}
                  aria-invalid={Boolean(errors.amount)}
                />
                <span>{balance.symbol}</span>
              </div>
            </Field>
          </div>
        )}

        {!finished && (
          <div className="inline-notice">
            <WarningCircle size={18} />
            <span>{t(!spendable
              ? "wallet.transferNoBalance"
              : balance.symbol === "USDC"
                ? "wallet.transferBaseFeeWarning"
                : "wallet.transferHederaFeeWarning", { asset: balance.symbol })}</span>
          </div>
        )}

        {feedbackKey && (
          <div className="wallet-transfer-feedback is-error" role="alert">
            <XCircle size={18} />
            <span>{t(feedbackKey)}</span>
          </div>
        )}

        {(phase === "confirming" || finished) && hash && (
          <div
            className={`wallet-transfer-feedback ${phase === "reverted" ? "is-error" : phase === "confirmed" ? "is-success" : "is-pending"}`}
            role={phase === "reverted" ? "alert" : "status"}
            aria-live="polite"
          >
            {phase === "confirming" ? <CircleNotch className="is-spinning" size={18} />
              : phase === "reverted" ? <XCircle size={18} />
                : <CheckCircle size={18} />}
            <div>
              <strong>{t(`wallet.transferStatus.${phase}`)}</strong>
              <p>{t(`wallet.transferStatusDetail.${phase}`)}</p>
              <code>{hash}</code>
              {evidenceUrl && (
                <a href={evidenceUrl} target="_blank" rel="noreferrer">
                  {t("wallet.transferViewEvidence")} <ArrowSquareOut size={14} />
                </a>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
