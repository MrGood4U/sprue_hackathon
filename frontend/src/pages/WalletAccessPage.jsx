import { useState } from "react";
import {
  ArrowSquareOut,
  Copy,
  CreditCard,
  CurrencyDollar,
  DotsThree,
  Key,
  LockKey,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { AppHeader } from "../components/layout/AppHeader.jsx";
import { Button, IconButton } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Status } from "../components/ui/Status.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useDemoRuntime } from "../features/runtime/DemoRuntimeProvider.jsx";

export function WalletAccessPage() {
  const { t } = useI18n();
  const { state } = useDemoRuntime();
  const { wallet } = state;
  const [modal, setModal] = useState(null);
  const [mode, setMode] = useState(wallet.access.defaultMode);

  return (
    <div className="page">
      <AppHeader
        title={t("wallet.title")}
        subtitle={t("wallet.subtitle")}
        actions={<Button icon={Plus} onClick={() => setModal("credential")}>{t("wallet.addCredential")}</Button>}
      />

      <div className="wallet-grid">
        <section className="panel wallet-hero">
          <div className="panel-kicker"><Wallet size={18} /> {t("wallet.embeddedWallet")}</div>
          <div className="wallet-address-row">
            <div><span>{t("wallet.creatorWallet")}</span><strong>{wallet.displayAddress}</strong></div>
            <IconButton label={t("wallet.copyAddress")}><Copy size={18} /></IconButton>
          </div>
          <div className="wallet-balance"><span>{t("wallet.availableSpend")}</span><strong>{wallet.balance.amount} {wallet.balance.asset}</strong></div>
          <div className="wallet-actions">
            <Button variant="primary" icon={CreditCard} onClick={() => setModal("fund")}>{t("wallet.fund")}</Button>
            <Button icon={ArrowSquareOut}>{t("wallet.view")}</Button>
          </div>
          <div className="security-line">
            <LockKey size={17} />
            <span>{t("wallet.securityDetail")}</span>
          </div>
        </section>

        <section className="panel policy-card">
          <div className="panel-title"><ShieldCheck size={19} /><h3>{t("wallet.spendAuthority")}</h3><Status>{wallet.spendAuthority.status}</Status></div>
          <dl className="detail-list">
            <div><dt>{t("wallet.perRequest")}</dt><dd>{wallet.spendAuthority.perRequest}</dd></div>
            <div><dt>{t("wallet.dailyCeiling")}</dt><dd>{wallet.spendAuthority.dailyCeiling}</dd></div>
            <div><dt>{t("wallet.allowedPayee")}</dt><dd>{wallet.spendAuthority.allowedPayee}</dd></div>
            <div><dt>{t("wallet.expires")}</dt><dd>{wallet.spendAuthority.expires}</dd></div>
          </dl>
          <Button icon={SlidersHorizontal} onClick={() => setModal("policy")}>{t("wallet.editPolicy")}</Button>
        </section>
      </div>

      <section className="panel access-panel">
        <div className="panel-toolbar">
          <div><h2>{t("wallet.graphAccess")}</h2><p>{t("wallet.graphAccessDetail")}</p></div>
          <Status>{t("common.configured")}</Status>
        </div>
        <div className="segmented" role="group" aria-label={t("wallet.accessMode")}>
          <button className={mode === "api" ? "active" : ""} onClick={() => setMode("api")}>
            <Key size={18} /><span><strong>{t("wallet.apiKey")}</strong><small>{t("wallet.apiKeyDetail")}</small></span>
          </button>
          <button className={mode === "x402" ? "active" : ""} onClick={() => setMode("x402")}>
            <CurrencyDollar size={18} /><span><strong>{t("wallet.x402")}</strong><small>{t("wallet.x402Detail")}</small></span>
          </button>
        </div>
        <div className="access-detail">
          {mode === "x402" ? (
            <><Status tone="amber">{t("wallet.costProtected")}</Status><p>{t("wallet.costProtectedDetail")}</p></>
          ) : (
            <><Status tone="violet">{t("wallet.credentialVault")}</Status><p>{t("wallet.credentialVaultDetail")}</p></>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-toolbar"><div><h2>{t("wallet.credentials")}</h2><p>{t("wallet.credentialsDetail")}</p></div></div>
        {wallet.credentials.map((credential) => <div className="credential-row" key={credential.name}>
          <span className="credential-icon"><Key size={19} /></span>
          <span><strong>{credential.name}</strong><small>{credential.detail}</small></span>
          <Status tone="violet">{credential.status}</Status>
          <IconButton label={t("wallet.credentialActions")}><DotsThree size={21} /></IconButton>
        </div>)}
      </section>

      {modal === "credential" && (
        <Modal
          title={t("wallet.addCredentialTitle")}
          eyebrow={t("wallet.encryptedReference")}
          onClose={() => setModal(null)}
          footer={<><Button onClick={() => setModal(null)}>{t("common.cancel")}</Button><Button variant="primary" onClick={() => setModal(null)}>{t("wallet.saveReference")}</Button></>}
        >
          <Field label={t("wallet.credentialName")}><input defaultValue="graph-production-02" /></Field>
          <Field label={t("wallet.apiKey")} hint={t("wallet.secretHint")}><input type="password" placeholder={t("wallet.secretPlaceholder")} /></Field>
        </Modal>
      )}
      {modal === "fund" && (
        <Modal
          title={t("wallet.fundTitle")}
          eyebrow={t("wallet.demoFunding")}
          onClose={() => setModal(null)}
          footer={<><Button onClick={() => setModal(null)}>{t("common.cancel")}</Button><Button variant="primary" onClick={() => setModal(null)}>{t("wallet.simulateDeposit")}</Button></>}
        >
          <div className="big-number">10.00 <span>USDC</span></div>
          <div className="inline-notice"><WarningCircle size={18} /><span>{t("wallet.noDeposit")}</span></div>
        </Modal>
      )}
      {modal === "policy" && (
        <Modal
          title={t("wallet.editPolicyTitle")}
          eyebrow={t("wallet.boundedDelegation")}
          onClose={() => setModal(null)}
          footer={<><Button onClick={() => setModal(null)}>{t("common.cancel")}</Button><Button variant="primary" onClick={() => setModal(null)}>{t("wallet.savePolicy")}</Button></>}
        >
          <div className="field-grid">
            <Field label={t("wallet.perRequest")}><input defaultValue="0.05 USDC" /></Field>
            <Field label={t("wallet.dailyCeiling")}><input defaultValue="5.00 USDC" /></Field>
          </div>
          <Field label={t("wallet.allowedPayee")}><input defaultValue="The Graph x402" /></Field>
        </Modal>
      )}
    </div>
  );
}
